# CrewIO - Production-Ready Mobile App

A complete Flutter + NestJS stack with offline-first sync, real-time chat, and attendance tracking.

## 📚 Project Structure

```
Crewio/
├── backend/                # NestJS backend
│   ├── src/
│   │   ├── auth/          # Authentication (JWT, login, register)
│   │   ├── users/         # User management
│   │   ├── messages/      # Chat & conversations
│   │   ├── attendance/    # Check-in/out tracking
│   │   ├── sync/          # Custom sync protocol
│   │   └── websockets/    # Real-time events
│   ├── package.json
│   └── tsconfig.json
│
├── mobile-app/             # Flutter app
│   ├── lib/
│   │   ├── src/
│   │   │   ├── models/     # Data models (Freezed)
│   │   │   ├── services/   # API, DB, Sync services
│   │   │   ├── features/   # UI screens (auth, home, chat, attendance)
│   │   │   └── config/     # Theme, constants
│   │   └── main.dart
│   └── pubspec.yaml
│
├── infra/                  # DevOps & deployment
│   ├── docker-compose.yml  # Local dev environment
│   ├── .env                # Environment variables
│   └── nginx.conf          # Reverse proxy (production)
│
└── docs/
    ├── API_SPEC.md         # API documentation
    ├── SYNC_PROTOCOL.md    # Custom sync design
    └── SETUP.md            # Environment setup guide
```

## 🚀 Quick Start

### Prerequisites
- Flutter 3.0+
- Node.js 18+
- Docker & Docker Compose (optional but recommended)
- MongoDB Atlas or local MongoDB replica set

### Backend Setup (5 mins)

```bash
cd backend
npm install

# Set up environment
cp .env.example .env
# Edit .env with your MongoDB connection string

# Start development server
npm run start:dev
```

Server runs on `http://localhost:3000`

### Mobile App Setup (5 mins)

```bash
cd mobile-app

# Get dependencies
flutter pub get

# Generate code (Freezed, Isar)
dart run build_runner build

# Run on emulator/device
flutter run
```

### Full Stack with Docker (2 mins)

```bash
cd infra
docker-compose up

# MongoDB: localhost:27017 (admin/password)
# Backend: localhost:3000
# Redis: localhost:6379
```

---

## 🔄 Offline-First Custom Sync

### How it Works

1. **User goes offline** → App queues ops locally (Isar DB)
2. **User comes back online** → SyncService detects connectivity change
3. **Automatic sync** → Pending ops are batched & sent to server (30s intervals)
4. **Server reconciles** → Applies ops with idempotency (dedupe by `opId`)
5. **Changes pulled** → Client fetches server changes via polling/WebSocket

### Operation Types

- **Attendance**: `checkin`, `checkout` with location & device ID
- **Message**: Send, edit, delete with `opId` for idempotency
- **Profile**: Updates to user info with version-based conflict resolution

### Conflict Resolution

- **Attendance**: Last-write-wins per user+date using server timestamp
- **Messages**: Append-only; client `opId` prevents duplicates
- **Profile**: Version-based optimistic locking

---

## 💬 Real-Time Chat

### WebSocket Events (socket.io)

**Client → Server:**
- `message` → Send message (queued if offline)
- `presence` → typing | online | away
- `sync:pull` → Request changes since timestamp

**Server → Client:**
- `message:new` → New message from others
- `message:sent` → Confirmation of sent message (`opId` ack)
- `presence` → User online/typing/away status
- `user:online` / `user:offline` → Presence updates

### Message Schema

```json
{
  "opId": "uuid",
  "conversationId": "conv_id",
  "senderId": "user_id",
  "content": "Hello",
  "status": "sent|delivered|read",
  "createdAt": "2026-05-02T12:00:00Z"
}
```

---

## 📍 Attendance Tracking

### Features
- ✅ GPS-based check-in/out with location storage
- ✅ Works offline — ops queued locally
- ✅ One record per user per day (deduplicated)
- ✅ Reconciliation via server timestamp

### Endpoints

- `POST /api/attendance/check-in` → Record arrival
- `POST /api/attendance/check-out` → Record departure
- `GET /api/attendance/today` → Today's record
- `GET /api/attendance?from=&to=` → Date range query

---

## 🔐 Security

### Authentication
- JWT tokens (access + refresh)
- Stored securely in `flutter_secure_storage` (mobile) & httpOnly cookies (web)
- 1-hour expiration; refresh before use

### Best Practices
- ✅ Validate all inputs server-side
- ✅ Rate limiting on auth endpoints
- ✅ HTTPS/TLS in production
- ✅ MongoDB IP allowlisting
- ✅ API key rotation
- ✅ Audit logs for critical ops

---

## 📊 API Endpoints Summary

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/auth/register` | ❌ | Create account |
| POST | `/api/auth/login` | ❌ | Get JWT tokens |
| POST | `/api/auth/refresh` | ✅ | Refresh access token |
| GET | `/api/users/me` | ✅ | Get profile |
| POST | `/api/conversations` | ✅ | Create conversation |
| GET | `/api/conversations` | ✅ | List conversations |
| POST | `/api/conversations/:id/messages` | ✅ | Send message |
| GET | `/api/conversations/:id/messages` | ✅ | Get message history |
| POST | `/api/attendance/check-in` | ✅ | Mark arrival |
| POST | `/api/attendance/check-out` | ✅ | Mark departure |
| GET | `/api/attendance/today` | ✅ | Today's attendance |
| POST | `/api/sync/ops` | ✅ | Batch apply ops |
| GET | `/api/sync/changes` | ✅ | Pull server changes |

---

## 📱 Flutter Packages Used

| Package | Purpose |
|---------|---------|
| `riverpod` | State management |
| `isar` | Local embedded DB |
| `dio` | HTTP client |
| `socket_io_client` | Real-time WebSocket |
| `flutter_secure_storage` | Secure token storage |
| `connectivity_plus` | Network state |
| `workmanager` | Background tasks |
| `firebase_messaging` | Push notifications |
| `freezed` | Data class generation |

---

## 🏗️ Backend Tech Stack

| Tech | Purpose |
|------|---------|
| NestJS | API framework |
| TypeScript | Type safety |
| Mongoose | MongoDB ODM |
| socket.io | Real-time events |
| JWT | Authentication |
| bcryptjs | Password hashing |

---

## 🧪 Testing & Deployment

### Local Testing
```bash
# Backend
cd backend
npm run test

# Flutter
cd mobile-app
flutter test
```

### Docker Build & Push
```bash
docker build -f backend/Dockerfile.prod -t crewio-backend:latest .
docker tag crewio-backend:latest your-registry/crewio-backend:latest
docker push your-registry/crewio-backend:latest
```

### Release Builds
```bash
# Android APK
flutter build apk --release

# iOS IPA
flutter build ios --release

# Web (PWA)
flutter build web --web-renderer=html
```

---

## 📋 Checklist Before Production

- [ ] Update JWT_SECRET in .env
- [ ] Enable MongoDB IP allowlisting
- [ ] Set up CI/CD (GitHub Actions)
- [ ] Configure Sentry for error tracking
- [ ] Enable HTTPS/TLS
- [ ] Set up monitoring & alerting
- [ ] Test offline sync thoroughly
- [ ] Load test with fake data
- [ ] Security audit
- [ ] Update API documentation

---

## 🐛 Debugging

### Backend Logs
```bash
npm run start:dev  # Watch mode with hot reload
```

### Flutter Logs
```bash
flutter logs

# Debug specific device
flutter logs -d <device_id>
```

### MongoDB Queries
```bash
mongosh -u admin -p password
db.users.find()
db.operations.find({ status: "failed" })
```

---

## 📞 Support & Next Steps

1. **Setup environment** per SETUP.md
2. **Share UI/screen designs** — I'll implement them
3. **Test offline sync** thoroughly
4. **Configure push notifications** (FCM)
5. **Deploy to staging** before production

---

**Last updated:** May 2, 2026  
**Status:** ✅ Foundation complete | Awaiting screen designs
