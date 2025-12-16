@echo off
echo Starting BI Dashboard...
echo.

echo Starting Backend API...
start "Backend API" cmd /k "cd backend && poetry run python run_server.py"
timeout /t 3 /nobreak > nul

echo Starting Frontend Dashboard...
start "Frontend Dashboard" cmd /k "cd frontend && npm run dev"
timeout /t 3 /nobreak > nul

echo.
echo ========================================
echo Backend API: http://localhost:8000
echo Frontend:    http://localhost:5173
echo API Docs:    http://localhost:8000/docs
echo ========================================
echo.
echo Press any key to open dashboard in browser...
pause > nul

start http://localhost:5173
