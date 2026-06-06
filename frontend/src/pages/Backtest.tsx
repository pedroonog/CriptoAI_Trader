import { useState } from 'react';
import { api } from '../services/api';

export default function Backtest() {
  const [symbol, setSymbol] = useState('BTC');
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const runBacktest = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/backtest?symbol=${symbol}&days=${days}`);
      if (res.data.error) {
        setError(res.data.error);
      } else {
        setResult(res.data);
      }
    } catch (e) {
      setError("Erro ao conectar com o servidor.");
    }
    setLoading(false);
  };

  return (
    <div className="p-4 md:p-8 w-full">
      <h1 className="text-3xl font-bold tracking-tight mb-8">Laboratório de Backtest 🧪</h1>
      
      {/* CONTROLES */}
      <div className="bg-dark-panel p-6 rounded-xl border border-dark-border shadow-xl mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-gray-400 text-sm mb-2">Moeda</label>
          <select 
            value={symbol} 
            onChange={(e) => setSymbol(e.target.value)}
            className="bg-black border border-gray-700 text-white px-4 py-2 rounded-lg outline-none focus:border-brand-green"
          >
            <option value="BTC">Bitcoin (BTC)</option>
            <option value="ETH">Ethereum (ETH)</option>
            <option value="SOL">Solana (SOL)</option>
          </select>
        </div>
        
        <div>
          <label className="block text-gray-400 text-sm mb-2">Período (Dias)</label>
          <select 
            value={days} 
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-black border border-gray-700 text-white px-4 py-2 rounded-lg outline-none focus:border-brand-green"
          >
            <option value={7}>Últimos 7 Dias</option>
            <option value={15}>Últimos 15 Dias</option>
            <option value={30}>Últimos 30 Dias</option>
          </select>
        </div>

        <button 
          onClick={runBacktest}
          disabled={loading}
          className="bg-brand-green text-black font-bold px-6 py-2 rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
        >
          {loading ? 'Simulando no passado...' : '▶️ Rodar Simulação'}
        </button>
      </div>

      {error && <div className="text-brand-red mb-4">{error}</div>}

      {/* RESULTADOS */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-dark-panel p-6 rounded-xl border border-dark-border shadow-xl lg:col-span-1">
            <h3 className="text-gray-400 font-medium mb-6 uppercase tracking-wider text-sm">Resultado da Estratégia</h3>
            
            <div className="space-y-4">
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-400">Capital Inicial:</span>
                <span className="text-white font-mono">${result.initial_capital.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-400">Capital Final:</span>
                <span className="text-white font-mono">${result.final_capital.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-400">Lucro Total:</span>
                <span className={`font-mono font-bold ${result.total_profit >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                  {result.total_profit >= 0 ? '+' : '-'}${Math.abs(result.total_profit).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-400">Total de Operações:</span>
                <span className="text-white font-mono">{result.total_trades}</span>
              </div>
              <div className="flex justify-between pb-2">
                <span className="text-gray-400">Taxa de Acerto (Win Rate):</span>
                <span className="text-brand-green font-bold">{result.win_rate}%</span>
              </div>
            </div>
          </div>

          <div className="bg-dark-panel p-6 rounded-xl border border-dark-border shadow-xl lg:col-span-2">
            <h3 className="text-gray-400 font-medium mb-4 uppercase tracking-wider text-sm">Amostra de Operações Simuladas</h3>
            {result.trades.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhuma operação ocorreu neste período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="pb-2 font-medium">Ação</th>
                      <th className="pb-2 font-medium">Preço</th>
                      <th className="pb-2 font-medium">Data/Hora</th>
                      <th className="pb-2 font-medium text-right">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((t: any, i: number) => (
                      <tr key={i} className="border-b border-gray-800/50">
                        <td className={`py-3 font-bold ${t.action === 'COMPRAR' ? 'text-brand-green' : 'text-brand-red'}`}>{t.action}</td>
                        <td className="py-3 font-mono text-gray-300">${t.price.toLocaleString()}</td>
                        <td className="py-3 text-gray-500">{t.time}</td>
                        <td className={`py-3 text-right font-mono ${t.profit > 0 ? 'text-brand-green' : t.profit < 0 ? 'text-brand-red' : 'text-gray-500'}`}>
                          {t.action === 'VENDER' ? (t.profit > 0 ? `+$${t.profit}` : `-$${Math.abs(t.profit)}`) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}