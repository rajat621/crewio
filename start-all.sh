#!/bin/bash

# Complete project startup script
echo "Starting Crew Control Project..."

# Start backend in background
echo "Starting Backend..."
cd "$(dirname "$0")/backend"
npm run start &
BACKEND_PID=$!

# Start AI service in background
echo "Starting AI Service..."
cd "$(dirname "$0")/ai-service"
python main.py &
AI_PID=$!

# Start frontend in background
echo "Starting Frontend..."
cd "$(dirname "$0")/crewcontrol-fron"
npm run dev &
FRONTEND_PID=$!

echo "All services started!"
echo "Backend PID: $BACKEND_PID"
echo "AI Service PID: $AI_PID"
echo "Frontend PID: $FRONTEND_PID"

# Wait for all processes
wait
