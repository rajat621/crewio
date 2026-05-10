@echo off
REM Complete project startup script for Windows

cd /d "%~dp0"

echo Starting Crew Control Project...
echo.

REM Start Backend
echo [1/3] Starting Backend on port 5000...
start "Crew Control Backend" cmd /k "cd /d "%cd%\backend" && npm run start"
timeout /t 3 /nobreak

REM Start AI Service
echo [2/3] Starting AI Service on port 8001...
start "Crew Control AI Service" cmd /k "cd /d "%cd%\ai-service" && python main.py"
timeout /t 3 /nobreak

REM Start Frontend
echo [3/3] Starting Frontend on port 5173...
start "Crew Control Frontend" cmd /k "cd /d "%cd%\crewcontrol-fron" && npm run dev"

echo.
echo All services started!
echo Backend: http://localhost:5000
echo Frontend: http://localhost:5173
echo AI Service: http://localhost:8001
