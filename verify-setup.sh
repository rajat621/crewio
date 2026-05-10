#!/bin/bash

# Verification script to check if all components are ready

echo ""
echo "========================================"
echo "Crew Control - Project Verification"
echo "========================================"
echo ""

TOTAL=0
PASSED=0

# Check Backend
echo "Checking Backend..."
TOTAL=$((TOTAL + 1))
if [ -f "backend/package.json" ] && [ -f "backend/.env" ] && [ -f "backend/src/server.js" ]; then
    echo "[PASS] Backend files present"
    PASSED=$((PASSED + 1))
else
    echo "[FAIL] Backend files missing"
fi

# Check Backend node_modules
echo "Checking Backend Dependencies..."
TOTAL=$((TOTAL + 1))
if [ -d "backend/node_modules" ]; then
    echo "[PASS] Backend node_modules present"
    PASSED=$((PASSED + 1))
else
    echo "[WARN] Backend node_modules not found. Run: cd backend && npm install"
fi

# Check Frontend
echo "Checking Frontend..."
TOTAL=$((TOTAL + 1))
if [ -f "crewcontrol-fron/package.json" ] && [ -f "crewcontrol-fron/src/App.jsx" ]; then
    echo "[PASS] Frontend files present"
    PASSED=$((PASSED + 1))
else
    echo "[FAIL] Frontend files missing"
fi

# Check Frontend node_modules
echo "Checking Frontend Dependencies..."
TOTAL=$((TOTAL + 1))
if [ -d "crewcontrol-fron/node_modules" ]; then
    echo "[PASS] Frontend node_modules present"
    PASSED=$((PASSED + 1))
else
    echo "[WARN] Frontend node_modules not found. Run: cd crewcontrol-fron && npm install"
fi

# Check AI Service
echo "Checking AI Service..."
TOTAL=$((TOTAL + 1))
if [ -f "ai-service/main.py" ] && [ -f "ai-service/extractor.py" ] && [ -f "ai-service/requirements.txt" ]; then
    echo "[PASS] AI Service files present"
    PASSED=$((PASSED + 1))
else
    echo "[FAIL] AI Service files missing"
fi

# Check Start Scripts
echo "Checking Start Scripts..."
TOTAL=$((TOTAL + 1))
if [ -f "start-all.sh" ] && [ -f "backend/start.sh" ] && [ -f "ai-service/start.sh" ]; then
    echo "[PASS] Start scripts present"
    PASSED=$((PASSED + 1))
else
    echo "[FAIL] Start scripts missing"
fi

# Check Node version
echo "Checking Node.js..."
TOTAL=$((TOTAL + 1))
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "[PASS] Node.js $NODE_VERSION found"
    PASSED=$((PASSED + 1))
else
    echo "[WARN] Node.js not found. Install from https://nodejs.org/"
fi

# Summary
echo ""
echo "========================================"
echo "Verification Summary"
echo "========================================"
echo "Checks Passed: $PASSED/$TOTAL"
echo ""

if [ $PASSED -eq $TOTAL ]; then
    echo "✓ All checks passed! Project is ready to run."
    echo ""
    echo "To start all services, run:"
    echo "  bash start-all.sh"
    echo ""
    echo "Or start individually:"
    echo "  cd backend && npm run start"
    echo "  cd ai-service && python main.py"
    echo "  cd crewcontrol-fron && npm run dev"
    echo ""
else
    echo "⚠ Some checks failed or warnings present."
    echo "Please review the messages above."
fi

echo "========================================"
