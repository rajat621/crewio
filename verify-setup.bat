@echo off
REM Verification script to check if all components are ready
setlocal enabledelayedexpansion

echo.
echo ========================================
echo Crew Control - Project Verification
echo ========================================
echo.

set /a TOTAL=0
set /a PASSED=0

REM Check Backend
echo Checking Backend...
set /a TOTAL+=1
if exist "backend\package.json" if exist "backend\.env" if exist "backend\src\server.js" (
    echo [PASS] Backend files present
    set /a PASSED+=1
) else (
    echo [FAIL] Backend files missing
)

REM Check Backend node_modules
echo Checking Backend Dependencies...
set /a TOTAL+=1
if exist "backend\node_modules" (
    echo [PASS] Backend node_modules present
    set /a PASSED+=1
) else (
    echo [WARN] Backend node_modules not found. Run: cd backend && npm install
)

REM Check Frontend
echo Checking Frontend...
set /a TOTAL+=1
if exist "crewcontrol-fron\package.json" (
    if exist "crewcontrol-fron\src\App.tsx" (
        echo [PASS] Frontend files present
        set /a PASSED+=1
    ) else if exist "crewcontrol-fron\src\app\App.jsx" (
        echo [PASS] Frontend files present
        set /a PASSED+=1
    ) else (
        echo [FAIL] Frontend files missing
    )
) else (
    echo [FAIL] Frontend files missing
)

REM Check Frontend node_modules
echo Checking Frontend Dependencies...
set /a TOTAL+=1
if exist "crewcontrol-fron\node_modules" (
    echo [PASS] Frontend node_modules present
    set /a PASSED+=1
) else (
    echo [WARN] Frontend node_modules not found. Run: cd crewcontrol-fron && npm install
)

REM Check AI Service
echo Checking AI Service...
set /a TOTAL+=1
if exist "ai-service\main.py" if exist "ai-service\extractor.py" if exist "ai-service\requirements.txt" (
    echo [PASS] AI Service files present
    set /a PASSED+=1
) else (
    echo [FAIL] AI Service files missing
)

REM Check Start Scripts
echo Checking Start Scripts...
set /a TOTAL+=1
if exist "start-all.bat" if exist "backend\start.bat" if exist "ai-service\start.bat" (
    echo [PASS] Start scripts present
    set /a PASSED+=1
) else (
    echo [FAIL] Start scripts missing
)

REM Check Node version
echo Checking Node.js...
set /a TOTAL+=1
node --version >nul 2>&1
if !ERRORLEVEL! equ 0 (
    for /f "tokens=*" %%A in ('node --version') do (
        echo [PASS] Node.js %%A found
        set /a PASSED+=1
    )
) else (
    echo [WARN] Node.js not found. Install from https://nodejs.org/
)

REM Summary
echo.
echo ========================================
echo Verification Summary
echo ========================================
echo Checks Passed: !PASSED!/%TOTAL%
echo.

if !PASSED! equ %TOTAL% (
    echo ✓ All checks passed! Project is ready to run.
    echo.
    echo To start all services, run:
    echo   start-all.bat
    echo.
    echo Or start individually:
    echo   cd backend ^&^& npm run start
    echo   cd ai-service ^&^& python main.py
    echo   cd crewcontrol-fron ^&^& npm run dev
    echo.
) else (
    echo ⚠ Some checks failed or warnings present.
    echo Please review the messages above.
)

echo ========================================
pause
