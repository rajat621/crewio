# Environment Setup Guide

## System Requirements

- **OS**: Windows 10+, macOS 11+, Linux (Ubuntu 20+)
- **Disk**: 10GB+ free space
- **RAM**: 8GB minimum (16GB recommended)
- **Internet**: For downloading SDKs and packages

---

## 1. Install Core Tools (Windows)

### Using Chocolatey (Recommended)

```powershell
# Install Chocolatey (run as Administrator)
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install required tools
choco install git nodejs-lts docker-desktop -y

# Verify installations
git --version
node --version
npm --version
docker --version
```

### Manual Installation

1. **Git**: https://git-scm.com/download/win
2. **Node.js LTS**: https://nodejs.org/
3. **Docker Desktop**: https://www.docker.com/products/docker-desktop
4. **VS Code**: https://code.visualstudio.com/

---

## 2. Install Flutter SDK

### Windows

```powershell
# Download Flutter SDK
# https://flutter.dev/docs/get-started/install/windows

# Extract to C:\flutter (or your preferred location)
Expand-Archive flutter_windows_3.x.x-stable.zip -DestinationPath C:\

# Add Flutter to PATH
$env:Path += ";C:\flutter\bin"

# Verify installation
flutter doctor
```

**Expected output:**
```
Doctor summary (to get all diagnostic messages run flutter doctor -v):
[✓] Flutter (Channel stable, 3.x.x)
[✓] Windows Version
[ ] Android toolchain
[ ] Xcode (when on macOS)
[ ] VS Code
```

### macOS

```bash
# Using Homebrew
brew install flutter

# Or download manually from https://flutter.dev
curl https://storage.googleapis.com/flutter_infra_release/releases/stable/macos/flutter_macos_arm64_3.x.x-stable.zip -o flutter.zip
unzip flutter.zip -d ~/

# Add to PATH
export PATH="$PATH:$(pwd)/flutter/bin"

# Verify
flutter doctor
```

---

## 3. Setup Android Development (for mobile builds)

### Install Android Studio

```powershell
choco install androidstudio -y
# Or download from: https://developer.android.com/studio
```

### Setup Android SDK

```powershell
# In Android Studio:
# 1. Open SDK Manager (Tools → SDK Manager)
# 2. Ensure installed:
#    - Android SDK Platform 33 (or latest)
#    - Android SDK Build-Tools 33.0.0 (or latest)
#    - Android Emulator
#    - Android SDK Platform-Tools

# Set ANDROID_HOME environment variable
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk", "User")

# Restart terminal or run:
$env:ANDROID_HOME = "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk"
```

### Create Android Emulator

```powershell
# In Android Studio:
# 1. Tools → Device Manager
# 2. Click "Create Device"
# 3. Select Pixel 6 (or latest)
# 4. Select system image (API 33+)
# 5. Finish

# Or via command line:
flutter emulators --launch pixel_6_api_33
```

---

## 4. Setup MongoDB

### Option A: MongoDB Atlas (Cloud - Recommended for Dev)

1. Create account: https://www.mongodb.com/cloud/atlas
2. Create free cluster (M0)
3. Create database user (username: `admin`, password: save it)
4. Add IP address to Network Access (allow all: `0.0.0.0/0` for dev)
5. Get connection string:
   ```
   mongodb+srv://admin:<password>@cluster0.xxxxx.mongodb.net/crewio?retryWrites=true&w=majority
   ```

### Option B: Local MongoDB (Docker)

```powershell
# Run MongoDB with Docker
docker run -d ^
  --name mongodb ^
  -p 27017:27017 ^
  -e MONGO_INITDB_ROOT_USERNAME=admin ^
  -e MONGO_INITDB_ROOT_PASSWORD=password ^
  mongo:7.0

# Connection string:
# mongodb://admin:password@localhost:27017/crewio?authSource=admin
```

### Option C: Local MongoDB Replica Set (for Change Streams)

```bash
# Install MongoDB Community: https://docs.mongodb.com/manual/installation/

# Linux (Ubuntu):
sudo apt-get install -y mongodb

# macOS:
brew install mongodb-community

# Windows: Download MSI installer

# Start MongoDB replica set
mongod --replSet rs0 --dbpath "C:\data\db"  # Windows
# or
mongod --replSet rs0  # macOS/Linux

# In another terminal, initialize replica set
mongosh
> rs.initiate()
> exit

# Verify
mongosh --eval "rs.status()"
```

---

## 5. Backend Setup

### Clone & Install Dependencies

```bash
cd backend

# Install Node dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your settings
# vim .env  # or use your editor
```

### .env Configuration

```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb+srv://admin:password@cluster0.xxxxx.mongodb.net/crewio?retryWrites=true&w=majority
JWT_SECRET=your-secret-key-change-in-production-with-min-32-chars
JWT_EXPIRATION=3600
WEBSOCKET_PORT=3000
CORS_ORIGIN=http://localhost:3000,http://localhost:8080,http://localhost:5173
```

### Run Backend

```bash
# Development (with hot reload)
npm run start:dev

# Expected output:
# [Nest] 12345  - 05/02/2026, 12:00:00 PM     LOG [NestFactory] Starting Nest application...
# 🚀 Server running on http://localhost:3000
```

---

## 6. Flutter Mobile App Setup

### Install Dependencies

```bash
cd mobile-app

# Get Flutter packages
flutter pub get

# Install build_runner (for code generation)
flutter pub add build_runner

# Generate code (Freezed, Isar, json_serializable)
dart run build_runner build
```

### Run on Emulator

```bash
# List available devices
flutter devices

# Run on Android emulator
flutter run

# Or specify device
flutter run -d emulator-5554

# Hot reload
# Press 'r' in terminal to reload
# Press 'R' to restart
```

### Run on Physical Device

```bash
# Enable Developer Mode on Android device
# Settings → About phone → Tap "Build Number" 7 times
# Settings → System → Developer options → USB debugging (ON)

# Connect via USB and verify connection
adb devices

# Run
flutter run
```

---

## 7. Full Stack with Docker Compose

### Prerequisites

- Docker Desktop installed and running

### Quick Start

```bash
cd infra

# Start all services
docker-compose up -d

# Wait ~30s for MongoDB to initialize

# Verify services
docker-compose ps

# Expected output:
# NAME              STATUS
# crewio-mongodb    Up (healthy)
# crewio-redis      Up
# crewio-backend    Up

# Check backend logs
docker-compose logs -f backend
```

### Accessing Services

- **Backend API**: http://localhost:3000
- **MongoDB**: `mongodb://admin:password@localhost:27017`
- **Redis**: `localhost:6379`

### Test Backend is Running

```bash
# In another terminal
curl http://localhost:3000/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}'
```

### Stop Services

```bash
docker-compose down

# Remove volumes (dangerous - loses data)
docker-compose down -v
```

---

## 8. IDE & Extensions Setup

### VS Code Extensions (Recommended)

Install these in VS Code:

- **Flutter**: by Dart Code (flutter.flutter)
- **Dart**: by Dart Code (dart-code.dart-code)
- **REST Client**: by Huachao Mao (humao.rest-client)
- **MongoDB for VS Code**: by MongoDB (mongodb.mongodb-vscode)
- **Thunder Client**: by Rangav (rangav.vscode-thunder-client)
- **ESLint**: by Microsoft (eslint.eslint)
- **Prettier**: by Prettier (esbenp.prettier-vscode)

### Launch Configuration (.vscode/launch.json)

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Flutter Debug",
      "type": "dart",
      "request": "launch",
      "program": "lib/main.dart",
      "cwd": "${workspaceFolder}/mobile-app"
    }
  ]
}
```

---

## 9. Verify Complete Setup

### Checklist

```bash
# 1. Flutter
flutter doctor
# All checks should be ✓ (except possibly Xcode if on Windows)

# 2. Git
git --version
# git version 2.x.x

# 3. Node & npm
node --version
# v18.x.x or higher
npm --version
# v9.x.x or higher

# 4. Docker
docker --version
# Docker version 20.x.x or higher

# 5. MongoDB connection
mongosh --eval "db.adminCommand('ping')"
# { ok: 1 }

# 6. Backend runs
cd backend && npm run start:dev
# Should print: 🚀 Server running on http://localhost:3000

# 7. Flutter app builds
cd mobile-app && flutter build apk --debug
# Build should succeed

# 8. WebSocket connects
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://localhost:3000/socket.io/
```

---

## 10. Common Issues & Fixes

### Issue: "Flutter not found"

**Solution**:
```powershell
# Check if Flutter is in PATH
$env:Path -split ";" | Select-String "flutter"

# If not, add to PATH:
[Environment]::SetEnvironmentVariable("Path", "$env:Path;C:\flutter\bin", "User")

# Restart terminal or:
$env:Path += ";C:\flutter\bin"
```

### Issue: "Android SDK not found"

**Solution**:
```bash
flutter config --android-sdk /path/to/android/sdk
flutter doctor --android-licenses  # Accept all licenses
```

### Issue: "MongoDB connection refused"

**Solution**:
```bash
# Check if MongoDB is running
docker ps  # or `mongosh` to test

# Restart Docker
docker restart mongodb

# Or verify connection string
mongosh "mongodb://admin:password@localhost:27017"
```

### Issue: "npm ERR! cannot find module"

**Solution**:
```bash
cd backend
rm -rf node_modules package-lock.json
npm install
```

### Issue: "Port already in use"

**Solution**:
```bash
# Find process using port 3000
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Kill process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows
```

---

## Next Steps

1. ✅ Complete this setup
2. 📱 Run `flutter run` to test the app on emulator
3. 🖥️ Run `npm run start:dev` to test the backend
4. 💬 Share your UI/screen designs
5. 🚀 Start implementing features

---

**Last Updated**: May 2, 2026  
**Status**: ✅ Ready for Development
