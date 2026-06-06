import ccxt
import pandas as pd
import urllib.request
import xml.etree.ElementTree as ET
import time as time_module


class MarketAnalyzer:
    def __init__(self):
        self.exchange = ccxt.binance()
        self.news_cache = {}
        self.cache_duration = 300

    def get_news_sentiment(self, symbol):
        current_time = time_module.time()

        if symbol in self.news_cache:
            cached_data, timestamp = self.news_cache[symbol]
            if current_time - timestamp < self.cache_duration:
                return cached_data

        coin_name = (
            "bitcoin" if symbol.upper() == "BTC"
            else "ethereum" if symbol.upper() == "ETH"
            else symbol.lower()
        )
        rss_url = f"https://cointelegraph.com/rss/tag/{coin_name}"

        try:
            req = urllib.request.Request(rss_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as response:
                xml_data = response.read()

            root = ET.fromstring(xml_data)
            headlines = [
                item.find("title").text
                for item in root.findall(".//item")[:5]
                if item.find("title") is not None
            ]

            bullish_words = ["surge", "bull", "high", "jump", "buy", "gain", "positive", "up",
                             "soar", "record", "rally", "approve", "breakthrough", "adoption", "inflow"]
            bearish_words = ["crash", "bear", "drop", "fall", "sell", "loss", "negative", "down",
                             "hack", "scam", "plunge", "ban", "fear", "outflow", "rejection"]

            score = 50

            for title in headlines:
                words = title.lower().split()
                for word in words:
                    if any(b in word for b in bullish_words):
                        score += 5
                    if any(b in word for b in bearish_words):
                        score -= 5

            score = max(0, min(100, score))
            label = "EUFORIA 🚀" if score >= 60 else "PÂNICO 😨" if score <= 40 else "NEUTRO ⚖️"

            result = {"score": score, "label": label, "headlines": headlines}
            self.news_cache[symbol] = (result, current_time)
            return result

        except Exception:
            return {"score": 50, "label": "NEUTRO ⚖️", "headlines": ["Aguardando novas notícias..."]}

    def _calculate_ema(self, df, period):
        """Calcula a Média Móvel Exponencial"""
        return df["close"].ewm(span=period, adjust=False).mean()

    def _calculate_macd(self, df):
        """Calcula MACD (12, 26, 9)"""
        ema_fast = self._calculate_ema(df, 12)
        ema_slow = self._calculate_ema(df, 26)
        macd_line = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=9, adjust=False).mean()
        histogram = macd_line - signal_line
        return macd_line.iloc[-1], signal_line.iloc[-1], histogram.iloc[-1]

    def _calculate_rsi(self, df, period=14):
        """Calcula o RSI e retorna a série completa"""
        delta = df["close"].diff()
        gain = delta.where(delta > 0, 0).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        # CORREÇÃO: evita divisão por zero quando loss == 0
        rs = gain / loss.replace(0, float("nan"))
        rsi = 100 - (100 / (1 + rs))
        return rsi

    def _analyze_trend(self, df):
        """
        CAMADA 1: TENDÊNCIA
        Analisa EMA rápida (9) vs EMA lenta (21) para determinar direção.
        Retorna: score 0-100
        """
        ema_fast = self._calculate_ema(df, 9)
        ema_slow = self._calculate_ema(df, 21)

        current_fast = ema_fast.iloc[-1]
        current_slow = ema_slow.iloc[-1]
        prev_fast = ema_fast.iloc[-2]
        prev_slow = ema_slow.iloc[-2]

        score = 50

        if current_fast > current_slow:
            gap_pct = ((current_fast - current_slow) / current_slow) * 100
            score += min(gap_pct * 5, 30)
        else:
            gap_pct = ((current_slow - current_fast) / current_slow) * 100
            score -= min(gap_pct * 5, 30)

        if prev_fast <= prev_slow and current_fast > current_slow:
            score += 20  # Golden Cross
        elif prev_fast >= prev_slow and current_fast < current_slow:
            score -= 20  # Death Cross

        current_price = df["close"].iloc[-1]
        if current_price > current_slow:
            score += 10
        else:
            score -= 10

        return max(0, min(100, score))

    def _analyze_momentum(self, df, settings):
        """
        CAMADA 2: MOMENTO
        Combina RSI (70%) + MACD (30%).
        Retorna: score 0-100
        """
        rsi_buy = settings.get("rsi_buy", 30)
        rsi_sell = settings.get("rsi_sell", 70)

        # CORREÇÃO: usa método centralizado _calculate_rsi
        rsi_series = self._calculate_rsi(df)
        current_rsi = rsi_series.iloc[-1]

        # Score do RSI (0-100)
        if current_rsi <= rsi_buy:
            rsi_score = 100
        elif current_rsi >= rsi_sell:
            rsi_score = 0
        elif current_rsi <= 50:
            rsi_score = 50 + ((50 - current_rsi) / (50 - rsi_buy)) * 50
        else:
            rsi_score = 50 - ((current_rsi - 50) / (rsi_sell - 50)) * 50

        rsi_score = max(0, min(100, rsi_score))

        # Score do MACD (0-100)
        macd_line, signal_line, histogram = self._calculate_macd(df)

        if macd_line > signal_line and histogram > 0:
            macd_score = 80
        elif macd_line > signal_line and histogram <= 0:
            macd_score = 60
        elif macd_line <= signal_line and histogram < 0:
            macd_score = 20
        else:
            macd_score = 40

        momentum_score = (rsi_score * 0.70) + (macd_score * 0.30)
        return max(0, min(100, momentum_score))

    def _analyze_volume(self, df):
        """
        CAMADA 3: VOLUME
        Compara volume atual com a média dos últimos 20 candles.
        Retorna: score 0-100
        """
        current_volume = df["volume"].iloc[-1]
        avg_volume = df["volume"].rolling(window=20).mean().iloc[-1]

        if not avg_volume or avg_volume == 0:
            return 50

        volume_ratio = current_volume / avg_volume

        if volume_ratio > 2.0:
            return 90
        elif volume_ratio > 1.5:
            return 75
        elif volume_ratio > 1.0:
            return 60
        elif volume_ratio > 0.5:
            return 40
        else:
            return 25

    def analyze_symbol(self, symbol, settings=None):
        default_settings = {
            "weight_trend": 30,
            "weight_momentum": 35,
            "weight_volume": 15,
            "weight_news": 20,
            "rsi_buy": 30,
            "rsi_sell": 70,
            "daily_goal_pct": 3.0,
        }

        if settings is None:
            settings = default_settings

        formatted_symbol = f"{symbol.upper()}/USDT"
        # MELHORIA: 100 candles para indicadores mais precisos (antes eram 50)
        bars = self.exchange.fetch_ohlcv(formatted_symbol, timeframe="1h", limit=100)
        df = pd.DataFrame(bars, columns=["timestamp", "open", "high", "low", "close", "volume"])

        current_price = df["close"].iloc[-1]

        # --- Análises ---
        trend_score = self._analyze_trend(df)
        momentum_score = self._analyze_momentum(df, settings)

        # CORREÇÃO: RSI calculado uma única vez (eliminado cálculo duplicado)
        rsi_series = self._calculate_rsi(df)
        current_rsi = rsi_series.iloc[-1]

        volume_score = self._analyze_volume(df)

        news = self.get_news_sentiment(symbol)
        news_score = news["score"]

        # --- Pesos ---
        weight_trend = settings.get("weight_trend", 30) / 100.0
        weight_momentum = settings.get("weight_momentum", 35) / 100.0
        weight_volume = settings.get("weight_volume", 15) / 100.0
        weight_news = settings.get("weight_news", 20) / 100.0

        total_weight = weight_trend + weight_momentum + weight_volume + weight_news
        if total_weight > 0:
            weight_trend /= total_weight
            weight_momentum /= total_weight
            weight_volume /= total_weight
            weight_news /= total_weight

        # --- Score Final ---
        ai_score = (
            trend_score * weight_trend
            + momentum_score * weight_momentum
            + volume_score * weight_volume
            + news_score * weight_news
        )

        # --- Sistema de Veto ---
        recommendation = "AGUARDAR"
        if trend_score < 25:
            recommendation = "AGUARDAR"
        elif volume_score < 30:
            recommendation = "AGUARDAR"
        else:
            if ai_score >= 65:
                recommendation = "COMPRAR"
            elif ai_score <= 35:
                recommendation = "VENDER"

        return {
            "current_price": current_price,
            "rsi": round(current_rsi, 2),
            "ai_score": round(ai_score, 2),
            "recommendation": recommendation,
            "news": news,
            "analysis_detail": {
                "trend_score": round(trend_score, 1),
                "momentum_score": round(momentum_score, 1),
                "volume_score": round(volume_score, 1),
                "news_score": round(news_score, 1),
                "weights": {
                    "trend": round(weight_trend * 100, 0),
                    "momentum": round(weight_momentum * 100, 0),
                    "volume": round(weight_volume * 100, 0),
                    "news": round(weight_news * 100, 0),
                },
            },
        }