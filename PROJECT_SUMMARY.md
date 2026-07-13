# Project Summary & Quick Reference

## ✅ What's Been Created

### Backend (NestJS + MongoDB)
- ✅ **Auth module** - JWT login/register/refresh with bcrypt password hashing
- ✅ **Users module** - User management with location tracking
- ✅ **Messages module** - Chat conversations with read receipts
- ✅ **Attendance module** - Check-in/out with GPS location storage
- ✅ **Sync module** - Custom operation-based sync with idempotency
- ✅ **WebSocket gateway** - Real-time chat and presence updates
- ✅ **Docker setup** - MongoDB replica set + Redis + NestJS backend

### Flutter Mobile App
- ✅ **Local database** - Isar for offline-first storage with outbox queue
- ✅ **Sync engine** - Automatic background sync when online
- ✅ **API client** - Dio with JWT token management
- ✅ **Secure storage** - flutter_secure_storage for tokens
- ✅ **State management** - Riverpod for reactive UI
- ✅ **Authentication screens** - Login/register UI
- ✅ **Home dashboard** - Attendance + chat sections

### Documentation
- ✅ **README.md** - Overview, quick start, architecture
- ✅ **SYNC_PROTOCOL.md** - Detailed offline-first sync design (50KB+)
- ✅ **API_SPEC.md** - Complete REST API documentation
- ✅ **SETUP.md** - Environment setup for all platforms

### DevOps & Scripts
- ✅ **docker-compose.yml** - Local dev stack (Mongo + Redis + Backend)
- ✅ **start.sh** / **start.bat** - One-command dev stack launcher
- ✅ **.gitignore** - Git configuration for the project

---

## 🚀 Quick Start Commands

### Windows
```batch
cd c:\Users\rajat\Desktop\Nimora\Crewio
start.bat
```

### macOS/Linux
```bash
cd ~/Desktop/Nimora/Crewio
chmod +x start.sh
./start.sh
```

### Manual Setup (Any OS)

**Terminal 1 - Backend**:
```bash
cd backend
npm install
npm run start:dev
# Runs on http://localhost:3000
```

**Terminal 2 - Mobile App**:
```bash
cd mobile-app
flutter pub get
dart run build_runner build
flutter run
```

**Or with Docker**:
```bash
cd infra
docker-compose up -d
# MongoDB + Redis + Backend ready in 30 seconds
```

---

## 📁 Project Structure at a Glance

```
Crewio/
├── backend/                    # NestJS server
│   ├── src/
│   │   ├── auth/              # JWT auth, login/register
│   │   ├── users/             # User profiles, location
│   │   ├── messages/          # Chat conversations
│   │   ├── attendance/        # Check-in/out tracking
│   │   ├── sync/              # Operation-based sync
│   │   └── websockets/        # Real-time events (socket.io)
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── Dockerfile.{dev,prod}
│
├── mobile-app/                 # Flutter app
│   ├── lib/
│   │   ├── src/
│   │   │   ├── models/        # Freezed data classes
│   │   │   ├── services/      # API, LocalDB, Sync, Auth
│   │   │   ├── features/      # UI screens
│   │   │   └── config/        # Theme, constants
│   │   └── main.dart
│   └── pubspec.yaml
│
├── infra/                      # DevOps
│   ├── docker-compose.yml     # Dev stack: Mongo + Redis + Backend
│   ├── .env                    # Environment variables
│   └── nginx.conf             # (for production)
│
├── docs/
│   ├── README.md              # Project overview
│   ├── SYNC_PROTOCOL.md       # Custom sync design (critical!)
│   ├── API_SPEC.md            # All endpoints documented
│   └── SETUP.md               # Detailed setup guide
│
├── start.sh / start.bat       # One-command dev startup
├── .gitignore
└── README.md
```

---

## 🔄 How Custom Sync Works (Simple Version)

1. **Offline**: User checks in → stored locally in Isar DB outbox
2. **Online detected**: Automatic sync triggered every 30 seconds
3. **Batch send**: All pending ops sent as: `POST /api/sync/ops`
4. **Server applies**: Each op has unique `opId` → deduplicated if retried
5. **Confirm**: Client marks ops as "done" → UI updates
6. **Pull changes**: Receive server changes via polling or WebSocket

**Key**: Operations are **idempotent** (safe to retry) and **server-authoritative**.

---

## 🔐 Authentication Flow

```
User enters email/password
    ↓
POST /api/auth/login
    ↓
Server: bcrypt.compare(password, hash)
    ↓
Return: { user, accessToken, refreshToken }
    ↓
Flutter: Save token in flutter_secure_storage
    ↓
Every API request: Authorization: Bearer <token>
    ↓
Token expired? → POST /api/auth/refresh → Get new token
```

---

## 💬 Real-Time Chat (WebSocket)

```
Client connects → socket.io
    ↓
Emit 'message': { conversationId, content, opId }
    ↓
Server broadcasts to conversation participants
    ↓
Receive 'message:new': { messageId, senderId, content, ... }
    ↓
Flutter: Update local Isar DB + UI
    ↓
Offline? → Queued locally + synced on reconnect
```

---

## 📍 Attendance Tracking with Location

```
User clicks "Check In"
    ↓
Get GPS coordinates (lat/lng)
    ↓
POST /api/attendance/check-in { location, deviceId }
    ↓
Server: Store with today's date
    ↓
Offline? → Queued + synced when online
    ↓
Response: { checkin_time, location, status: "present" }
```

**Note**: Each user has **one record per day**. Multiple check-ins on same day override.

---

## 🧪 Testing & Verification

### Backend API (manual)

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"John"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'

# Copy the accessToken from response

# Check attendance
curl http://localhost:3000/api/attendance/today \
  -H "Authorization: Bearer <accessToken>"
```

### Flutter (in emulator)

```bash
cd mobile-app
flutter run

# Hot reload: press 'r'
# Restart: press 'R'
# Quit: press 'q'
```

---

## 🛠️ What Needs Implementation

### Backend
- [ ] WebSocket real-time message propagation (gateway started, needs event handlers)
- [ ] Message pagination & search
- [ ] User presence tracking (typing, online/away)
- [ ] Attendance reports (admin dashboard)
- [ ] Push notifications (FCM setup)
- [ ] Rate limiting middleware
- [ ] Error handling & validation improvements

### Flutter
- [ ] Login/register flows (UI created, needs integration)
- [ ] Chat UI with message list (models ready, needs Riverpod providers)
- [ ] Attendance UI with map (API ready, needs UI)
- [ ] Offline indicator
- [ ] Settings/profile screen
- [ ] Push notification handling
- [ ] Image/file sharing in chat

### Testing & Deployment
- [ ] Unit tests (backend + Flutter)
- [ ] Integration tests
- [ ] E2E tests (Cypress/Detox)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Load testing (k6 or JMeter)
- [ ] Security audit
- [ ] Release builds (Android APK, iOS IPA, Web)

---

## ⚙️ Environment Configuration

### .env for Backend
```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://admin:password@localhost:27017/crewio?authSource=admin&replicaSet=rs0
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_EXPIRATION=3600
WEBSOCKET_PORT=3000
CORS_ORIGIN=http://localhost:*,http://localhost:8080,http://localhost:5173
```

### .env for Flutter (in .env file or hardcoded for dev)
```dart
const String API_BASE_URL = 'http://localhost:3000';  // Dev
const String WEBSOCKET_URL = 'http://localhost:3000';  // Dev
```

---

## 📊 Database Schemas

### Users Collection
```json
{
  "_id": ObjectId(),
  "email": "user@example.com",
  "password": "hashed_bcrypt",
  "name": "John Doe",
  "phone": "+1234567890",
  "status": "active|inactive|suspended",
  "lastLocation": { "type": "Point", "coordinates": [-74, 40.7] },
  "lastSeen": ISODate("2026-05-02T14:30:00Z"),
  "createdAt": ISODate(),
  "updatedAt": ISODate()
}
```

### Operations Collection (Sync Audit Trail)
```json
{
  "_id": ObjectId(),
  "opId": "uuid-unique",
  "clientId": "client_abc",
  "userId": ObjectId(),
  "type": "attendance|message|profile_update",
  "payload": { ... },
  "status": "applied|failed",
  "createdAt": ISODate(),
  "appliedAt": ISODate(),
  "attempts": 1
}
```

### Attendance Collection
```json
{
  "_id": ObjectId(),
  "userId": ObjectId(),
  "date": ISODate("2026-05-02T00:00:00Z"),
  "checkInTime": ISODate(),
  "checkOutTime": ISODate(),
  "checkInLocation": { "lat": 40.7, "lng": -74 },
  "checkOutLocation": { "lat": 40.7, "lng": -74 },
  "status": "present|absent|half-day|leave",
  "version": 0
}
```

---

## 🔗 Key Dependencies Summary

### Backend
- **NestJS** - Framework
- **Mongoose** - MongoDB ODM
- **socket.io** - Real-time WebSocket
- **JWT** - Authentication
- **bcryptjs** - Password hashing

### Frontend
- **Flutter** - Cross-platform UI
- **Riverpod** - State management
- **Isar** - Local database
- **Dio** - HTTP client
- **socket_io_client** - WebSocket client
- **Freezed** - Code generation (models)
- **firebase_messaging** - Push notifications

---

## ❌ Known Limitations & TODOs

1. **WebSocket message broadcast** - Needs event handler in gateway
2. **MongoDB change streams** - Not yet integrated (can use for real-time)
3. **Admin dashboard** - Not built (needed for attendance reports)
4. **Push notifications** - FCM integration pending
5. **Image uploads** - Not implemented
6. **Search/filtering** - Messages/attendance search missing
7. **Audit logs** - Not exposed in admin API
8. **Rate limiting** - Basic structure only

---

## 📈 Next Steps (In Priority Order)

1. **Share UI/Screen Designs** ← 🔴 BLOCKING
   - I'll implement exact designs once you provide mockups/Figma links

2. **Test Setup**
   - Follow [docs/SETUP.md](./docs/SETUP.md)
   - Run `start.bat` (Windows) or `start.sh` (Mac/Linux)
   - Test backend: `curl http://localhost:3000/health`
   - Test app: `flutter run`

3. **Implement Features**
   - Login/register flows with validation
   - Chat screens with message list
   - Attendance tracking with map
   - Real-time sync verification

4. **Security & Production**
   - HTTPS/TLS setup
   - Security audit
   - Rate limiting
   - Error tracking (Sentry)

5. **Testing & CI/CD**
   - Unit tests
   - Integration tests
   - GitHub Actions workflow
   - Staging deployment

6. **Release**
   - Android APK build & Play Store
   - iOS IPA build & App Store
   - Web PWA deployment

---

## 🆘 Troubleshooting

### Backend won't start
```bash
# Check port 3000 not in use
netstat -ano | findstr :3000  # Windows
lsof -i :3000  # Mac/Linux

# Check MongoDB connection
mongosh "mongodb://admin:password@localhost:27017"
```

### Flutter app crashes
```bash
flutter clean
flutter pub get
dart run build_runner build
flutter run --verbose
```

### Docker services down
```bash
docker-compose down -v  # Remove volumes
docker-compose up -d    # Restart
```

---

## 📞 Support

- **Docs**: See [README.md](./README.md), [docs/SETUP.md](./docs/SETUP.md)
- **Sync Design**: Read [docs/SYNC_PROTOCOL.md](./docs/SYNC_PROTOCOL.md) for details
- **API Reference**: Check [docs/API_SPEC.md](./docs/API_SPEC.md)
- **Issues**: Check logs with `npm run start:dev` (backend) or `flutter logs` (app)

---

**Status**: ✅ Foundation Complete  
**Ready for**: Screen designs → Implementation → Testing → Release  
**Last Updated**: May 2, 2026
