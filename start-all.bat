@echo off
REM Complete project startup script for Windows

setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo Starting Crew Control Project...
echo.

REM Start Backend
echo [1/3] Starting Backend on port 5000...
call :is_port_in_use 5000 BACKEND_IN_USE
if "%BACKEND_IN_USE%"=="1" (
	echo Port 5000 is already in use. Skipping backend start.
) else (
	start "Crew Control Backend" cmd /k "cd /d \"%ROOT%backend\" && npm run start"
	timeout /t 3 /nobreak >nul
)

REM Start AI Service
echo [2/3] Starting AI Service on port 8001...
call :is_port_in_use 8001 AI_IN_USE
if "%AI_IN_USE%"=="1" (
	echo Port 8001 is already in use. Skipping AI service start.
) else (
	start "Crew Control AI Service" cmd /k "cd /d \"%ROOT%ai-service\" && py -3.13 main.py"
	timeout /t 3 /nobreak >nul
)

REM Start Frontend
echo [3/3] Starting Frontend on port 5173...
call :is_port_in_use 5173 FRONTEND_IN_USE
if "%FRONTEND_IN_USE%"=="1" (
	echo Port 5173 is already in use. Skipping frontend start.
) else (
	start "Crew Control Frontend" cmd /k "cd /d \"%ROOT%crewcontrol-fron\" && npm run dev"
)

echo.
echo Startup check completed.
echo Backend: http://localhost:5000
echo Frontend: http://localhost:5173
echo AI Service: http://localhost:8001

endlocal
exit /b 0

:is_port_in_use
set "%~2=0"
for /f "tokens=5" %%I in ('netstat -ano ^| findstr /R /C:":%~1 .*LISTENING"') do (
	set "%~2=1"
	goto :eof
)
exit /b 0
