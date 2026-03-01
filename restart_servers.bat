@echo off
echo ============================================
echo Restarting Backend and Frontend Servers
echo ============================================

echo.
echo [1/4] Stopping Python backend processes...
taskkill /F /IM python.exe 2>nul
timeout /t 2 /nobreak >nul

echo [2/4] Stopping Node/NPM frontend processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo [3/4] Starting Backend Server...
cd backend
start "Backend Server" cmd /k "poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
cd ..

echo Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

echo.
echo [4/4] Starting Frontend Server...
cd frontend
start "Frontend Server" cmd /k "npm run dev"
cd ..

echo.
echo ============================================
echo Servers are restarting!
echo ============================================
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo Press any key to close this window...
pause >nul
