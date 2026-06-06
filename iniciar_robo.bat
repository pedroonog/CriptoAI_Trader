@echo off
echo ==========================================
echo      INICIANDO SISTEMA DO ROBO...        
echo ==========================================

start "Backend" cmd /k "cd backend && uvicorn main:app --host 0.0.0.0 --port 8000"

start "Frontend" cmd /k "cd frontend && npm run dev"

timeout /t 5 /nobreak

start http://localhost:5173

exit