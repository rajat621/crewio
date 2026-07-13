<<<<<<< HEAD
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
=======
# CrewControl - Employee & Attendance Management System

A comprehensive full-stack application for managing employees, attendance tracking, invoicing, and automated PDF data extraction using AI.

## 📁 Project Structure

```
crewcontrol/
├── backend/              # Node.js + Express REST API
├── crewcontrol-fron/     # React + Vite Frontend
├── ai-service/           # Python AI service for PDF extraction & invoice generation
└── docs/                 # Documentation
>>>>>>> a6de80c7abc716a6692e3f374decbbd723d1de6e
```

## 🚀 Quick Start

### Prerequisites
<<<<<<< HEAD
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
=======
- **Node.js** 16+ (for backend & frontend)
- **Python** 3.9+ (for AI service)
- **MongoDB Atlas** (free tier available)
- **Git**

### 1️⃣ Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env file with:
# MONGO_URI=your_mongodb_connection_string
# JWT_SECRET=your_jwt_secret_key
# GOOGLE_CLIENT_ID=your_google_client_id
# GOOGLE_CLIENT_SECRET=your_google_client_secret
# AI_SERVICE_URL=http://localhost:8001
# SMTP_USER=your_email@gmail.com
# SMTP_PASS=your_app_password

# Start development server (port 5000)
npm run dev

# OR start production server
npm start
```

### 2️⃣ Frontend Setup

```bash
cd crewcontrol-fron

# Install dependencies
npm install

# Create .env file with:
# VITE_API_URL=http://localhost:5000/api

# Start development server (port 5173)
npm run dev
```

### 3️⃣ AI Service Setup

```bash
cd ai-service

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file with:
# Required environment variables for PDF processing

# Start service (port 8001)
python main.py
```

### ⚡ Quick Start All Services

Run from project root:

**Windows:**
```bash
start-all.bat
```

**macOS/Linux:**
```bash
bash start-all.sh
```

## 📚 Features

### Backend API
- User authentication (Signup, Login, OTP verification)
- Employee management (CRUD operations)
- Company management
- Attendance tracking
- Invoice generation & management
- File uploads
- Dashboard analytics
- Role-based access control

### Frontend Application
- Modern React UI with Vite
- User dashboard
- Employee management interface
- Attendance tracking UI
- Invoice management
- File upload interface
- Responsive design

### AI Service
- PDF invoice extraction
- Timesheet data extraction
- Automated invoice generation
- Data validation & formatting

## 🔗 API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/verify-otp` - Verify OTP
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Companies
- `GET /api/companies/owner/me` - Get owner's company
- `PUT /api/companies/owner/me` - Update owner's company
- `POST /api/companies` - Create company
- `POST /api/companies/client` - Create client company
- `PUT /api/companies/:id` - Update company

### Employees
- `GET /api/employees` - List employees
- `POST /api/employees` - Create employee
- `PUT /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Delete employee

### Attendance
- `GET /api/attendance` - List attendance records
- `POST /api/attendance` - Record attendance

### Invoices
- `GET /api/invoices` - List invoices
- `POST /api/invoices` - Create invoice
- `GET /api/invoices/:id` - Get invoice details

### Uploads
- `POST /api/upload` - Upload file

### Dashboard
- `GET /api/dashboard` - Get dashboard statistics

## 📦 Environment Variables

Create `.env` files in each service directory:

### Backend (`backend/.env`)
```
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/crewcontrol
JWT_SECRET=your_secret_key_here
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
AI_SERVICE_URL=http://localhost:8001
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
PORT=5000
```

### Frontend (`crewcontrol-fron/.env`)
```
VITE_API_URL=http://localhost:5000/api
```

### AI Service (`ai-service/.env`)
```
# Add required configuration
```

## 🛠️ Development

### Backend Development
- Express.js for REST API
- MongoDB with Mongoose
- JWT for authentication
- Nodemailer for email notifications

### Frontend Development
- React 18+
- Vite for fast bundling
- Axios for API calls
- Modern CSS/Styling

### AI Service
- Python with FastAPI/Flask
- PDF processing libraries
- Data extraction and validation

## 📝 Database Models

- **User** - Application users
- **Company** - Company information
- **Employee** - Employee data
- **Attendance** - Attendance records
- **Invoice** - Invoice data
- **SalarySlip** - Salary slip information
- **File** - Uploaded file metadata
- **AuditLog** - System audit logs

## 🔐 Security

- JWT-based authentication
- Password hashing
- Environment variable protection
- Sensitive files excluded from git (.env, node_modules, etc.)
- CORS enabled for development

## 📖 Documentation

- [Quick Start Guide](./QUICK_START.md)
- [Setup Guide](./SETUP_GUIDE.md)
- [Backend README](./backend/README.md)
- [Frontend README](./crewcontrol-fron/README.md)
- [AI Service README](./ai-service/README.md)

## 🚀 Deployment

### Prerequisites for Deployment
- MongoDB Atlas or MongoDB server
- Node.js hosting (Heroku, AWS, etc.)
- Python hosting for AI service (AWS Lambda, Heroku, etc.)
- Frontend hosting (Vercel, Netlify, GitHub Pages, etc.)

### Production Build

**Backend:**
```bash
cd backend
npm install --production
npm start
```

**Frontend:**
```bash
cd crewcontrol-fron
npm install
npm run build
```

**AI Service:**
```bash
cd ai-service
pip install -r requirements.txt
python main.py
```

## 📄 License

This project is proprietary. All rights reserved.

## 👤 Author

- **Email**: rajatraj9470@gmail.com
- **GitHub**: [rajat621](https://github.com/rajat621)

## 📞 Support

For issues and questions, please open an issue on GitHub or contact the author.

---

**Last Updated**: May 2026
>>>>>>> a6de80c7abc716a6692e3f374decbbd723d1de6e
