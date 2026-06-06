import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Market from './pages/Market';
import Backtest from './pages/Backtest';
import Settings from './pages/Settings';
import Reports from './pages/Reports'; // <-- 1. IMPORTAMOS O NOVO ARQUIVO AQUI
import { api } from './services/api';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  
  // Novos estados para a Sidebar rica
  const [portfolio, setPortfolio] = useState<any>(null);
  const [profitData, setProfitData] = useState<any>({ profit: 0 });

  // Busca os dados da carteira e lucro a cada 10 segundos
  useEffect(() => {
    const fetchSidebarData = async () => {
      try {
        const portRes = await api.get('/portfolio');
        const profRes = await api.get('/portfolio/profit?days=7');
        
        setPortfolio(portRes.data || portRes);
        setProfitData(profRes.data || profRes);
      } catch (e) {
        console.error("Erro ao buscar dados da sidebar", e);
      }
    };
    
    fetchSidebarData();
    const interval = setInterval(fetchSidebarData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Cálculos financeiros
  const totalEquity = portfolio?.total_equity || 0;
  const freeUsdt = portfolio?.balance || 0;
  const profit = profitData?.profit || 0;
  const initialCapital = totalEquity - profit;
  const profitPct = initialCapital > 0 ? (profit / initialCapital) * 100 : 0;

  return (
    <div className="flex h-screen bg-dark-bg text-white font-sans overflow-hidden">
      
      {/* MENU LATERAL */}
      <div className="w-72 bg-[#0B0E14] border-r border-gray-800 flex flex-col shadow-2xl z-20">
        
        {/* LOGO */}
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-2xl font-black text-brand-green tracking-tighter drop-shadow-[0_0_8px_rgba(0,200,83,0.5)]">
            CryptoAI<span className="text-white">Trader</span>
          </h1>
        </div>
        
        {/* PATRIMÔNIO E LUCRO */}
        <div className="p-5 border-b border-gray-800 bg-black/40">
          <div className="relative overflow-hidden">
            <p className="text-[10px] text-gray-500 uppercase font-bold mb-1 tracking-widest">Saldo Total Estimado</p>
            <h2 className="text-3xl font-black text-white tracking-tight mb-4">
              ${totalEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            
            {/* Caixa de Lucro */}
            <div className="bg-gray-900/80 rounded-lg p-3 border border-gray-800">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Lucro Líquido (7d)</p>
              <div className="flex items-center justify-between">
                <span className={`font-mono font-bold text-lg ${profit >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                  {profit >= 0 ? '+' : '-'}${Math.abs(profit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
                <span className={`text-xs font-bold px-2 py-1 rounded-md ${profitPct >= 0 ? 'bg-green-900/30 text-brand-green border border-green-900/50' : 'bg-red-900/30 text-brand-red border border-red-900/50'}`}>
                  {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs mt-3 pt-3 border-t border-gray-800">
              <span className="text-gray-500 uppercase tracking-wider text-[10px] font-bold">Caixa Livre (USDT):</span>
              <span className="text-brand-green font-mono font-bold">
                ${freeUsdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
        
        {/* NAVEGAÇÃO */}
        <nav className="p-4 space-y-2 border-b border-gray-800">
          <button onClick={() => setCurrentPage('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-bold transition-all ${currentPage === 'dashboard' ? 'bg-brand-green/10 text-brand-green border border-brand-green/30' : 'text-gray-400 hover:bg-gray-800 hover:text-white border border-transparent'}`}>
            <span className="text-xl">📊</span> Dashboard
          </button>
          <button onClick={() => setCurrentPage('market')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-bold transition-all ${currentPage === 'market' ? 'bg-brand-green/10 text-brand-green border border-brand-green/30' : 'text-gray-400 hover:bg-gray-800 hover:text-white border border-transparent'}`}>
            <span className="text-xl">🌐</span> Mercado
          </button>
          <button onClick={() => setCurrentPage('backtest')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-bold transition-all ${currentPage === 'backtest' ? 'bg-brand-green/10 text-brand-green border border-brand-green/30' : 'text-gray-400 hover:bg-gray-800 hover:text-white border border-transparent'}`}>
            <span className="text-xl">🧪</span> Backtest
          </button>
          
          {/* 2. NOVO BOTÃO DE RELATÓRIOS AQUI */}
          <button onClick={() => setCurrentPage('reports')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-bold transition-all ${currentPage === 'reports' ? 'bg-brand-green/10 text-brand-green border border-brand-green/30' : 'text-gray-400 hover:bg-gray-800 hover:text-white border border-transparent'}`}>
            <span className="text-xl">📈</span> Relatórios
          </button>

          {/* <button onClick={() => setCurrentPage('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-bold transition-all ${currentPage === 'settings' ? 'bg-brand-green/10 text-brand-green border border-brand-green/30' : 'text-gray-400 hover:bg-gray-800 hover:text-white border border-transparent'}`}>
            <span className="text-xl">⚙️</span> Configurações
          </button>*/}
        </nav>

        {/* CARTEIRA (MOEDAS) */}
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
          <h3 className="text-gray-500 font-bold uppercase tracking-widest text-[10px] mb-3">Sua Carteira (Spot)</h3>
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
            {portfolio?.positions && Object.keys(portfolio.positions).length > 0 ? (
              Object.entries(portfolio.positions).map(([coin, amount]: any) => (
                <div key={coin} className="flex justify-between items-center border-b border-gray-800/50 pb-2 mb-2 last:border-0 hover:bg-gray-800/40 px-2 py-1 rounded transition-colors">
                  <span className="font-bold text-gray-300 flex items-center gap-2 text-sm">
                    <div className="w-5 h-5 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700 text-[9px] text-brand-green">
                      {coin.charAt(0)}
                    </div>
                    {coin}
                  </span> 
                  <span className="text-white font-mono text-xs">{amount.toFixed(4)}</span>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center opacity-40 mt-4">
                <span className="text-2xl mb-2">📭</span>
                <p className="text-[11px] text-gray-400">Carteira vazia.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ÁREA PRINCIPAL */}
      <div className="flex-1 overflow-y-auto bg-[#0B0E14] relative">
        {currentPage === 'dashboard' && <Dashboard />}
        {currentPage === 'market' && <Market />}
        {currentPage === 'backtest' && <Backtest />}
        {currentPage === 'settings' && <Settings />}
        {/* 3. MOSTRA A TELA DE RELATÓRIOS QUANDO CLICADO */}
        {currentPage === 'reports' && <Reports />}
      </div>
      
    </div>
  );
}

export default App;