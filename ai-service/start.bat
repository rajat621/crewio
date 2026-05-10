@echo off
REM AI Service startup script for Windows
echo Starting AI Service...
cd /d "%~dp0"

REM Create virtual environment if it doesn't exist
if not exist "venv" (
  echo Creating virtual environment...
  python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install requirements
if exist "requirements.txt" (
  echo Installing requirements...
  pip install -r requirements.txt
)

REM Start AI service
python main.py
