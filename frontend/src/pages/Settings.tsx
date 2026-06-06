import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function Settings() {
  const [settings, setSettings] = useState({
    rsi_buy: 30,
    rsi_sell: 70,
    stop_loss_pct: 5.0,
    take_profit_pct: 10.0,
    trade_amount_usd: 100.0,
    weight_trend: 30,
    weight_momentum: 35,
    weight_volume: 15,
    weight_news: 20,
    daily_goal_pct: 3.0
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get('/settings').then(res => {
      if (res.data) setSettings(prev => ({ ...prev, ...res.data }));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: Number(value) }));
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await api.post('/settings', settings);
      if (res.data.success) {
        setMessage("✅ " + res.data.message);
      } else {
        setMessage("❌ Erro ao salvar.");
      }
    } catch (e) {
      setMessage("❌ Erro de conexão.");
    }
    setSaving(false);
    setTimeout(() => setMessage(""), 3000);
  };

  // Soma dos pesos para validação visual
  const totalWeight = settings.weight_trend + settings.weight_momentum + settings.weight_volume + settings.weight_news;

  if (loading) return <div className="p-8 text-brand-green">Carregando configurações...</div>;

  return (
    <div className="p-4 md:p-8 w-full max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold tracking-tight mb-8">⚙️ Estratégia da IA</h1>

      <div className="bg-dark-panel p-8 rounded-xl border border-dark-border shadow-xl">

        {/* SEÇÃO: PESOS DA IA (NOVOS SLIDERS) */}
        <h2 className="text-xl font-bold text-brand-green mb-2 border-b border-gray-800 pb-2">
          🧠 Peso dos Indicadores (IA Multicamadas)
        </h2>
        <p className="text-xs text-gray-500 mb-6">
          Defina quanto cada camada da IA influencia na decisão de compra/venda. A soma deve ficar próxima de 100%.
          {totalWeight !== 100 && (
            <span className="text-yellow-500 font-bold ml-2">⚠️ Soma atual: {totalWeight}%</span>
          )}
        </p>

        <div className="space-y-8 mb-10">
          {/* TENDÊNCIA */}
          <div className="bg-black/30 p-5 rounded-lg border border-gray-800">
            <div className="flex justify-between items-start mb-1">
              <div>
                <h3 className="font-bold text-gray-200">📈 Tendência (EMA 9/21)</h3>
                <p className="text-xs text-gray-500">Só compra se a tendência for de alta. Médias móveis curta vs longa.</p>
              </div>
              <span className="text-2xl font-black text-blue-400">{settings.weight_trend}%</span>
            </div>
            <input 
              type="range" name="weight_trend" min="0" max="100" value={settings.weight_trend} onChange={handleChange}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-500 mt-2" 
              style={{ background: `linear-gradient(to right, #3b82f6 ${settings.weight_trend}%, #374151 ${settings.weight_trend}%)` }}
            />
          </div>

          {/* MOMENTO */}
          <div className="bg-black/30 p-5 rounded-lg border border-gray-800">
            <div className="flex justify-between items-start mb-1">
              <div>
                <h3 className="font-bold text-gray-200">⚡ Momento (RSI + MACD)</h3>
                <p className="text-xs text-gray-500">Força do movimento atual. Combina RSI (70%) e MACD (30%).</p>
              </div>
              <span className="text-2xl font-black text-purple-400">{settings.weight_momentum}%</span>
            </div>
            <input 
              type="range" name="weight_momentum" min="0" max="100" value={settings.weight_momentum} onChange={handleChange}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-purple-500 mt-2"
              style={{ background: `linear-gradient(to right, #a855f7 ${settings.weight_momentum}%, #374151 ${settings.weight_momentum}%)` }}
            />
          </div>

          {/* VOLUME */}
          <div className="bg-black/30 p-5 rounded-lg border border-gray-800">
            <div className="flex justify-between items-start mb-1">
              <div>
                <h3 className="font-bold text-gray-200">📊 Volume</h3>
                <p className="text-xs text-gray-500">Confirma se o movimento tem sustentação. Compara volume atual com a média.</p>
              </div>
              <span className="text-2xl font-black text-yellow-500">{settings.weight_volume}%</span>
            </div>
            <input 
              type="range" name="weight_volume" min="0" max="100" value={settings.weight_volume} onChange={handleChange}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-yellow-500 mt-2"
              style={{ background: `linear-gradient(to right, #eab308 ${settings.weight_volume}%, #374151 ${settings.weight_volume}%)` }}
            />
          </div>

          {/* NOTÍCIAS */}
          <div className="bg-black/30 p-5 rounded-lg border border-gray-800">
            <div className="flex justify-between items-start mb-1">
              <div>
                <h3 className="font-bold text-gray-200">📰 Notícias (Sentimento)</h3>
                <p className="text-xs text-gray-500">Analisa headlines do Cointelegraph para detectar euforia ou pânico.</p>
              </div>
              <span className="text-2xl font-black text-green-400">{settings.weight_news}%</span>
            </div>
            <input 
              type="range" name="weight_news" min="0" max="100" value={settings.weight_news} onChange={handleChange}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-green-500 mt-2"
              style={{ background: `linear-gradient(to right, #22c55e ${settings.weight_news}%, #374151 ${settings.weight_news}%)` }}
            />
          </div>
        </div>

        {/* SEÇÃO: ESTRATÉGIA DE INDICADORES (RSI) */}
        <h2 className="text-xl font-bold text-brand-green mb-6 border-b border-gray-800 pb-2">📉 Limites do RSI</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block text-gray-400 text-sm mb-2">RSI de Compra (Sobrevenda)</label>
            <p className="text-xs text-gray-500 mb-2">Compra quando o RSI cai abaixo deste valor.</p>
            <input 
              type="number" name="rsi_buy" value={settings.rsi_buy} onChange={handleChange}
              className="w-full bg-black border border-gray-700 text-white px-4 py-3 rounded-lg outline-none focus:border-brand-green font-mono"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">RSI de Venda (Sobrecompra)</label>
            <p className="text-xs text-gray-500 mb-2">Vende quando o RSI sobe acima deste valor.</p>
            <input 
              type="number" name="rsi_sell" value={settings.rsi_sell} onChange={handleChange}
              className="w-full bg-black border border-gray-700 text-white px-4 py-3 rounded-lg outline-none focus:border-brand-red font-mono"
            />
          </div>
        </div>

        {/* SEÇÃO: GESTÃO DE RISCO */}
        <h2 className="text-xl font-bold text-brand-green mb-6 border-b border-gray-800 pb-2">🛡️ Gestão de Risco</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div>
            <label className="block text-gray-400 text-sm mb-2">Stop Loss (%)</label>
            <input 
              type="number" name="stop_loss_pct" value={settings.stop_loss_pct} onChange={handleChange}
              className="w-full bg-black border border-gray-700 text-white px-4 py-3 rounded-lg outline-none focus:border-brand-red font-mono"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">Take Profit (%)</label>
            <input 
              type="number" name="take_profit_pct" value={settings.take_profit_pct} onChange={handleChange}
              className="w-full bg-black border border-gray-700 text-white px-4 py-3 rounded-lg outline-none focus:border-brand-green font-mono"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">Meta Diária (%)</label>
            <input 
              type="number" name="daily_goal_pct" value={settings.daily_goal_pct} onChange={handleChange}
              className="w-full bg-black border border-gray-700 text-white px-4 py-3 rounded-lg outline-none focus:border-brand-green font-mono"
            />
          </div>
        </div>

        {/* SEÇÃO: CAPITAL */}
        <h2 className="text-xl font-bold text-brand-green mb-6 border-b border-gray-800 pb-2">💰 Capital</h2>
        <div className="mb-8 w-full md:w-1/2">
          <label className="block text-gray-400 text-sm mb-2">Valor por Operação (USD)</label>
          <input 
            type="number" name="trade_amount_usd" value={settings.trade_amount_usd} onChange={handleChange}
            className="w-full bg-black border border-gray-700 text-white px-4 py-3 rounded-lg outline-none focus:border-brand-green font-mono"
          />
        </div>

        {/* BOTÃO DE SALVAR */}
        <div className="flex items-center gap-4 mt-8 pt-6 border-t border-gray-800">
          <button 
            onClick={saveSettings}
            disabled={saving}
            className="bg-brand-green text-black font-bold px-8 py-3 rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
          >
            {saving ? '💾 Salvando...' : '💾 Salvar Configurações'}
          </button>
          {message && <span className="text-white font-medium animate-pulse">{message}</span>}
        </div>

      </div>
    </div>
  );
}