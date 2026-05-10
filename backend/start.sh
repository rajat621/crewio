#!/bin/bash

# Backend startup script
echo "Starting Crew Control Backend..."
cd "$(dirname "$0")"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Start backend
npm run start
