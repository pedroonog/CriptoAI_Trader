import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function Market() {
  const [coins, setCoins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchMarket = async () => {
    try {
      const res = await api.get('/market/overview');
      if (res.data.error) {
        setError(res.data.error);
      } else {
        setCoins(res.data);
      }
    } catch (e) {
      setError("Erro ao carregar o mercado.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMarket();
    // Atualiza o radar a cada 10 segundos
    const interval = setInterval(fetchMarket, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && coins.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full w-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-green mb-4"></div>
        <p className="text-brand-green font-bold">Escaneando o mercado...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 w-full">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Radar do Mercado 🌐</h1>
        <span className="bg-brand-green/20 text-brand-green px-3 py-1 rounded-full text-sm font-bold animate-pulse">
          AO VIVO
        </span>
      </div>

      {error && <div className="text-brand-red mb-4">{error}</div>}

      <div className="bg-dark-panel rounded-xl border border-dark-border shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/50 text-gray-400 text-sm uppercase tracking-wider border-b border-dark-border">
                <th className="p-4 font-medium">Ativo</th>
                <th className="p-4 font-medium text-right">Preço Atual</th>
                <th className="p-4 font-medium text-right">Variação (24h)</th>
                <th className="p-4 font-medium text-right hidden md:table-cell">Volume (24h)</th>
                <th className="p-4 font-medium text-center">Sinal da IA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {coins.map((coin, idx) => (
                <tr key={idx} className="hover:bg-gray-800/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center font-bold text-xs border border-gray-700">
                        {coin.symbol.substring(0, 1)}
                      </div>
                      <span className="font-bold text-white text-lg">{coin.symbol}</span>
                      <span className="text-gray-500 text-xs">/USDT</span>
                    </div>
                  </td>
                  <td className="p-4 text-right font-mono text-lg text-gray-200">
                    ${coin.price < 1 ? coin.price.toFixed(4) : coin.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-right font-mono">
                    <span className={`px-2 py-1 rounded text-sm font-bold ${
                      coin.change_24h >= 0 ? 'bg-brand-green/10 text-brand-green' : 'bg-brand-red/10 text-brand-red'
                    }`}>
                      {coin.change_24h >= 0 ? '+' : ''}{coin.change_24h?.toFixed(2)}%
                    </span>
                  </td>
                  <td className="p-4 text-right font-mono text-gray-400 hidden md:table-cell">
                    ${(coin.volume / 1000000).toFixed(2)}M
                  </td>
                  <td className="p-4 text-center">
                    {/* SELO DA IA EM TEMPO REAL */}
                    <span className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-wide shadow-sm ${
                      coin.ai_signal === 'COMPRAR' ? 'bg-brand-green text-black shadow-[0_0_10px_rgba(0,200,83,0.3)]' : 
                      coin.ai_signal === 'VENDER' ? 'bg-brand-red text-white shadow-[0_0_10px_rgba(255,59,48,0.3)]' : 
                      'bg-gray-800 text-gray-400 border border-gray-700'
                    }`}>
                      {coin.ai_signal || 'AGUARDAR'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}