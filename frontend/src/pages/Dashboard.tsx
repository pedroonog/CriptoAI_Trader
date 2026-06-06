import { useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { createChart } from 'lightweight-charts';

// Função para formatar os zeros de memecoins como SHIB e PEPE
function formatCryptoPrice(price: number) {
  if (!price) return "$0.00";
  if (price < 0.001) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 6, maximumFractionDigits: 8 }).format(price);
  } else if (price < 1) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 }).format(price);
  } else {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(price);
  }
}

export default function Dashboard() {
  const [selectedCoin, setSelectedCoin] = useState('BTC');
  const [analysis, setAnalysis] = useState<any>(null);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [profitData, setProfitData] = useState<any>({ profit: 0, trades_count: 0 });
  const [profitFilter, setProfitFilter] = useState(0); 
  
  const [loading, setLoading] = useState(true);
  const [tradeMessage, setTradeMessage] = useState("");
  const [apiError, setApiError] = useState<any>(null);
  const [botRunning, setBotRunning] = useState(false);
  
  const [isSaving, setIsSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    weight_trend: 30, weight_momentum: 35, weight_volume: 15, weight_news: 20, stop_loss_pct: 3.0, take_profit_pct: 2.0, trade_amount_usd: 20.0, rsi_buy: 30, rsi_sell: 70, daily_goal_pct: 3.0
  });

  const [fearAndGreed, setFearAndGreed] = useState<any>(null);
  const [altSeasonValue, setAltSeasonValue] = useState(35); 
  const [robotLogs, setRobotLogs] = useState<string[]>([]);
  
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const showSettingsRef = useRef(showSettings);
    useEffect(() => { showSettingsRef.current = showSettings; }, [showSettings]);

  const fetchData = () => {
    setApiError(null);

    fetch('https://api.alternative.me/fng/')
      .then(res => res.json())
      .then(data => setFearAndGreed(data.data[0]))
      .catch(() => console.log("Erro ao buscar Fear & Greed"));

    Promise.all([
      api.get(`/market/analyze/${selectedCoin.toLowerCase()}`).catch(e => e.response?.data || { error: "Falha na Análise" }),
      api.get('/portfolio').catch(e => e.response?.data || { error: "Falha no Portfolio" }),
      api.get(`/market/history/${selectedCoin.toLowerCase()}`).catch(e => e.response?.data || { error: "Falha no Gráfico" }),
      api.get('/bot/status').catch(() => ({ data: { running: false } })),
      api.get(`/portfolio/profit?days=${profitFilter}`).catch(() => ({ data: { profit: 0, trades_count: 0 } })),
      api.get('/settings').catch(() => ({ data: settings }))
    ]).then(([analysisRes, portfolioRes, historyRes, botRes, profitRes, settingsRes]) => {
      
      if (analysisRes.detail || analysisRes.error) {
        setApiError(analysisRes);
        setLoading(false);
        return;
      }

      setAnalysis(analysisRes.data || analysisRes);
      setPortfolio(portfolioRes.data || portfolioRes);
      setBotRunning(botRes.data?.running || false);
      setProfitData(profitRes.data || profitRes);
      
      if (settingsRes.data && !showSettingsRef.current) {
    setSettings({
      ...settingsRes.data,
      weight_trend: settingsRes.data.weight_trend !== undefined ? settingsRes.data.weight_trend : 30,
      weight_momentum: settingsRes.data.weight_momentum !== undefined ? settingsRes.data.weight_momentum : 35,
      weight_volume: settingsRes.data.weight_volume !== undefined ? settingsRes.data.weight_volume : 15,
      weight_news: settingsRes.data.weight_news !== undefined ? settingsRes.data.weight_news : 20,
      daily_goal_pct: settingsRes.data.daily_goal_pct !== undefined ? settingsRes.data.daily_goal_pct : 3.0,
    });
  }
      
      const histData = historyRes.data || historyRes;
      if (Array.isArray(histData)) setHistoryData(histData);
      
      setLoading(false);
    });
  };

  // Polling de dados
  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(() => fetchData(), 5000);
    return () => clearInterval(interval);
  }, [selectedCoin, profitFilter]);

  // Polling de logs (separado e ÚNICO)
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await api.get('/logs');
        setRobotLogs(response.data);
      } catch (e) {}
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  // Gráfico
  useEffect(() => {
    if (!chartContainerRef.current || historyData.length === 0) return;
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#9ca3af' },
      grid: { vertLines: { color: '#2A2E39' }, horzLines: { color: '#2A2E39' } },
      width: chartContainerRef.current.clientWidth,
      height: 380,
      timeScale: { timeVisible: true }
    });
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#00C853', downColor: '#FF3B30', borderVisible: false, wickUpColor: '#00C853', wickDownColor: '#FF3B30',
    });
    candlestickSeries.setData(historyData);
    const handleResize = () => { if (chartContainerRef.current) chart.applyOptions({ width: chartContainerRef.current.clientWidth }); };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); chart.remove(); };
  }, [historyData]);

  const handleTrade = async () => {
    if (!analysis || analysis.recommendation === 'AGUARDAR') return;
    try {
      const response = await api.post('/trading/execute', { symbol: selectedCoin, action: analysis.recommendation, price: analysis.current_price, amount_usd: settings.trade_amount_usd });
      if (response.data?.success) { setTradeMessage(`✅ ${response.data.message}`); fetchData(); } 
      else { setTradeMessage(`❌ Erro: ${response.data?.error}`); }
      setTimeout(() => setTradeMessage(""), 3000);
    } catch (error) { setTradeMessage("❌ Erro de conexão"); }
  };

  const toggleBot = async () => {
    try {
      const res = await api.post('/bot/toggle');
      setBotRunning(res.data.running);
      setTradeMessage(res.data.running ? "🤖 Robô LIGADO!" : "💤 Robô DESLIGADO!");
      setTimeout(() => setTradeMessage(""), 3000);
    } catch (error) { console.error(error); }
  };

  const handlePanic = async () => {
    if (window.confirm("🚨 ATENÇÃO: Isso vai vender TODAS as suas moedas a mercado imediatamente para proteger seu capital. Tem certeza?")) {
      try {
        const response = await api.post('/trading/panic', {});
        if (response.data?.success) {
          setTradeMessage(`🚨 ${response.data.message}`);
          fetchData();
        } else {
          setTradeMessage(`❌ Erro: ${response.data?.error}`);
        }
        setTimeout(() => setTradeMessage(""), 5000);
      } catch (error) {
        setTradeMessage("❌ Erro ao ativar Pânico");
      }
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      await api.post('/settings', settings);
      setTradeMessage("✅ Estratégia salva!");
      setTimeout(() => { setShowSettings(false); setIsSaving(false); fetchData(); }, 800);
      setTimeout(() => setTradeMessage(""), 4000);
    } catch (error) { setIsSaving(false); setTradeMessage("❌ Erro ao salvar"); }
  };

  if (loading && !analysis) return (
    <div className="p-6 flex flex-col items-center justify-center h-screen w-full bg-[#0B0E14]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-green mb-4"></div>
      <p className="text-brand-green font-bold text-lg">Iniciando Terminal...</p>
    </div>
  );

  const totalEquity = portfolio?.total_equity || 0;
  const profit = profitData?.profit || 0;
  const initialCapital = totalEquity - profit;
  const profitPct = initialCapital > 0 ? (profit / initialCapital) * 100 : 0;
  
  const goalProgress = settings.daily_goal_pct > 0 ? Math.min(Math.max((profitPct / settings.daily_goal_pct) * 100, 0), 100) : 0;
  const isGoalReached = goalProgress >= 100;

  const fgValue = fearAndGreed ? parseInt(fearAndGreed.value) : 50;
  const fgLabel = fearAndGreed ? fearAndGreed.value_classification : "Neutral";
  let fgColor = "#EAB308"; 
  if (fgValue <= 25) fgColor = "#EF4444"; 
  else if (fgValue <= 45) fgColor = "#F97316"; 
  else if (fgValue >= 75) fgColor = "#22C55E"; 
  else if (fgValue >= 55) fgColor = "#84CC16"; 

  const getLogColor = (log: string) => {
    if (log.includes('🚀') || log.includes('COMPRA')) return 'text-green-400';
    if (log.includes('🛑') || log.includes('🚨') || log.includes('STOP')) return 'text-red-400';
    if (log.includes('🔥') || log.includes('MOMENTUM')) return 'text-amber-400';
    if (log.includes('🎯') || log.includes('TAKE PROFIT') || log.includes('LUCRO')) return 'text-blue-400';
    if (log.includes('📉') || log.includes('VENDA')) return 'text-orange-400';
    return 'text-gray-300';
  };

  return (
    <div className="flex-1 p-4 md:p-8 overflow-x-hidden relative bg-[#0B0E14] text-white font-sans min-h-screen">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #00C853; }
        input[type=range] { -webkit-appearance: none; background: transparent; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 20px; width: 20px; border-radius: 50%; background: #00C853; cursor: pointer; margin-top: -8px; box-shadow: 0 0 10px rgba(0,200,83,0.5); }
        input[type=range]::-webkit-slider-runnable-track { width: 100%; height: 6px; cursor: pointer; background: #374151; border-radius: 4px; }
        .neon-border { box-shadow: 0 0 15px rgba(0, 200, 83, 0.15); border-color: rgba(0, 200, 83, 0.3); }
        .radar-scan { position: absolute; top: 0; left: 0; width: 100%; height: 2px; background: rgba(0,200,83,0.8); box-shadow: 0 0 10px #00C853; animation: scan 3s linear infinite; opacity: 0.5; z-index: 0; pointer-events: none; }
        @keyframes scan { 0% { top: 0; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
        .data-stream { position: absolute; font-family: monospace; font-size: 10px; color: #00C853; opacity: 0.3; animation: fall linear infinite; user-select: none; pointer-events: none; }
        @keyframes fall { 0% { transform: translateY(-100%); opacity: 0; } 10% { opacity: 0.5; } 90% { opacity: 0.5; } 100% { transform: translateY(1000%); opacity: 0; } }
      `}</style>

      {/* CABEÇALHO */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <select 
            value={selectedCoin} 
            onChange={(e) => setSelectedCoin(e.target.value)} 
            className="bg-[#11151C] border border-gray-800 text-white px-5 py-2.5 rounded-lg outline-none focus:border-brand-green font-bold cursor-pointer shadow-sm text-lg"
          >
            <optgroup label="🔥 Top Crypto">
              <option value="BTC">Bitcoin (BTC)</option>
              <option value="ETH">Ethereum (ETH)</option>
              <option value="SOL">Solana (SOL)</option>
              <option value="BNB">Binance Coin (BNB)</option>
              <option value="XRP">Ripple (XRP)</option>
            </optgroup>
            <optgroup label="🚀 Memecoins">
              <option value="PEPE">Pepe (PEPE)</option>
              <option value="WIF">Dogwifhat (WIF)</option>
              <option value="DOGE">Dogecoin (DOGE)</option>
              <option value="SHIB">Shiba Inu (SHIB)</option>
              <option value="FLOKI">Floki (FLOKI)</option>
              <option value="BONK">Bonk (BONK)</option>
            </optgroup>
            <optgroup label="🧠 Inteligência Artificial">
              <option value="FET">Fetch.ai (FET)</option>
              <option value="RENDER">Render (RENDER)</option>
              <option value="INJ">Injective (INJ)</option>
              <option value="TAO">Bittensor (TAO)</option>
            </optgroup>
            <optgroup label="🌐 Altcoins Fortes">
              <option value="ADA">Cardano (ADA)</option>
              <option value="AVAX">Avalanche (AVAX)</option>
              <option value="LINK">Chainlink (LINK)</option>
              <option value="MATIC">Polygon (MATIC)</option>
              <option value="SUI">Sui (SUI)</option>
              <option value="APT">Aptos (APT)</option>
              <option value="ARB">Arbitrum (ARB)</option>
              <option value="OP">Optimism (OP)</option>
              <option value="NEAR">Near Protocol (NEAR)</option>
              <option value="DOT">Polkadot (DOT)</option>
              <option value="LTC">Litecoin (LTC)</option>
              <option value="BCH">Bitcoin Cash (BCH)</option>
              <option value="TRX">Tron (TRX)</option>
              <option value="UNI">Uniswap (UNI)</option>
              <option value="ATOM">Cosmos (ATOM)</option>
            </optgroup>
          </select>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto justify-end">
          {tradeMessage && <div className="bg-[#11151C] border border-brand-green text-brand-green px-4 py-2 rounded text-sm font-bold animate-pulse">{tradeMessage}</div>}
          
          <button onClick={handlePanic} className="px-4 py-2.5 rounded-lg font-bold bg-red-900/80 text-white hover:bg-red-600 transition-all border border-red-700 flex items-center gap-2 shadow-[0_0_15px_rgba(255,59,48,0.3)]">
            🚨 VENDER TUDO
          </button>

          <button onClick={() => setShowSettings(!showSettings)} className="px-4 py-2.5 rounded-lg font-bold bg-gray-800 text-white hover:bg-gray-700 transition-all border border-gray-700 flex items-center gap-2">⚙️ Estratégia</button>
          <button onClick={toggleBot} className={`px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg ${botRunning ? 'bg-brand-green text-black shadow-[0_0_20px_rgba(0,200,83,0.4)]' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
            <span className="text-xl">{botRunning ? '🤖' : '💤'}</span>{botRunning ? 'Robô Operando' : 'Ligar Robô'}
          </button>
        </div>
      </div>

      {/* PAINEL DE CONFIGURAÇÕES */}
      {showSettings && (
        <div className="bg-[#11151C] p-6 rounded-xl border border-brand-green shadow-[0_0_30px_rgba(0,200,83,0.1)] mb-8 w-full animate-fade-in">
          <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">🧠 Cérebro da IA (Pesos & Limites)</h2>
            <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">✕ Fechar</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-black bg-opacity-30 p-5 rounded-lg border border-gray-800">
            <h3 className="text-gray-400 font-medium mb-4 uppercase tracking-wider text-sm">Balança de Decisão (100%)</h3>
            
            <div className="flex justify-between text-sm mb-1">
              <span className="text-blue-400 font-medium">📈 Tendência (EMA 9/21)</span>
              <span className="text-white font-bold">{settings.weight_trend}%</span>
            </div>
            <input type="range" min="0" max="100" value={settings.weight_trend}
              onChange={(e) => setSettings({...settings, weight_trend: parseInt(e.target.value)})}
              className="w-full mb-4" />

            <div className="flex justify-between text-sm mb-1">
              <span className="text-purple-400 font-medium">⚡ Momento (RSI+MACD)</span>
              <span className="text-white font-bold">{settings.weight_momentum}%</span>
            </div>
            <input type="range" min="0" max="100" value={settings.weight_momentum}
              onChange={(e) => setSettings({...settings, weight_momentum: parseInt(e.target.value)})}
              className="w-full mb-4" />

            <div className="flex justify-between text-sm mb-1">
              <span className="text-yellow-400 font-medium">📊 Volume</span>
              <span className="text-white font-bold">{settings.weight_volume}%</span>
            </div>
            <input type="range" min="0" max="100" value={settings.weight_volume}
              onChange={(e) => setSettings({...settings, weight_volume: parseInt(e.target.value)})}
              className="w-full mb-4" />

            <div className="flex justify-between text-sm mb-1">
              <span className="text-green-400 font-medium">📰 Notícias</span>
              <span className="text-white font-bold">{settings.weight_news}%</span>
            </div>
            <input type="range" min="0" max="100" value={settings.weight_news}
              onChange={(e) => setSettings({...settings, weight_news: parseInt(e.target.value)})}
              className="w-full mb-3" />

            <div className="flex justify-between text-xs text-gray-500 italic mt-2">
              <span className="text-gray-500">Total: {settings.weight_trend + settings.weight_momentum + settings.weight_volume + settings.weight_news}%</span>
              {(settings.weight_trend + settings.weight_momentum + settings.weight_volume + settings.weight_news) !== 100 && (
                <span className="text-yellow-500">⚠️ Ajuste para 100%</span>
              )}
            </div>
          </div>
            <div className="bg-black bg-opacity-30 p-5 rounded-lg border border-gray-800 grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="col-span-2 lg:col-span-4"><h3 className="text-gray-400 font-medium uppercase tracking-wider text-sm">Gestão de Risco & Metas</h3></div>
              <div><label className="block text-xs text-gray-400 mb-1">Meta Diária (%)</label><input type="number" step="0.5" value={settings.daily_goal_pct} onChange={e => setSettings({...settings, daily_goal_pct: parseFloat(e.target.value)})} className="w-full bg-gray-900 border border-brand-green/50 rounded px-3 py-2 text-white font-mono" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Stop Loss (%)</label><input type="number" step="0.5" value={settings.stop_loss_pct} onChange={e => setSettings({...settings, stop_loss_pct: parseFloat(e.target.value)})} className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white font-mono" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Take Profit (%)</label><input type="number" step="0.5" value={settings.take_profit_pct} onChange={e => setSettings({...settings, take_profit_pct: parseFloat(e.target.value)})} className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white font-mono" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Valor/Trade ($)</label><input type="number" step="5" value={settings.trade_amount_usd} onChange={e => setSettings({...settings, trade_amount_usd: parseFloat(e.target.value)})} className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white font-mono" /></div>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button onClick={saveSettings} disabled={isSaving} className={`font-bold px-8 py-3 rounded-lg transition-all shadow-lg flex items-center gap-2 ${isSaving ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-brand-green text-black hover:bg-green-500'}`}>
              {isSaving ? '⏳ Salvando...' : '💾 Salvar Estratégia e Aplicar'}
            </button>
          </div>
        </div>
      )}

      {/* GRÁFICO */}
      <div className={`bg-[#11151C] p-6 rounded-xl border border-gray-800 shadow-xl mb-6 w-full transition-all duration-500 ${botRunning ? 'neon-border' : ''}`}>
        <h3 className="text-gray-400 font-medium mb-4 uppercase tracking-wider text-sm">Gráfico {selectedCoin}/USDT (1 Hora)</h3>
        <div ref={chartContainerRef} className="w-full h-[380px]"></div>
      </div>

      {/* LINHA DO MEIO: 3 CARDS PRINCIPAIS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 w-full">
        
        {/* CARD 1: SINAL DA IA */}
        <div className={`bg-[#11151C] p-6 rounded-xl border border-gray-800 shadow-xl flex flex-col h-[380px] relative overflow-hidden transition-all duration-500 ${botRunning ? 'neon-border' : ''}`}>
          {botRunning && (
            <>
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,...')] opacity-30 animate-pulse"></div>
              <div className="radar-scan"></div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-green opacity-10 blur-3xl rounded-full animate-pulse"></div>
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-brand-green opacity-10 blur-2xl rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
              <div className="data-stream" style={{left: '10%', animationDuration: '2s'}}>101010</div>
              <div className="data-stream" style={{left: '30%', animationDuration: '3s', animationDelay: '0.5s'}}>010111</div>
              <div className="data-stream" style={{left: '50%', animationDuration: '2.5s', animationDelay: '1s'}}>110010</div>
              <div className="data-stream" style={{left: '70%', animationDuration: '3.5s', animationDelay: '0.2s'}}>001101</div>
              <div className="data-stream" style={{left: '90%', animationDuration: '2.2s', animationDelay: '0.8s'}}>101100</div>
            </>
          )}

          <div className="flex justify-between items-start mb-2 relative z-10">
            <h3 className="text-gray-400 font-medium uppercase tracking-wider text-sm flex items-center gap-2">🎯 Sinal da IA</h3>
            <span className={`px-3 py-1 rounded-full text-xs font-bold bg-opacity-20 border ${analysis?.recommendation === 'COMPRAR' ? 'bg-brand-green text-brand-green border-brand-green/30' : analysis?.recommendation === 'VENDER' ? 'bg-brand-red text-brand-red border-brand-red/30' : 'bg-yellow-500 text-yellow-500 border-yellow-500/30'} ${botRunning ? 'animate-pulse' : ''}`}>
              {analysis?.recommendation}
            </span>
          </div>

          <div className="relative z-10 flex items-end gap-3 mb-4">
            <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-brand-green to-blue-500 drop-shadow-[0_0_10px_rgba(0,200,83,0.8)] tracking-tighter">{selectedCoin}</h2>
            <span className="text-xl text-gray-500 font-bold mb-2">/USDT</span>
          </div>

          <div className="flex justify-between items-end relative z-10 mb-auto">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Preço Atual</p>
              <p className="text-2xl font-mono text-white font-bold">{formatCryptoPrice(analysis?.current_price)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Score IA</p>
              <p className="text-2xl font-bold text-brand-green drop-shadow-[0_0_8px_rgba(0,200,83,0.5)]">
                {analysis?.ai_score?.toFixed(0)} <span className="text-sm text-gray-500 font-normal">/ 100</span>
              </p>
            </div>
          </div>
          
          {botRunning && (
            <div className="bg-black bg-opacity-70 p-3 rounded-lg border border-green-900/50 mb-4 h-20 overflow-hidden relative z-10 backdrop-blur-sm">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-green animate-pulse"></div>
              <p className="text-[11px] text-brand-green font-mono opacity-90 animate-pulse">&gt; Analisando fluxo de {selectedCoin}...</p>
              <p className="text-[11px] text-brand-green font-mono opacity-70 mt-1">&gt; RSI: {analysis?.rsi?.toFixed(1)} | Sentimento: {analysis?.news?.score}</p>
              <p className="text-[11px] text-brand-green font-mono opacity-50 mt-1">&gt; Calculando probabilidade...</p>
            </div>
          )}

          <button onClick={handleTrade} disabled={analysis?.recommendation === 'AGUARDAR' || botRunning} className={`w-full py-3.5 rounded-lg font-bold transition-all text-sm uppercase tracking-widest relative z-10 shadow-lg ${botRunning ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700' : analysis?.recommendation === 'COMPRAR' ? 'bg-brand-green hover:bg-green-500 text-black shadow-[0_0_15px_rgba(0,200,83,0.4)]' : analysis?.recommendation === 'VENDER' ? 'bg-brand-red hover:bg-red-500 text-white shadow-[0_0_15px_rgba(255,59,48,0.4)]' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
            {botRunning ? '🤖 MODO AUTÔNOMO ATIVADO' : analysis?.recommendation === 'AGUARDAR' ? 'Aguardando Gatilho...' : `Executar ${analysis?.recommendation}`}
          </button>
        </div>

        {/* CARD 2: RESULTADOS & META DIÁRIA */}
        <div className={`bg-[#11151C] p-6 rounded-xl border border-gray-800 shadow-xl flex flex-col h-[380px] transition-all duration-500 ${botRunning ? 'neon-border' : ''}`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-gray-400 font-medium uppercase tracking-wider text-sm">Resultados & Metas</h3>
            <select value={profitFilter} onChange={(e) => setProfitFilter(Number(e.target.value))} className="bg-black border border-gray-700 text-[10px] text-gray-300 px-2 py-1 rounded outline-none focus:border-brand-green cursor-pointer">
              <option value={0}>Hoje</option><option value={7}>7 Dias</option><option value={30}>30 Dias</option>
            </select>
          </div>
          
          <div className="bg-black bg-opacity-30 p-5 rounded-lg border border-gray-800 flex-1 flex flex-col justify-center relative overflow-hidden">
            {isGoalReached && <div className="absolute inset-0 bg-brand-green opacity-5 animate-pulse"></div>}
            
            <p className="text-xs text-gray-400 mb-1 text-center">Lucro Líquido</p>
            <div className="flex flex-col items-center justify-center mb-6">
              <h2 className={`text-4xl font-black tracking-tight mb-2 ${profit >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                {profit >= 0 ? '+' : '-'}${Math.abs(profit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </h2>
              <span className={`text-sm font-bold px-3 py-1 rounded-full border ${profitPct >= 0 ? 'bg-green-900/30 text-brand-green border-green-900/50' : 'bg-red-900/30 text-brand-red border-red-900/50'}`}>
                {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%
              </span>
            </div>

            <div className="mt-auto pt-4 border-t border-gray-800/50 relative z-10">
              <div className="flex justify-between text-xs font-bold mb-2">
                <span className="text-gray-400 uppercase tracking-wider">Meta ({settings.daily_goal_pct}%)</span>
                <span className={isGoalReached ? 'text-brand-green animate-pulse' : 'text-gray-300'}>
                  {goalProgress.toFixed(0)}% {isGoalReached && '🏆'}
                </span>
              </div>
              <div className="w-full h-2.5 bg-gray-900 rounded-full overflow-hidden border border-gray-800">
                <div 
                  className={`h-full transition-all duration-1000 ${isGoalReached ? 'bg-brand-green shadow-[0_0_10px_#00C853]' : 'bg-blue-500'}`} 
                  style={{ width: `${goalProgress}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
        
        {/* CARD 3: ÚLTIMOS TRADES */}
        <div className={`bg-[#11151C] p-6 rounded-xl border border-gray-800 shadow-xl flex flex-col h-[380px] transition-all duration-500 ${botRunning ? 'neon-border' : ''}`}>
          <h3 className="text-gray-400 font-medium mb-4 uppercase tracking-wider text-sm flex justify-between items-center">
            Últimos Trades
            <span className="bg-gray-800 text-[10px] px-2 py-0.5 rounded text-gray-400">{profitData.trades_count} no período</span>
          </h3>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar bg-black bg-opacity-20 rounded-lg p-3 border border-gray-800/50">
            {portfolio?.history?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center opacity-70">
                <span className="text-3xl mb-3">⏳</span><p className="text-xs text-gray-400 leading-relaxed">Aguardando transações...</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {portfolio?.history?.map((trade: any, idx: number) => (
                  <li key={idx} className="flex flex-col text-sm border-b border-gray-800/50 pb-3 last:border-0 hover:bg-gray-800/30 px-2 pt-2 rounded transition-colors">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`font-bold ${trade.action === 'COMPRAR' ? 'text-brand-green' : 'text-brand-red'}`}>
                        {trade.action} <span className="text-gray-300 font-normal ml-1">{trade.symbol}</span>
                      </span>
                      <span className="text-gray-500 text-[10px]">{trade.time}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-gray-400 mb-1">
                      <span>Preço: <span className="text-white font-mono">{formatCryptoPrice(trade.price)}</span></span>
                      <span>Vol: <span className="text-white font-mono">${(trade.amount_usd || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</span></span>
                    </div>
                    {trade.action === 'VENDER' && trade.reason && (
                      <div className="flex justify-between items-center text-[11px] mt-1 pt-1 border-t border-gray-800/50">
                        <span className="text-gray-400 italic">Motivo: {trade.reason}</span>
                        <span className={`font-bold ${trade.profit_pct > 0 ? 'text-brand-green' : trade.profit_pct < 0 ? 'text-brand-red' : 'text-gray-400'}`}>
                          {trade.profit_pct > 0 ? '+' : ''}{trade.profit_pct?.toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

            {/* LINHA DE BAIXO: 3 CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
        
        {/* 1. TERMÔMETRO GLOBAL */}
        <div className={`bg-[#11151C] p-6 rounded-xl border border-gray-800 shadow-xl flex flex-col justify-center transition-all duration-500 ${botRunning ? 'neon-border' : ''}`}>
          <h3 className="text-gray-400 font-medium mb-4 uppercase tracking-wider text-sm">Termômetro Global</h3>
          
          <div className="bg-black bg-opacity-30 p-4 rounded-lg border border-gray-800 flex-1 flex flex-col justify-center mb-4">
            <div className="flex justify-between items-end mb-3">
              <span className="text-xs text-gray-400 uppercase font-bold flex items-center gap-1">🧭 Medo e Ganância</span>
              <span className="text-xl font-bold text-white">{fgValue} <span className="text-xs text-gray-500 font-normal">/ 100</span></span>
            </div>
            <div className="w-full h-3 rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 relative mb-3">
              <div className="absolute top-[-4px] w-5 h-5 bg-white rounded-full shadow-lg border-2 border-gray-900 transition-all duration-1000" style={{ left: `calc(${fgValue}% - 10px)` }}></div>
            </div>
            <div className="text-center text-xs font-bold uppercase tracking-widest" style={{ color: fgColor }}>{fgLabel}</div>
          </div>

          <div className="bg-black bg-opacity-30 p-4 rounded-lg border border-gray-800 flex-1 flex flex-col justify-center">
            <div className="flex justify-between items-end mb-3">
              <span className="text-xs text-gray-400 uppercase font-bold flex items-center gap-1">🌊 Altcoin Season</span>
              <span className="text-xl font-bold text-white">{altSeasonValue} <span className="text-xs text-gray-500 font-normal">/ 100</span></span>
            </div>
            <div className="w-full h-3 rounded-full bg-gradient-to-r from-orange-500 via-gray-500 to-blue-500 relative mb-3">
              <div className="absolute top-[-4px] w-5 h-5 bg-white rounded-full shadow-lg border-2 border-gray-900 transition-all duration-1000" style={{ left: `calc(${altSeasonValue}% - 10px)` }}></div>
            </div>
            <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider">
              <span className="text-orange-500">Bitcoin Season</span>
              <span className="text-blue-500">Altcoin Season</span>
            </div>
          </div>
        </div>

                {/* 2. TERMÔMETRO DO MERCADO + LOGS */}
        <div className={`bg-[#11151C] p-6 rounded-xl border border-gray-800 shadow-xl flex flex-col transition-all duration-500 ${botRunning ? 'neon-border' : ''}`}>
          <h3 className="text-gray-400 font-medium mb-4 uppercase tracking-wider text-sm">📊 Termômetro & Logs</h3>

          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* RSI */}
            <div className="bg-black/30 rounded-xl p-3 border border-gray-800/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">RSI</span>
                <span className={`text-lg font-black ${
                  analysis?.rsi <= settings.rsi_buy ? 'text-green-400' :
                  analysis?.rsi >= settings.rsi_sell ? 'text-red-400' : 'text-yellow-400'
                }`}>
                  {analysis?.rsi?.toFixed(1) || '--'}
                </span>
              </div>
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${
                  analysis?.rsi <= settings.rsi_buy ? 'bg-green-400' :
                  analysis?.rsi >= settings.rsi_sell ? 'bg-red-400' : 'bg-yellow-400'
                }`} style={{width: `${analysis?.rsi || 50}%`}} />
              </div>
              <p className="text-[9px] text-gray-500 mt-1">
                {analysis?.rsi <= settings.rsi_buy ? '🟢 Sobrevendido' :
                 analysis?.rsi >= settings.rsi_sell ? '🔴 Sobrecomprado' : '⚪ Neutro'}
              </p>
            </div>

            {/* MACD */}
            {/* <div className="bg-black/30 rounded-xl p-3 border border-gray-800/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">MACD</span>
                <span className={`text-lg font-black ${
                  (analysis?.macd?.histogram || 0) > 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {(analysis?.macd?.histogram || 0) > 0 ? '▲' : '▼'}
                </span>
              </div>
              <p className="text-[10px] text-gray-300 font-mono">
                {analysis?.macd?.macd?.toFixed(2) || '--'}
              </p>
              <p className="text-[9px] text-gray-500 mt-1">
                Sinal: {analysis?.macd?.signal?.toFixed(2) || '--'}
              </p>
            </div>*/}

            {/* Score IA */}
            <div className="bg-black/30 rounded-xl p-3 border border-gray-800/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Score IA</span>
                <span className="text-lg font-black text-emerald-400">
                  {analysis?.ai_score?.toFixed(0) || '--'}
                </span>
              </div>
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-yellow-500 to-green-400 rounded-full transition-all"
                     style={{width: `${analysis?.ai_score || 0}%`}} />
              </div>
              <p className="text-[9px] text-gray-500 mt-1">
                {analysis?.ai_score >= 70 ? '🟢 Forte' :
                 analysis?.ai_score >= 40 ? '🟡 Médio' : '🔴 Fraco'}
              </p>
            </div>

            {/* Volume */}
            {/* <div className="bg-black/30 rounded-xl p-3 border border-gray-800/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Volume</span>
                <span className={`text-lg font-black ${
                  (analysis?.volume_ratio || 0) > 1.5 ? 'text-green-400' : 'text-gray-400'
                }`}>
                  {(analysis?.volume_ratio || 0) > 1.5 ? '🔥' : '--'}
                </span>
              </div>
              <p className="text-[10px] text-gray-300 font-mono">
                {(analysis?.volume_24h || 0) > 1_000_000
                  ? `$${(analysis?.volume_24h / 1_000_000).toFixed(1)}M`
                  : `$${(analysis?.volume_24h || 0).toLocaleString()}`
                }
              </p>
              <p className="text-[9px] text-gray-500 mt-1">
                {analysis?.volume_ratio > 1.5 ? `${analysis.volume_ratio.toFixed(1)}x` : 'Normal'}
              </p>
            </div>*/}
          </div>

          {/* Gatilhos Visuais */}
          <div className="flex gap-2 mb-3">
            <div className={`flex-1 py-1.5 rounded-lg text-center text-[10px] font-bold border ${
              analysis?.recommendation === 'COMPRAR'
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-gray-800/50 border-gray-800 text-gray-600'
            }`}>
              🟢 COMPRAR
            </div>
            <div className={`flex-1 py-1.5 rounded-lg text-center text-[10px] font-bold border ${
              analysis?.recommendation === 'AGUARDAR'
                ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                : 'bg-gray-800/50 border-gray-800 text-gray-600'
            }`}>
              🟡 AGUARDAR
            </div>
            <div className={`flex-1 py-1.5 rounded-lg text-center text-[10px] font-bold border ${
              analysis?.recommendation === 'VENDER'
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-gray-800/50 border-gray-800 text-gray-600'
            }`}>
              🔴 VENDER
            </div>
          </div>

          {/* ===== LOGS COM ALTURA FIXA E SCROLL ===== */}
          <div className="bg-[#0D1117] rounded-lg p-3 border border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-gray-400 font-medium text-[10px] uppercase tracking-wider flex items-center gap-2">
                <span>📋</span> Logs do Robô
              </h3>
              <span className="text-[9px] text-gray-600">Tempo real</span>
            </div>
            
            {/* ALTURA FIXA DE 150px COM SCROLL! */}
            <div className="bg-black rounded p-2 h-[150px] overflow-y-auto font-mono text-[10px] space-y-1 custom-scrollbar">
              {robotLogs.length === 0 ? (
                <p className="text-gray-600 py-2 text-center">Aguardando logs...</p>
              ) : (
                robotLogs.slice().reverse().map((log, i) => (
                  <div key={i} className={getLogColor(log)}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        
        </div>

        {/* 3. NOTÍCIAS (agora SEM logs, mais espaço) */}
        <div className={`bg-[#11151C] p-6 rounded-xl border border-gray-800 shadow-xl flex flex-col transition-all duration-500 ${botRunning ? 'neon-border' : ''}`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-gray-400 font-medium uppercase tracking-wider text-sm">Últimas Manchetes</h3>
            <span className={`text-xs font-bold px-2 py-1 rounded ${analysis?.news?.score >= 60 ? 'bg-green-900/30 text-brand-green' : analysis?.news?.score <= 40 ? 'bg-red-900/30 text-brand-red' : 'bg-yellow-900/30 text-yellow-500'}`}>
              Sentimento: {analysis?.news?.label}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar" style={{ maxHeight: '400px' }}>
            <ul className="space-y-4">
              {analysis?.news?.headlines?.length === 0 ? (
                <p className="text-gray-600 text-sm py-4 text-center">Nenhuma notícia disponível</p>
              ) : (
                analysis?.news?.headlines?.map((headline: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-3 border-b border-gray-800/50 pb-3 last:border-0 hover:text-white transition-colors">
                    <span className="text-lg mt-0.5 opacity-80">📰</span>
                    <span className="text-sm text-gray-300 leading-relaxed">{headline}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
        
      </div>
    </div>
  )
}