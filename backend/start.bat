@echo off
REM Backend startup script for Windows
echo Starting Crew Control Backend...
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
)

call npm run start
