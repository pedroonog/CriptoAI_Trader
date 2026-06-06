import { useState, useEffect } from 'react';
import { api } from '../services/api';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export default function Reports() {
  const [timeFilter, setTimeFilter] = useState(30);
  const [coinFilter, setCoinFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any>(null);

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/reports?coin=${coinFilter}&days=${timeFilter}`);
        setReportData(response.data);
      } catch (error) {
        console.error("Erro ao buscar relatórios:", error);
      }
      setLoading(false);
    };

    fetchReports();
  }, [timeFilter, coinFilter]);

  if (loading || !reportData) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center h-screen bg-[#0B0E14]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-green mb-4"></div>
        <p className="text-brand-green font-bold">Processando dados do banco...</p>
      </div>
    );
  }

  const { globalMetrics, assetAnalysis, tradeLog } = reportData;

  return (
    <div className="flex-1 p-4 md:p-8 overflow-x-hidden relative bg-[#0B0E14] text-white font-sans min-h-screen">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #00C853; }
      `}</style>

      {/* CABEÇALHO E FILTROS */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-brand-green to-blue-500 tracking-tighter">
            Análise de Performance
          </h1>
          <p className="text-gray-400 text-sm mt-1">Dados REAIS extraídos do banco de dados</p>
        </div>
        
        <div className="flex items-center gap-4 w-full md:w-auto">
          <select 
            value={coinFilter} 
            onChange={(e) => setCoinFilter(e.target.value)} 
            className="bg-[#11151C] border border-gray-800 text-white px-4 py-2 rounded-lg outline-none focus:border-brand-green text-sm"
          >
            <option value="ALL">Todas as Moedas</option>
            <option value="BTC">Bitcoin (BTC)</option>
            <option value="ETH">Ethereum (ETH)</option>
            <option value="SOL">Solana (SOL)</option>
            <option value="PEPE">Pepe (PEPE)</option>
          </select>

          <button className="px-4 py-2 rounded-lg font-bold bg-gray-800 text-white hover:bg-gray-700 transition-all border border-gray-700 flex items-center gap-2 text-sm">
            📥 Baixar CSV
          </button>
        </div>
      </div>

      {/* CATEGORIA 2: MÉTRICAS GLOBAIS (4 CARDS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-[#11151C] p-6 rounded-xl border border-gray-800 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-brand-green opacity-5 blur-2xl rounded-full"></div>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Taxa de Acerto (Win Rate)</p>
          <div className="flex items-end gap-2">
            <h2 className="text-4xl font-black text-white">{globalMetrics?.winRate || 0}%</h2>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-1.5 mt-4">
            <div className="bg-brand-green h-1.5 rounded-full shadow-[0_0_10px_#00C853]" style={{ width: `${globalMetrics?.winRate || 0}%` }}></div>
          </div>
        </div>

        <div className="bg-[#11151C] p-6 rounded-xl border border-gray-800 shadow-lg">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">Fator de Lucro <span title="Soma dos lucros dividida pela soma dos prejuízos. Acima de 1.5 é excelente." className="cursor-help text-gray-500">ℹ️</span></p>
          <h2 className="text-4xl font-black text-blue-400">{globalMetrics?.profitFactor || 0}</h2>
          <p className="text-xs text-gray-500 mt-2">Para cada $1 perdido, ganha ${globalMetrics?.profitFactor || 0}</p>
        </div>

        <div className="bg-[#11151C] p-6 rounded-xl border border-gray-800 shadow-lg">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Risco / Retorno</p>
          <h2 className="text-4xl font-black text-purple-400">{globalMetrics?.riskReward || "1 : 0"}</h2>
          <p className="text-xs text-gray-500 mt-2">Média de Risco vs Ganho</p>
        </div>

        <div className="bg-[#11151C] p-6 rounded-xl border border-gray-800 shadow-lg">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Lucro Líquido Realizado</p>
          <h2 className={`text-4xl font-black ${globalMetrics?.netProfit >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
            {globalMetrics?.netProfit >= 0 ? '+' : ''}{formatCurrency(globalMetrics?.netProfit || 0)}
          </h2>
          <p className="text-xs text-gray-500 mt-2">Soma de todas as vendas</p>
        </div>
      </div>

      {/* CATEGORIA 3: ANÁLISE DE CONTEXTO E ATIVOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        
        {/* Melhores e Piores Moedas */}
        <div className="bg-[#11151C] p-6 rounded-xl border border-gray-800 shadow-lg">
          <h3 className="text-gray-400 font-medium uppercase tracking-wider text-sm mb-6">🏆 Melhores vs Piores Ativos</h3>
          
          <div className="space-y-6">
            <div>
              <p className="text-xs text-brand-green font-bold mb-3">TOP LUCRATIVAS</p>
              {assetAnalysis?.bestCoins?.length > 0 ? assetAnalysis.bestCoins.map((coin: any) => (
                <div key={coin.symbol} className="flex items-center justify-between mb-2">
                  <span className="w-12 font-bold">{coin.symbol}</span>
                  <div className="flex-1 mx-4 bg-gray-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-brand-green h-full" style={{ width: `${coin.winRate}%` }}></div>
                  </div>
                  <span className="w-20 text-right text-brand-green font-mono">{formatCurrency(coin.profit)}</span>
                </div>
              )) : <p className="text-xs text-gray-500 italic">Nenhum lucro registrado ainda.</p>}
            </div>

            <div className="pt-4 border-t border-gray-800/50">
              <p className="text-xs text-brand-red font-bold mb-3">MAIORES PREJUÍZOS</p>
              {assetAnalysis?.worstCoins?.length > 0 ? assetAnalysis.worstCoins.map((coin: any) => (
                <div key={coin.symbol} className="flex items-center justify-between mb-2">
                  <span className="w-12 font-bold">{coin.symbol}</span>
                  <div className="flex-1 mx-4 bg-gray-800 h-2 rounded-full overflow-hidden flex justify-end">
                    <div className="bg-brand-red h-full" style={{ width: `${coin.winRate}%` }}></div>
                  </div>
                  <span className="w-20 text-right text-brand-red font-mono">{formatCurrency(coin.profit)}</span>
                </div>
              )) : <p className="text-xs text-gray-500 italic">Nenhum prejuízo registrado ainda.</p>}
            </div>
          </div>
        </div>

        {/* Performance por Estado do Mercado */}
        <div className="bg-[#11151C] p-6 rounded-xl border border-gray-800 shadow-lg">
          <h3 className="text-gray-400 font-medium uppercase tracking-wider text-sm mb-6">🧭 Lucro por Estado do Mercado</h3>
          
          <div className="space-y-5 mt-8">
            {assetAnalysis?.marketState?.map((state: any) => (
              <div key={state.state} className="bg-black bg-opacity-30 p-4 rounded-lg border border-gray-800 flex justify-between items-center">
                <div>
                  <p className="font-bold text-gray-300">{state.state}</p>
                  <p className="text-xs text-gray-500">{state.trades} operações realizadas</p>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-mono font-bold ${state.profit >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                    {state.profit >= 0 ? '+' : ''}{formatCurrency(state.profit)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CATEGORIA 1: RAIO-X DE CADA OPERAÇÃO (TRADE LOG) */}
      <div className="bg-[#11151C] p-6 rounded-xl border border-gray-800 shadow-lg w-full overflow-hidden">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-gray-400 font-medium uppercase tracking-wider text-sm">🔬 Raio-X de Operações (Trade Log)</h3>
          <span className="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full">{globalMetrics?.totalTrades || 0} Trades no período</span>
        </div>

        <div className="overflow-x-auto custom-scrollbar pb-4">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-800">
                <th className="pb-3 font-medium">Data / Hora</th>
                <th className="pb-3 font-medium">Ativo</th>
                <th className="pb-3 font-medium">Motivo Saída</th>
                <th className="pb-3 font-medium text-right">Tempo Exposição</th>
                <th className="pb-3 font-medium text-center">Score IA</th>
                <th className="pb-3 font-medium text-center">RSI</th>
                <th className="pb-3 font-medium text-right">Preço Entrada</th>
                <th className="pb-3 font-medium text-right">Preço Saída</th>
                <th className="pb-3 font-medium text-right">Resultado</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {tradeLog?.length > 0 ? tradeLog.map((trade: any) => (
                <tr key={trade.id} className="border-b border-gray-800/30 hover:bg-gray-800/20 transition-colors">
                  <td className="py-4 text-gray-400 text-xs">{trade.date}</td>
                  <td className="py-4 font-bold text-white">{trade.coin}</td>
                  <td className="py-4">
                    <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider ${
                      trade.reason === 'Take Profit' ? 'bg-green-900/30 text-brand-green' : 
                      trade.reason === 'Stop Loss' ? 'bg-red-900/30 text-brand-red' : 
                      trade.reason === 'Botão do Pânico' || trade.reason === 'Trailing Stop Global (Meta Garantida)' ? 'bg-red-600 text-white' :
                      'bg-blue-900/30 text-blue-400'
                    }`}>
                      {trade.reason}
                    </span>
                  </td>
                  <td className="py-4 text-right text-gray-500 italic">{trade.timeInMarket}</td>
                  <td className="py-4 text-center text-gray-500 italic">{trade.aiScore}</td>
                  <td className="py-4 text-center text-gray-500 italic">{trade.rsi}</td>
                  <td className="py-4 text-right font-mono text-gray-400">{trade.entryPrice < 0.01 ? trade.entryPrice.toFixed(8) : formatCurrency(trade.entryPrice)}</td>
                  <td className="py-4 text-right font-mono text-white">{trade.exitPrice < 0.01 ? trade.exitPrice.toFixed(8) : formatCurrency(trade.exitPrice)}</td>
                  <td className="py-4 text-right">
                    <div className="flex flex-col items-end">
                      <span className={`font-bold font-mono ${trade.profitPct >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                        {trade.profitPct >= 0 ? '+' : ''}{trade.profitPct}%
                      </span>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {trade.profitUsd >= 0 ? '+' : ''}{formatCurrency(trade.profitUsd)}
                      </span>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-500 italic">Nenhuma operação de venda registrada no banco de dados ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}