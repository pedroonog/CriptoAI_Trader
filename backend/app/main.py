import os
import json
import sqlite3
import asyncio
from datetime import datetime, timedelta
import pandas as pd

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.logger import add_log, get_logs
from app.services.analyzer import MarketAnalyzer
from app.services.portfolio import PortfolioManager
from typing import Dict, Any

import ccxt
import time 

# Variáveis globais para guardar a lista na memória
top_30_cache = []
top_30_last_update = 0
TOP_30_CACHE_DURATION = 300 # 5 minutos

def get_top_30_binance_volume():
    global top_30_cache, top_30_last_update
    current_time = time.time()
    
    if top_30_cache and (current_time - top_30_last_update < TOP_30_CACHE_DURATION):
        return top_30_cache
        
    fallback_list = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'MATIC']
    
    try:
        exchange = ccxt.binance()
        tickers = exchange.fetch_tickers()
        
        usdt_pairs = [
            (symbol, data['quoteVolume'])
            for symbol, data in tickers.items()
            if symbol.endswith('/USDT') and data['quoteVolume'] is not None
        ]
        
        sorted_pairs = sorted(usdt_pairs, key=lambda x: x[1], reverse=True)
        top_coins = [pair[0].split('/')[0] for pair in sorted_pairs[:40]]
        
        stablecoins = ['USDC', 'FDUSD', 'TUSD', 'USDP', 'BUSD', 'EUR']
        top_30 = [coin for coin in top_coins if coin not in stablecoins][:30]
        
        top_30_cache = top_30
        top_30_last_update = current_time
        
        return top_30
    except Exception as e:
        print(f"Erro ao buscar da Binance: {e}. Usando fallback.")
        if top_30_cache:
            return top_30_cache
        return fallback_list

app = FastAPI(title="CryptoAI Trader API")
analyzer = MarketAnalyzer()
portfolio = PortfolioManager()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TradeRequest(BaseModel):
    symbol: str
    action: str
    price: float
    amount_usd: float

SETTINGS_FILE = "settings.json"

def load_settings():
    default_settings = {
        "weight_rsi": 70,
        "weight_news": 30,
        "weight_trend": 30,       
        "weight_momentum": 35,     
        "weight_volume": 15,       
        "stop_loss_pct": 3.0,
        "take_profit_pct": 2.0,
        "trade_amount_usd": 20.0,
        "rsi_buy": 30,
        "rsi_sell": 70,
        "daily_goal_pct": 3.0
    }
    
    if not os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, "w") as f:
            json.dump(default_settings, f, indent=4)
        return default_settings
        
    try:
        with open(SETTINGS_FILE, "r") as f:
            settings = json.load(f)
            if "daily_goal_pct" not in settings:
                settings["daily_goal_pct"] = 3.0
                with open(SETTINGS_FILE, "w") as f_update:
                    json.dump(settings, f_update, indent=4)
            return settings
    except Exception:
        return default_settings

BOT_SETTINGS = load_settings()

@app.get("/api/logs")
def get_logs_route():
    return get_logs()

@app.get("/api/settings")
def get_settings():
    return load_settings()

@app.post("/api/settings")
def save_settings(new_settings: Dict[str, Any]):
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(new_settings, f, indent=4)
        return {"success": True, "message": "Configurações salvas com sucesso!"}
    except Exception as e:
        return {"success": False, "error": str(e)}

bot_running = False
bot_task = None

async def auto_trade_loop():
    while bot_running:
        symbols_to_scan = get_top_30_binance_volume()
        settings = load_settings()
        stop_loss_pct = settings.get("stop_loss_pct", 5.0)
        take_profit_pct = settings.get("take_profit_pct", 10.0)
        trade_amount_usd = settings.get("trade_amount_usd", 100.0)
        
        for symbol in symbols_to_scan:
            if not bot_running: 
                break
                
            try:
                add_log(f"🔍 [ROBÔ] Analisando {symbol}...")
                
                analysis = analyzer.analyze_symbol(symbol,settings)
                rec = analysis.get('recommendation', 'AGUARDAR')
                price = analysis.get('current_price', 0)
                
                current_ai_score = analysis.get('ai_score', 0)
                current_rsi = analysis.get('rsi', 0)
                
                status = portfolio.get_status()
                coin_balance = status['positions'].get(symbol, 0.0)
                
                last_buy_price = 0.0
                history = status.get('history', [])
                for trade in history:
                    if trade['symbol'] == symbol and trade['action'] == "COMPRAR":
                        last_buy_price = trade['price']
                        break
                
                if coin_balance > 0 and last_buy_price > 0:
                    profit_pct = ((price - last_buy_price) / last_buy_price) * 100
                    
                    if profit_pct <= -stop_loss_pct:
                        add_log(f"🛑 [ROBÔ] STOP LOSS para {symbol}! Prejuízo: {profit_pct:.2f}%")
                        portfolio.execute_trade(symbol, "VENDER", price, 0, reason="Stop Loss", profit_pct=profit_pct)
                        continue
                        
                    elif profit_pct >= take_profit_pct:
                        add_log(f"🎯 [ROBÔ] TAKE PROFIT {symbol}! Lucro: {profit_pct:.2f}%")
                        portfolio.execute_trade(symbol, "VENDER", price, 0, reason="Take Profit", profit_pct=profit_pct)
                        continue
                
                if rec == "COMPRAR":
                    add_log(f"🚀 [ROBÔ] Sinal de COMPRA {symbol}!")
                    portfolio.execute_trade(symbol, "COMPRAR", price, trade_amount_usd, reason="Sinal da IA", profit_pct=0.0)
                    
                elif rec == "VENDER" and coin_balance > 0:
                    add_log(f"📉 [ROBÔ] Sinal de VENDA {symbol}!")
                    profit_pct = ((price - last_buy_price) / last_buy_price) * 100 if last_buy_price > 0 else 0.0
                    portfolio.execute_trade(symbol, "VENDER", price, 0, reason="Sinal da IA", profit_pct=profit_pct)
                    
            except Exception as e:
                add_log(f"⚠️ Erro ao analisar {symbol}: {e}")
                
            await asyncio.sleep(2)

@app.post("/api/bot/toggle")
async def toggle_bot():
    global bot_running, bot_task
    bot_running = not bot_running
    if bot_running:
        print("🟢 IGNIÇÃO: Dando a partida no motor do robô...")
        bot_task = asyncio.create_task(auto_trade_loop())
    else:
        print("🔴 IGNIÇÃO: Desligando o motor do robô...")
    return {"running": bot_running}

@app.get("/api/bot/status")
def get_bot_status():
    return {"running": bot_running}

@app.post("/api/trading/panic")
async def execute_panic():
    global portfolio
    try:
        result = portfolio.execute_panic()  # ← Chama o novo método
        return result
    except Exception as e:
        print(f"⚠️ Erro ao executar pânico: {e}")
        return {"success": False, "error": str(e)}
    
@app.get("/")
def read_root():
    return {"message": "Welcome to CryptoAI Trader API"}

@app.get("/api/market/price/{symbol}")
def get_price(symbol: str):
    try:
        exchange = ccxt.binance()
        formatted_symbol = f"{symbol.upper()}/USDT"
        ticker = exchange.fetch_ticker(formatted_symbol)
        return {
            "symbol": formatted_symbol,
            "price": ticker['last'],
            "change_24h": ticker['percentage']
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/market/analyze/{symbol}")
def analyze_market(symbol: str):
    return analyzer.analyze_symbol(symbol, load_settings())

@app.get("/api/market/early-momentum")
def get_early_momentum_route():
    try:
        momentum = get_early_momentum(min_volume_ratio=3.0, max_results=15)
        return momentum
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/portfolio")
def get_portfolio():
    return portfolio.get_status()

@app.post("/api/trading/execute")
def execute_trade(req: TradeRequest):
    return portfolio.execute_trade(req.symbol, req.action, req.price, req.amount_usd)

@app.get("/api/market/history/{symbol}")
def get_history(symbol: str):
    try:
        exchange = ccxt.binance()
        formatted_symbol = f"{symbol.upper()}/USDT"
        bars = exchange.fetch_ohlcv(formatted_symbol, timeframe='1h', limit=100)
        
        formatted_data = []
        for bar in bars:
            open_price = bar[1]
            close_price = bar[4]
            change_pct = ((close_price - open_price) / open_price) * 100 if open_price > 0 else 0
            formatted_data.append({
                "time": int(bar[0] / 1000), 
                "open": open_price, 
                "high": bar[2], 
                "low": bar[3], 
                "close": close_price,
                "change_pct": round(change_pct, 2)
            })
        return formatted_data
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/portfolio/profit")
def get_profit(days: int = 7):
    try:
        conn = sqlite3.connect("trades.db")
        cursor = conn.cursor()
        cursor.execute('SELECT action, symbol, price, time FROM history')
        rows = cursor.fetchall()
        conn.close()
        
        total_profit = 0.0
        trades_in_period = 0
        for r in rows:
            action, symbol, price, time_str = r
            trades_in_period += 1
            if action == "VENDER":
                total_profit += 2.50 
            elif action == "COMPRAR":
                total_profit -= 0.50 
                
        multiplier = 1 if days == 0 else (days / 30) if days <= 30 else 1
        calculated_profit = total_profit * multiplier
        
        return {
            "period": f"{days} dias" if days > 0 else "Hoje",
            "profit": round(calculated_profit, 2),
            "trades_count": int(trades_in_period * multiplier)
        }
    except Exception as e:
        return {"profit": 0.0, "trades_count": 0, "error": str(e)}

@app.get("/api/backtest")
def run_backtest(symbol: str = "BTC", days: int = 30):
    try:
        exchange = ccxt.binance()
        formatted_symbol = f"{symbol.upper()}/USDT"
        limit = days * 24
        if limit > 1000: limit = 1000 
        
        bars = exchange.fetch_ohlcv(formatted_symbol, timeframe='1h', limit=limit)
        df = pd.DataFrame(bars, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        
        delta = df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        df['rsi'] = 100 - (100 / (1 + rs))
        
        initial_capital = 10000.0
        capital = initial_capital
        position = 0.0
        trades = []
        winning_trades = 0
        
        for i in range(14, len(df)):
            price = df['close'].iloc[i]
            rsi = df['rsi'].iloc[i]
            time_str = datetime.fromtimestamp(df['timestamp'].iloc[i] / 1000).strftime('%d/%m/%Y %H:%M')
            
            if rsi < 30 and position == 0:
                amount_to_invest = capital * 0.20 
                position = amount_to_invest / price
                capital -= amount_to_invest
                buy_price = price
                trades.append({"action": "COMPRAR", "price": price, "time": time_str, "profit": 0})
                
            elif rsi > 70 and position > 0:
                sell_value = position * price
                profit = sell_value - (position * buy_price)
                if profit > 0: winning_trades += 1
                capital += sell_value
                position = 0
                trades.append({"action": "VENDER", "price": price, "time": time_str, "profit": round(profit, 2)})
                
        final_capital = capital + (position * df['close'].iloc[-1])
        total_profit = final_capital - initial_capital
        win_rate = (winning_trades / (len(trades) / 2)) * 100 if len(trades) > 0 else 0
        
        return {
            "symbol": symbol,
            "days": days,
            "initial_capital": initial_capital,
            "final_capital": round(final_capital, 2),
            "total_profit": round(total_profit, 2),
            "total_trades": len(trades),
            "win_rate": round(win_rate, 2),
            "trades": trades[-10:] 
        }
    except Exception as e:
        return {"error": str(e)}

# === ROTA DE RELATÓRIOS (AGORA LENDO AS NOVAS COLUNAS!) ===
@app.get("/api/reports")
def get_reports(coin: str = "ALL"):
    try:
        conn = sqlite3.connect("trades.db")
        cursor = conn.cursor()
        
        # Agora buscamos as colunas novas: ai_score, rsi, time_in_market
        query = "SELECT id, action, symbol, price, time, amount_usd, reason, profit_pct, ai_score, rsi, time_in_market FROM history WHERE action='VENDER'"
        params = []
        
        if coin != "ALL":
            query += " AND symbol = ?"
            params.append(coin)
            
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        
        total_trades = len(rows)
        winning_trades = 0
        gross_profit = 0.0
        gross_loss = 0.0
        net_profit = 0.0
        
        coin_stats = {}
        trade_log = []
        
        for row in rows:
            # Desempacotando as 11 colunas
            t_id, action, symbol, price, t_time, amount_usd, reason, profit_pct, ai_score, rsi, time_in_market = row
            
            profit_pct_val = profit_pct if profit_pct else 0.0
            profit_usd = amount_usd - (amount_usd / (1 + (profit_pct_val / 100))) if profit_pct_val else 0.0
            
            net_profit += profit_usd
            
            if profit_usd > 0:
                winning_trades += 1
                gross_profit += profit_usd
            else:
                gross_loss += abs(profit_usd)
                
            if symbol not in coin_stats:
                coin_stats[symbol] = {"profit": 0.0, "wins": 0, "total": 0}
                
            coin_stats[symbol]["profit"] += profit_usd
            coin_stats[symbol]["total"] += 1
            if profit_usd > 0:
                coin_stats[symbol]["wins"] += 1
                
            entry_price = price / (1 + (profit_pct_val/100)) if profit_pct_val else price
                
            trade_log.append({
                "id": t_id,
                "coin": symbol,
                "action": action,
                "entryPrice": entry_price,
                "exitPrice": price,
                "profitPct": round(profit_pct_val, 2),
                "profitUsd": round(profit_usd, 2),
                "timeInMarket": time_in_market if time_in_market else "-",
                "aiScore": round(ai_score, 1) if ai_score else "-",
                "rsi": round(rsi, 1) if rsi else "-",
                "reason": reason if reason else "Manual",
                "date": t_time
            })
            
        win_rate = (winning_trades / total_trades * 100) if total_trades > 0 else 0.0
        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (gross_profit if gross_profit > 0 else 0.0)
        
        avg_win = gross_profit / winning_trades if winning_trades > 0 else 0.0
        avg_loss = gross_loss / (total_trades - winning_trades) if (total_trades - winning_trades) > 0 else 0.0
        risk_reward = f"1 : {round(avg_win / avg_loss, 2)}" if avg_loss > 0 else "1 : 0"
        
        sorted_coins = sorted(coin_stats.items(), key=lambda x: x[1]["profit"], reverse=True)
        best_coins = []
        worst_coins = []
        
        for sym, stats in sorted_coins:
            c_win_rate = (stats["wins"] / stats["total"] * 100) if stats["total"] > 0 else 0
            obj = {"symbol": sym, "profit": round(stats["profit"], 2), "winRate": round(c_win_rate, 1)}
            if stats["profit"] >= 0:
                best_coins.append(obj)
            else:
                worst_coins.append(obj)
                
        worst_coins = sorted(worst_coins, key=lambda x: x["profit"]) 
        
        return {
            "globalMetrics": {
                "winRate": round(win_rate, 1),
                "profitFactor": round(profit_factor, 2),
                "riskReward": risk_reward,
                "maxDrawdown": 0.0, 
                "totalTrades": total_trades,
                "netProfit": round(net_profit, 2)
            },
            "assetAnalysis": {
                "bestCoins": best_coins[:3],
                "worstCoins": worst_coins[:3],
                "marketState": [
                    {"state": "Operações Registradas", "profit": round(net_profit, 2), "trades": total_trades}
                ]
            },
            "tradeLog": trade_log[::-1] 
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/market/overview")
def get_market_overview():
    try:
        exchange = ccxt.binance()
        top_30 = get_top_30_binance_volume()
        
        # ✅ Pega TODOS os tickers de uma vez (sem passar lista de símbolos)
        all_tickers = exchange.fetch_tickers()
        
        result = []
        for coin in top_30:
            sym = f"{coin}/USDT"
            data = all_tickers.get(sym)
            if data and data.get('last'):
                try:
                    bars = exchange.fetch_ohlcv(sym, timeframe='1h', limit=20)
                    df = pd.DataFrame(bars, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
                    delta = df['close'].diff()
                    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
                    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
                    rs = gain / loss
                    current_rsi = (100 - (100 / (1 + rs))).iloc[-1]
                    if current_rsi < 30: ai_signal = "COMPRAR"
                    elif current_rsi > 70: ai_signal = "VENDER"
                    else: ai_signal = "AGUARDAR"
                except:
                    ai_signal = "AGUARDAR"
                    
                result.append({
                    "symbol": coin,
                    "price": data['last'],
                    "change_24h": data['percentage'],
                    "volume": data['quoteVolume'],
                    "ai_signal": ai_signal
                })
                
        result = sorted(result, key=lambda x: x['volume'] if x['volume'] else 0, reverse=True)
        return result
    except Exception as e:
        return {"error": str(e)}