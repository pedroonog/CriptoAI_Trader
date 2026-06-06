import ccxt
import os
import sqlite3
import urllib.request
import urllib.parse
import time as time_module
import json
import threading
from dotenv import load_dotenv
from datetime import datetime, timedelta
from app.logger import add_log

load_dotenv()

top_30_cache = []
top_30_last_update = 0
TOP_30_CACHE_DURATION = 300

def get_top_30_binance_volume():
    global top_30_cache, top_30_last_update
    current_time = time_module.time()
    
    if top_30_cache and (current_time - top_30_last_update < TOP_30_CACHE_DURATION):
        return top_30_cache

    try:
        exchange = ccxt.binance()
        tickers = exchange.fetch_tickers()
        
        usdt_pairs = {symbol: data for symbol, data in tickers.items() if symbol.endswith('/USDT')}
        
        sorted_pairs = sorted(usdt_pairs.items(), key=lambda x: x[1].get('quoteVolume', 0), reverse=True)
        
        top_coins = [symbol.split('/')[0] for symbol, data in sorted_pairs[:40]]
        
        stablecoins = ['USDC', 'FDUSD', 'TUSD', 'USDP', 'BUSD', 'EUR']
        top_30 = [coin for coin in top_coins if coin not in stablecoins]
        
        resultado = top_30[:30]
        
        top_30_cache = resultado
        top_30_last_update = current_time
        
        return resultado
    except Exception as e:
        print(f"Erro ao buscar Top 30: {e}")
        if top_30_cache:
            return top_30_cache
        return ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'MATIC']

# Cache para early momentum
early_momentum_cache = []
early_momentum_last_update = 0
EARLY_MOMENTUM_CACHE_DURATION = 120  # 2 minutos

def get_early_momentum(min_volume_ratio=3.0, max_results=10):
    """Detecta moedas com início de movimento (momentum early)
    
    - Moeda subiu entre +0.3% e +3% nos últimos 30 min
    - Volume > 3x a média dos últimos candles
    - Está acelerando (subiu mais nos últimos 15 min)
    """
    global early_momentum_cache, early_momentum_last_update
    current_time = time_module.time()
    
    if early_momentum_cache and (current_time - early_momentum_last_update < EARLY_MOMENTUM_CACHE_DURATION):
        return early_momentum_cache
    
    try:
        exchange = ccxt.binance()
        all_tickers = exchange.fetch_tickers()
        
        # Pega os top 100 por volume para filtrar (evita moedas sem liquidez)
        usdt_pairs = {sym: data for sym, data in all_tickers.items() 
                      if sym.endswith('/USDT') and data.get('quoteVolume', 0) > 100000}
        sorted_by_vol = sorted(usdt_pairs.items(), 
                              key=lambda x: x[1].get('quoteVolume', 0), reverse=True)
        top_symbols = [sym for sym, _ in sorted_by_vol[:80]]
        
        candidates = []
        
        for sym in top_symbols:
            try:
                # Pega velas de 15 minutos (3 velas = 45 min de histórico)
                ohlcv = exchange.fetch_ohlcv(sym, timeframe='15m', limit=3)
                if len(ohlcv) < 3:
                    continue
                
                close_agora = ohlcv[-1][4]        # Preço agora (vela mais recente)
                close_15min_atras = ohlcv[-2][4]   # Preço 15 min atrás
                close_30min_atras = ohlcv[0][4]    # Preço 30 min atrás
                
                # Variação nos últimos 30 min
                change_30m = ((close_agora - close_30min_atras) / close_30min_atras) * 100
                
                # Variação nos últimos 15 min (pra ver se acelerou)
                change_15m = ((close_agora - close_15min_atras) / close_15min_atras) * 100
                change_anterior = ((close_15min_atras - close_30min_atras) / close_30min_atras) * 100
                
                # Volume atual vs média
                volumes = [c[5] for c in ohlcv]
                avg_volume = sum(volumes[:-1]) / (len(volumes) - 1) if len(volumes) > 1 else 0
                current_volume = volumes[-1]
                volume_ratio = current_volume / avg_volume if avg_volume > 0 else 0
                
                # Critérios de entrada precoce:
                # 1. Subiu entre +0.3% e +3% nos últimos 30 min
                # 2. Volume > 3x a média
                # 3. Está acelerando (movimento recente >= movimento anterior)
                # 4. Preço acima de $0.01 (evita moedas micro)
                
                coin = sym.replace('/USDT', '')
                
                if (0.3 <= change_30m <= 3.0 and
                    volume_ratio >= min_volume_ratio and
                    change_15m >= change_anterior and
                    close_agora > 0.01):
                    
                    candidates.append({
                        'symbol': coin,
                        'price': round(close_agora, 8),
                        'change_30m': round(change_30m, 2),
                        'change_15m': round(change_15m, 2),
                        'volume_ratio': round(volume_ratio, 1),
                        'volume_24h': all_tickers[sym].get('quoteVolume', 0)
                    })
                    
            except Exception:
                continue  # Pula moedas com erro e segue
        
        # Ordena por volume_ratio (maior impulso primeiro)
        candidates.sort(key=lambda x: x['volume_ratio'], reverse=True)
        
        early_momentum_cache = candidates[:max_results]
        early_momentum_last_update = current_time
        
        return early_momentum_cache
        
    except Exception as e:
        print(f"Erro ao buscar early momentum: {e}")
        if early_momentum_cache:
            return early_momentum_cache
        return []

class PortfolioManager:
    def __init__(self):
        self.exchange = ccxt.binance({
            'apiKey': os.getenv('BINANCE_API_KEY'),
            'secret': os.getenv('BINANCE_SECRET_KEY'),
            'enableRateLimit': True,
        })
        
        self.exchange.set_sandbox_mode(True)
        
        self.db_path = "trades.db"
        self._init_db()
        
        # Inicia o robô do Telegram em background
        threading.Thread(target=self._start_telegram_polling, daemon=True).start()
        threading.Thread(target=self._daily_summary_loop, daemon=True).start()
        print("🤖 Telegram Bot: Modo Interativo e Resumo Diário ativados!")

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT,
                symbol TEXT,
                price REAL,
                time TEXT
            )
        ''')
        try:
            cursor.execute('ALTER TABLE history ADD COLUMN amount_coin REAL DEFAULT 0')
            cursor.execute('ALTER TABLE history ADD COLUMN amount_usd REAL DEFAULT 0')
            cursor.execute('ALTER TABLE history ADD COLUMN reason TEXT DEFAULT ""')
            cursor.execute('ALTER TABLE history ADD COLUMN profit_pct REAL DEFAULT 0')
            cursor.execute('ALTER TABLE history ADD COLUMN ai_score REAL DEFAULT 0')
            cursor.execute('ALTER TABLE history ADD COLUMN rsi REAL DEFAULT 0')
            cursor.execute('ALTER TABLE history ADD COLUMN time_in_market TEXT DEFAULT "-"')
        except:
            pass
        conn.commit()
        conn.close()

    def _send_telegram_alert(self, message):
        """Envia mensagem para o chat configurado (usado para alertas automáticos)"""
        token = os.getenv('TELEGRAM_BOT_TOKEN')
        chat_id = os.getenv('TELEGRAM_CHAT_ID')
        if not token or not chat_id:
            return
        try:
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            data = urllib.parse.urlencode({
                'chat_id': chat_id,
                'text': message,
                'parse_mode': 'HTML'
            }).encode('utf-8')
            req = urllib.request.Request(url, data=data)
            with urllib.request.urlopen(req) as response:
                pass
        except Exception as e:
            print(f"Erro ao enviar Telegram: {e}")

    def _send_telegram_to(self, chat_id, message):
        """Envia mensagem para um chat específico"""
        token = os.getenv('TELEGRAM_BOT_TOKEN')
        if not token:
            return
        try:
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            data = urllib.parse.urlencode({
                'chat_id': chat_id,
                'text': message,
                'parse_mode': 'HTML'
            }).encode('utf-8')
            req = urllib.request.Request(url, data=data)
            with urllib.request.urlopen(req) as response:
                pass
        except Exception as e:
            print(f"Erro ao enviar Telegram: {e}")

    # ===================== NOVIDADE: CENTRO DE COMANDO TELEGRAM =====================

    def _start_telegram_polling(self):
        """Loop que escuta comandos do Telegram em tempo real"""
        token = os.getenv('TELEGRAM_BOT_TOKEN')
        allowed_chat_id = os.getenv('TELEGRAM_CHAT_ID')
        if not token or not allowed_chat_id:
            return

        last_update_id = 0
        time_module.sleep(5)  # Espera o sistema iniciar

        while True:
            try:
                url = f"https://api.telegram.org/bot{token}/getUpdates?offset={last_update_id + 1}&timeout=30"
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req) as response:
                    data = json.loads(response.read().decode('utf-8'))

                for update in data.get('result', []):
                    last_update_id = update['update_id']
                    msg = update.get('message', {})
                    text = msg.get('text', '')
                    chat_id = str(msg.get('chat', {}).get('id', ''))

                    # Só responde ao seu chat autorizado
                    if chat_id == allowed_chat_id and text.startswith('/'):
                        resposta = self._process_telegram_command(text)
                        self._send_telegram_to(chat_id, resposta)

            except Exception as e:
                    # Ignora erros de conexão (reconexão automática)
                    if "10054" not in str(e):
                        print(f"Erro no polling Telegram: {e}")
                    time_module.sleep(10)

            time_module.sleep(0.5)

    def _daily_summary_loop(self):
        """Envia resumo automático todo dia às 20h"""
        allowed_chat_id = os.getenv('TELEGRAM_CHAT_ID')
        if not allowed_chat_id:
            return

        while True:
            try:
                agora = datetime.now()
                # Calcula o tempo até as 20:00 de hoje
                target = agora.replace(hour=20, minute=0, second=0, microsecond=0)
                if agora >= target:
                    target += timedelta(days=1)  # Já passou, agenda para amanhã
                
                wait_seconds = (target - agora).total_seconds()
                print(f"⏰ Resumo diário agendado para {target.strftime('%H:%M')} (em {wait_seconds/3600:.1f}h)")
                time_module.sleep(wait_seconds)
                
                # Gera e envia o resumo
                resumo = self._generate_daily_report()
                self._send_telegram_to(allowed_chat_id, resumo)
                
                # Espera 1 minuto para não re-enviar no mesmo segundo
                time_module.sleep(60)

            except Exception as e:
                print(f"Erro no resumo diário: {e}")
                time_module.sleep(60)

    def _process_telegram_command(self, command):
        """Processa um comando do Telegram e retorna a resposta"""
        cmd = command.lower().split()[0]

        if cmd == '/status':
            return self._cmd_status()
        elif cmd == '/positions':
            return self._cmd_positions()
        elif cmd == '/profit':
            return self._cmd_profit()
        elif cmd == '/panic':
            return "🚨 <b>CONFIRMAÇÃO NECESSÁRIA</b>\n\nDigite:\n<code>/panic_confirmar</code>\n\nPara VENDER TODAS as posições imediatamente!"
        elif cmd == '/panic_confirmar':
            self.close_all_positions()
            return "🚨 <b>MODO PÂNICO ATIVADO!</b>\n\nTodas as posições foram vendidas a mercado. 💸"
        elif cmd == '/trades':
            return self._cmd_trades()
        elif cmd == '/meta':
            return self._cmd_meta()
        elif cmd in ['/help', '/start']:
            return self._cmd_help()
        else:
            return f"❌ Comando desconhecido: <code>{command}</code>\n\nDigite /help para ver os comandos disponíveis."

    def _cmd_help(self):
        return """🤖 <b>COMANDOS DO ROBO</b>
━━━━━━━━━━━━━━━━━━
📊 <code>/status</code> - Saldo total e lucro do dia
🪙 <code>/positions</code> - Posições abertas detalhadas
💰 <code>/profit</code> - Lucro (Hoje, 7d, 30d)
📋 <code>/trades</code> - Últimas 5 operações
🎯 <code>/meta</code> - Progresso da meta diária
🚨 <code>/panic</code> - VENDER TUDO (emergência)
❓ <code>/help</code> - Esta mensagem"""

    def _cmd_status(self):
        status = self.get_status()
        balance = status.get('balance', 0)
        total_equity = status.get('total_equity', 0)
        total_positions = len(status.get('positions', {}))

        profit_hoje = self._get_profit_from_db(days=0)
        profit_pct = (profit_hoje / (total_equity - profit_hoje) * 100) if (total_equity - profit_hoje) > 0 else 0
        sinal = "+" if profit_hoje >= 0 else ""
        emoji = "🟢" if profit_hoje >= 0 else "🔴"

        return f"""{emoji} <b>STATUS DO ROBO</b>
━━━━━━━━━━━━━━━━━━
💰 Saldo Total: <b>${total_equity:,.2f}</b>
💵 Caixa: ${balance:,.2f}
🪙 Posições Abertas: <b>{total_positions}</b>

📈 Lucro Hoje: <b>{sinal}${profit_hoje:,.2f} ({sinal}{profit_pct:.2f}%)</b>"""

    def _cmd_positions(self):
        status = self.get_status()
        positions = status.get('positions', {})

        if not positions:
            return "📭 <b>Posições:</b> Nenhuma moeda na carteira no momento."

        linhas = []
        total_pnl = 0.0

        try:
            tickers = self.exchange.fetch_tickers([f"{c}/USDT" for c in positions.keys()])
        except:
            tickers = {}

        for coin, amount in positions.items():
            current_price = tickers.get(f"{coin}/USDT", {}).get('last', 0)

            # Busca o preço de compra no histórico
            entry_price = 0
            try:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                cursor.execute("SELECT price FROM history WHERE symbol = ? AND action = 'COMPRAR' ORDER BY id DESC LIMIT 1", (coin,))
                row = cursor.fetchone()
                conn.close()
                if row:
                    entry_price = row[0]
            except:
                pass

            if entry_price > 0 and current_price > 0:
                pnl_pct = ((current_price - entry_price) / entry_price) * 100
                pnl_usd = (current_price - entry_price) * amount
                total_pnl += pnl_usd
                sinal = "+" if pnl_pct >= 0 else ""
                emoji_pnl = "🟢" if pnl_pct >= 0 else "🔴"
                linhas.append(f"{emoji_pnl} <b>{coin}</b>: {amount:.4f}\n   Entrada: ${entry_price:.4f} | Atual: ${current_price:.4f}\n   P&L: <b>{sinal}{pnl_pct:.2f}% ({sinal}${pnl_usd:.2f})</b>")

        total_sinal = "+" if total_pnl >= 0 else ""
        total_emoji = "🟢" if total_pnl >= 0 else "🔴"

        return f"📊 <b>POSIÇÕES ABERTAS ({len(positions)})</b>\n━━━━━━━━━━━━━━━━━━\n\n" + "\n\n".join(linhas) + f"\n\n{total_emoji} <b>P&L Total: {total_sinal}${total_pnl:.2f}</b>"

    def _cmd_profit(self):
        hoje = self._get_profit_from_db(days=0)
        dias7 = self._get_profit_from_db(days=7)
        dias30 = self._get_profit_from_db(days=30)

        def fmt(val):
            sinal = "+" if val >= 0 else ""
            emoji = "🟢" if val >= 0 else "🔴"
            return f"{emoji} {sinal}${val:,.2f}"

        return f"""💰 <b>RESULTADO FINANCEIRO</b>
━━━━━━━━━━━━━━━━━━
📅 Hoje: {fmt(hoje)}
📅 7 Dias: {fmt(dias7)}
📅 30 Dias: {fmt(dias30)}"""

    def _cmd_trades(self):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT action, symbol, price, time, reason, profit_pct, time_in_market FROM history ORDER BY id DESC LIMIT 5")
            rows = cursor.fetchall()
            conn.close()
        except:
            return "❌ Erro ao acessar banco de dados."

        if not rows:
            return "📭 Nenhuma operação registrada ainda."

        linhas = []
        for row in rows:
            action, symbol, price, t_time, reason, profit_pct, time_in_market = row
            emoji = "🟢" if action == "COMPRAR" else "🔴"
            pct_str = ""
            if action == "VENDER" and profit_pct:
                sinal = "+" if profit_pct > 0 else ""
                pct_str = f" ({sinal}{profit_pct:.2f}%)"
            linhas.append(f"{emoji} <b>{action}</b> {symbol}\n   💰 ${price:,.4f}{pct_str}\n   ⏱️ {t_time} | {reason}")

        return f"📋 <b>ÚLTIMAS OPERAÇÕES</b>\n━━━━━━━━━━━━━━━━━━\n\n" + "\n\n".join(linhas)

    def _cmd_meta(self):
        status = self.get_status()
        total_equity = status.get('total_equity', 0)
        profit_hoje = self._get_profit_from_db(days=0)
        capital_inicial = total_equity - profit_hoje

        # Pega a meta das settings (padrão 3%)
        meta_pct = 3.0
        try:
            with open("settings.json", "r") as f:
                settings = json.load(f)
                meta_pct = settings.get("daily_goal_pct", 3.0)
        except:
            pass

        profit_pct = (profit_hoje / capital_inicial * 100) if capital_inicial > 0 else 0
        progresso = min((profit_pct / meta_pct) * 100, 100)
        sinal = "+" if profit_hoje >= 0 else ""

        # Barra de progresso visual
        bar_length = 15
        filled = int(progresso / 100 * bar_length)
        bar = "▓" * filled + "░" * (bar_length - filled)

        atingiu = "🏆 <b>META ATINGIDA!</b>" if progresso >= 100 else ""

        return f"""🎯 <b>META DIARIA</b>
━━━━━━━━━━━━━━━━━━
📊 Progresso: {progresso:.1f}%
{bar} {sinal}{profit_pct:.2f}%

🎯 Alvo: {meta_pct}%
💰 Lucro Hoje: {sinal}${profit_hoje:,.2f}

{atingiu}"""

    def _get_profit_from_db(self, days=0):
        """Calcula o lucro real baseado nas vendas do banco de dados"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            if days == 0:
                hoje = datetime.now().strftime("%Y-%m-%d")
                cursor.execute("SELECT profit_pct, amount_usd FROM history WHERE action='VENDER' AND time LIKE ?", (f"{hoje}%",))
            else:
                data_limite = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
                cursor.execute("SELECT profit_pct, amount_usd FROM history WHERE action='VENDER' AND time >= ?", (data_limite,))

            rows = cursor.fetchall()
            conn.close()

            total = 0.0
            for pct, usd in rows:
                if pct and usd:
                    total += usd - (usd / (1 + (pct / 100)))
            return total
        except:
            return 0.0

    def _generate_daily_report(self):
        """Gera o relatório resumido do dia"""
        status = self.get_status()
        total_equity = status.get('total_equity', 0)
        positions_count = len(status.get('positions', {}))

        profit_hoje = self._get_profit_from_db(days=0)
        profit_pct = (profit_hoje / (total_equity - profit_hoje) * 100) if (total_equity - profit_hoje) > 0 else 0
        sinal = "+" if profit_hoje >= 0 else ""
        emoji_dia = "🟢" if profit_hoje >= 0 else "🔴"

        # Busca últimas vendas do dia para melhores/piores
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            hoje = datetime.now().strftime("%Y-%m-%d")
            cursor.execute("SELECT symbol, profit_pct, reason FROM history WHERE action='VENDER' AND time LIKE ? ORDER BY profit_pct DESC", (f"{hoje}%",))
            vendas = cursor.fetchall()
            conn.close()
            total_trades = len(vendas)
            wins = sum(1 for v in vendas if v[1] and v[1] > 0)
            best = vendas[0] if vendas else None
            worst = vendas[-1] if vendas else None
        except:
            total_trades = 0
            wins = 0
            best = None
            worst = None

        win_rate = (wins / total_trades * 100) if total_trades > 0 else 0

        # Melhor e pior do dia
        melhor = f"🏆 {best[0]} ({'+' if best[1] and best[1] > 0 else ''}{best[1]:.2f}%)" if best else "Nenhum"
        pior = f"📉 {worst[0]} ({worst[1]:.2f}%)" if worst and worst[1] and worst[1] < 0 else "Nenhum"

        return f"""{emoji_dia} <b>RESUMO DO DIA</b>
━━━━━━━━━━━━━━━━━━
<b>{datetime.now().strftime('%d/%m/%Y')}</b>

💰 Lucro: <b>{sinal}${profit_hoje:,.2f} ({sinal}{profit_pct:.2f}%)</b>
📊 Win Rate: <b>{win_rate:.0f}%</b>
📋 Trades: {total_trades}
🪙 Posições Abertas: {positions_count}

🏆 Melhor: {melhor}
📉 Pior: {pior}
━━━━━━━━━━━━━━━━━━
🤖 CryptoAI Trader"""

    # ===================== FUNÇÕES EXISTENTES (MANTIDAS) =====================
    def execute_panic(self):
        print("🚨 MODO PÂNICO: Fechando todas as posições!")
        try:
            status = self.get_status()
            positions = status.get('positions', {})

            if not positions:
                print("✅ Nenhuma posição aberta. Tudo seguro.")
                return {"success": True, "message": "Nenhuma posição aberta. Capital 100% em USDT."}

            # ✅ Pega TODOS os tickers de uma vez (evita o erro de symbols)
            all_tickers = self.exchange.fetch_tickers()
            
            sold_count = 0
            for sym, amount in positions.items():
                ticker_symbol = f"{sym.upper()}/USDT"
                if ticker_symbol in all_tickers:
                    current_price = all_tickers[ticker_symbol]['last']
                    if current_price:
                        # ✅ ADICIONE ESTA LINHA AQUI:
                        add_log(f"🚨 PÂNICO: Vendendo {sym} a ${current_price:.4f}")
                        
                        self.execute_trade(
                            symbol=sym.upper(),
                            action="VENDER",
                            price=current_price,
                            amount_usd=0,
                            reason="🚨 PÂNICO"
                        )
                        sold_count += 1
                        print(f"✅ Vendido {sym} a ${current_price:.4f}")
                    if not positions:
                        add_log("✅ PÂNICO: Nenhuma posição aberta. Tudo seguro.")
                        return {"success": True, "message": "Nenhuma posição aberta. Capital 100% em USDT."}

            return {"success": True, "message": f"Pânico concluído! {sold_count} posições fechadas."}

        except Exception as e:
            print(f"⚠️ Erro ao fechar posições: {e}")
            return {"success": False, "error": str(e)}    

    def get_trade_history(self):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('SELECT action, symbol, price, time, amount_coin, amount_usd, reason, profit_pct FROM history ORDER BY id DESC LIMIT 20')
            rows = cursor.fetchall()
            conn.close()
            history = []
            for row in rows:
                history.append({
                    "action": row[0],
                    "symbol": row[1],
                    "price": row[2],
                    "time": row[3],
                    "amount_coin": row[4],
                    "amount_usd": row[5],
                    "reason": row[6],
                    "profit_pct": row[7]
                })
            return history
        except Exception as e:
            print(f"Erro ao ler histórico: {e}")
            return []

    def get_status(self):
        try:
            balance = self.exchange.fetch_balance()
            free_usdt = balance['free'].get('USDT', 0.0)
            positions = {}
            todas_as_moedas = get_top_30_binance_volume()
            for coin in todas_as_moedas:
                amt = balance['total'].get(coin, 0.0)
                if amt > 0.00001:
                    positions[coin] = amt
            total_equity = free_usdt
            if positions:
                try:
                    tickers = self.exchange.fetch_tickers()
                    for coin, amt in positions.items():
                        symbol = f"{coin}/USDT"
                        if symbol in tickers and tickers[symbol]['last'] is not None:
                            total_equity += amt * tickers[symbol]['last']
                except Exception as e:
                    print(f"Erro ao calcular preços: {e}")
            return {
                "balance": free_usdt,
                "total_equity": total_equity,
                "positions": positions,
                "history": self.get_trade_history()
            }
        except Exception as e:
            print(f"Erro fatal ao buscar status: {e}")
            return {"balance": 0.0, "total_equity": 0.0, "positions": {}, "history": []}

    def execute_trade(self, symbol, action, price, amount_usd, reason="Sinal da IA", profit_pct=0.0, ai_score=0.0, rsi=0.0):
        try:
            formatted_symbol = f"{symbol.upper()}/USDT"
            balance = self.exchange.fetch_balance()
            coin_balance = balance['total'].get(symbol.upper(), 0.0)
            amount_coin = 0.0
            time_in_market = "-"

            if action == "COMPRAR":
                coin_value_in_usd = coin_balance * price
                if coin_value_in_usd > 5.0:
                    print(f"⚠️ Ignorando compra de {symbol}: Já possuímos ${coin_value_in_usd:.2f} na carteira.")
                    return {"success": False, "error": "Já posicionado nesta moeda."}
                amount_coin = amount_usd / price
                order = self.exchange.create_market_buy_order(formatted_symbol, amount_coin)

            elif action == "VENDER":
                if coin_balance > 0:
                    amount_coin = coin_balance
                    amount_usd = amount_coin * price
                    order = self.exchange.create_market_sell_order(formatted_symbol, coin_balance)
                    try:
                        conn = sqlite3.connect(self.db_path)
                        cursor = conn.cursor()
                        cursor.execute("SELECT time FROM history WHERE symbol = ? AND action = 'COMPRAR' ORDER BY id DESC LIMIT 1", (symbol,))
                        last_buy = cursor.fetchone()
                        conn.close()
                        if last_buy:
                            buy_time_str = last_buy[0]
                            if len(buy_time_str) > 8:
                                buy_time = datetime.strptime(buy_time_str, "%Y-%m-%d %H:%M:%S")
                            else:
                                buy_time = datetime.strptime(buy_time_str, "%H:%M:%S").replace(year=datetime.now().year, month=datetime.now().month, day=datetime.now().day)
                            diff = datetime.now() - buy_time
                            days = diff.days
                            hours, remainder = divmod(diff.seconds, 3600)
                            minutes, _ = divmod(remainder, 60)
                            if days > 0: time_in_market = f"{days}d {hours}h"
                            elif hours > 0: time_in_market = f"{hours}h {minutes}m"
                            else: time_in_market = f"{minutes}m"
                    except Exception as e:
                        print(f"Erro ao calcular tempo de mercado: {e}")
                else:
                    return {"success": False, "error": "Você não tem saldo dessa moeda para vender."}
            else:
                return {"success": False, "error": "Ação inválida"}

            agora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO history (action, symbol, price, time, amount_coin, amount_usd, reason, profit_pct, ai_score, rsi, time_in_market)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (action, symbol, price, agora, amount_coin, amount_usd, reason, profit_pct, ai_score, rsi, time_in_market))
            conn.commit()
            conn.close()

            emoji = "🟢" if action == "COMPRAR" else "🔴"
            sinal = "+" if profit_pct > 0 else ""

            msg = f"🤖 ALERTA DE TRADE:\n\n{emoji} Ação: {action}\n🪙 Moeda: {symbol}\n💰 Preço: ${price:,.2f}\n📦 Quantidade: {amount_coin:.4f}\n💵 Valor Total: ${amount_usd:,.2f}\n"
            if action == "VENDER":
                msg += f"🎯 Motivo: {reason}\n📊 Resultado: {sinal}{profit_pct:.2f}%\n⏱️ Tempo: {time_in_market}\n"
            msg += f"⏰ Horário: {agora}"

                        # ANTES de enviar o Telegram, adicione:
            add_log(f"🤖 {action} {symbol} a ${price:.2f} | {reason}")

            # Depois mantém o envio do Telegram normal:
            self._send_telegram_alert(msg)

            return {"success": True, "message": f"Ordem de {action} executada na Binance!"}

        except Exception as e:
            print(f"Erro ao executar ordem na Binance: {e}")
            return {"success": False, "error": "Erro na corretora. Verifique as chaves de API."}