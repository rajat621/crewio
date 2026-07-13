# Setup Verification Checklist

Use this checklist to verify all components are correctly installed and configured.

## ✅ Prerequisites

- [ ] Windows 10+ / macOS 11+ / Linux (Ubuntu 20+)
- [ ] 8GB+ RAM
- [ ] 10GB+ free disk space
- [ ] Active internet connection

---

## ✅ Core Tools Installation

### Git
```bash
git --version
# Expected: git version 2.x.x or higher
```
- [ ] Installed
- [ ] Added to PATH

### Node.js & npm
```bash
node --version
# Expected: v18.x.x or higher

npm --version
# Expected: v9.x.x or higher
```
- [ ] Node.js installed
- [ ] npm available

### Docker & Docker Compose
```bash
docker --version
docker-compose --version
# Expected: Docker version 20.10+ and Docker Compose 2.0+
```
- [ ] Docker Desktop running
- [ ] Docker Compose available

### Flutter SDK
```bash
flutter --version
flutter doctor
# All checks should show ✓ (except Xcode on Windows/Linux)
```
- [ ] Flutter 3.0+ installed
- [ ] Flutter in PATH
- [ ] Dart SDK available

### Android SDK (for mobile)
```bash
flutter doctor --android-licenses
# Should show: All SDK licenses accepted
```
- [ ] Android SDK installed
- [ ] Android emulator available
- [ ] SDK licenses accepted

---

## ✅ Backend Setup

```bash
cd backend
```

- [ ] `package.json` exists
- [ ] `tsconfig.json` exists
- [ ] `.env.example` exists
- [ ] Created `.env` from example
- [ ] JWT_SECRET is set (min 32 chars)
- [ ] MongoDB connection string is valid

### Install & Verify Backend

```bash
npm install
npm run build
# Expected: Builds without errors

npm run start:dev
# Expected: 🚀 Server running on http://localhost:3000
# Expected: WebSocket gateway initialized
```

- [ ] npm install succeeds
- [ ] Build succeeds
- [ ] Server starts without errors
- [ ] Listening on port 3000
- [ ] MongoDB connected

### Test Backend API

```bash
curl http://localhost:3000/health
# Should return: { "status": "ok" }
```

- [ ] Health check endpoint responds
- [ ] MongoDB queries work
- [ ] JWT auth middleware loaded

---

## ✅ Mobile App Setup

```bash
cd ../mobile-app
```

- [ ] `pubspec.yaml` exists
- [ ] `main.dart` exists (with imports)
- [ ] `lib/src/` structure created
- [ ] Models (Freezed, Isar) defined
- [ ] Services (API, Sync, DB) implemented

### Install & Generate Code

```bash
flutter pub get
# Expected: Dependencies resolved

dart run build_runner build
# Expected: Code generation succeeds
```

- [ ] All dependencies resolve
- [ ] Code generation completes
- [ ] No build errors
- [ ] Generated files created

### Run on Emulator

```bash
flutter run
# Expected: App launches on emulator
# Expected: Can navigate screens without crashes
```

- [ ] App builds successfully
- [ ] App launches on emulator
- [ ] No runtime errors
- [ ] Hot reload works (press 'r')

---

## ✅ MongoDB Setup

### MongoDB Connection Test

```bash
# If using MongoDB Atlas:
mongosh "mongodb+srv://admin:password@cluster0.xxxxx.mongodb.net/crewio"

# If using local MongoDB:
mongosh mongodb://admin:password@localhost:27017/crewio

# Check if connected:
db.adminCommand('ping')
# Should return: { ok: 1 }
```

- [ ] Can connect to MongoDB
- [ ] Database `crewio` exists
- [ ] Collections created:
  - [ ] `users`
  - [ ] `operations`
  - [ ] `messages`
  - [ ] `conversations`
  - [ ] `attendances`

### Verify Replica Set (if using local)

```bash
rs.status()
# Should show replica set with 1+ members
```

- [ ] Replica set initialized (if using local)
- [ ] Change Streams available

---

## ✅ Docker Compose (Alternative Setup)

```bash
cd infra
docker-compose up -d
# Expected: All services start

docker-compose ps
# Expected: All services "Up"

docker-compose logs -f backend
# Expected: No error logs
```

- [ ] docker-compose.yml is valid
- [ ] All services start successfully
- [ ] MongoDB is ready (healthy)
- [ ] Backend is running
- [ ] Redis is running

### Test Docker Stack

```bash
curl http://localhost:3000/health
# Expected: { "status": "ok" }

mongosh -u admin -p password --authSource admin
> db.adminCommand('ping')
# Expected: { ok: 1 }
```

- [ ] Backend responds from Docker
- [ ] MongoDB responds from Docker
- [ ] Network connectivity working

---

## ✅ Environment Configuration

### Backend (.env)

```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb+srv://...  # or mongodb://...
JWT_SECRET=<at-least-32-random-characters>
JWT_EXPIRATION=3600
WEBSOCKET_PORT=3000
CORS_ORIGIN=http://localhost:*
```

- [ ] NODE_ENV set correctly
- [ ] PORT set to 3000
- [ ] MONGODB_URI points to valid database
- [ ] JWT_SECRET is strong (32+ chars)
- [ ] CORS_ORIGIN includes localhost

### Flutter (API Service)

Check `mobile-app/lib/src/services/api_service.dart`:
```dart
final String baseUrl;
ApiService({this.baseUrl = 'http://localhost:3000'})
```

- [ ] API_BASE_URL points to backend
- [ ] WEBSOCKET_URL points to backend
- [ ] Port numbers match

---

## ✅ Project Structure

Verify complete folder structure:

```bash
tree -d -L 2
# Or use your file explorer
```

- [ ] `backend/` folder with `src/`, `package.json`
- [ ] `mobile-app/` folder with `lib/`, `pubspec.yaml`
- [ ] `infra/` folder with `docker-compose.yml`
- [ ] `docs/` folder with `.md` files
- [ ] Root files: `.gitignore`, `README.md`, `start.sh/start.bat`

---

## ✅ Documentation

- [ ] `README.md` - Project overview
- [ ] `PROJECT_SUMMARY.md` - Quick reference
- [ ] `SYNC_PROTOCOL.md` - Sync design details
- [ ] `API_SPEC.md` - API endpoints
- [ ] `SETUP.md` - Setup instructions
- [ ] `DESIGN_REFERENCE.md` - UI screen guidelines

---

## ✅ Git & Version Control

```bash
git init
git add .
git commit -m "Initial commit: Project scaffold"
```

- [ ] `.gitignore` configured
- [ ] Initial commit made
- [ ] Remote repository set (if using GitHub)

---

## ✅ One-Command Startup

### Windows

```bash
cd c:\Users\rajat\Desktop\Nimora\Crewio
start.bat
```

- [ ] `start.bat` created
- [ ] `start.bat` is executable
- [ ] Backend starts in new window
- [ ] Docker services start

### macOS/Linux

```bash
cd ~/Desktop/Nimora/Crewio
chmod +x start.sh
./start.sh
```

- [ ] `start.sh` created
- [ ] `start.sh` is executable
- [ ] All services start

---

## ✅ Final Integration Test

### Test 1: Backend & Database

```bash
# Terminal 1
cd backend
npm run start:dev

# Terminal 2
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test123!","name":"Test User"}'

# Expected: User created successfully
```

- [ ] User registration works
- [ ] Data stored in MongoDB
- [ ] JWT token returned

### Test 2: Mobile App

```bash
# Terminal 1
cd mobile-app
flutter run

# In app:
# 1. Can see login screen
# 2. Text fields are functional
# 3. No console errors
```

- [ ] App launches
- [ ] UI renders correctly
- [ ] No crashes

### Test 3: Offline Sync (Manual)

```bash
# In Flutter app, simulate offline:
# Android: Settings → Developer options → Simulate offline
# Or: Disconnect WiFi/mobile data

# Try to queue an operation locally
# Expected: Operation stored in Isar DB (app doesn't crash)

# Reconnect to network
# Expected: Automatic sync triggers
# Expected: Operation sent to backend
```

- [ ] Offline queueing works
- [ ] Sync triggers when online
- [ ] Operations applied on server

---

## ✅ Performance Baseline (Optional)

```bash
# Measure initial startup time
time npm run start:dev

# Measure database query time
mongosh --eval "db.users.find().explain('executionStats')"

# Measure API response time
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/health
```

- [ ] Backend starts in < 5 seconds
- [ ] Database queries < 100ms
- [ ] API responses < 500ms

---

## 🎯 What's Next?

If all checkboxes above are ✅, you're ready to:

1. **Share UI/Screen Designs** ← NEXT STEP
   - Figma link or mockups
   - I'll implement exact designs

2. **Test Features**
   - Login/register
   - Chat functionality
   - Attendance tracking
   - Offline sync

3. **Deployment**
   - Staging environment
   - User acceptance testing (UAT)
   - Production release

---

## 🆘 Troubleshooting

If any checks fail, see:
- [docs/SETUP.md](./docs/SETUP.md) - Detailed setup guide
- [docs/README.md](./README.md) - Architecture overview
- Terminal error messages (look for red text)
- Backend logs: `npm run start:dev` output
- App logs: `flutter logs`

---

**Last Updated**: May 2, 2026  
**Status**: Setup Verification Ready
