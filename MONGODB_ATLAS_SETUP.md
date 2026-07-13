# MongoDB Atlas Connection Setup Guide

All necessary files have been created for your Flutter mobile app to connect to MongoDB Atlas via your NestJS backend. Here's what you need to do:

---

## 📋 Step 1: Set Up MongoDB Atlas

### 1.1 Create MongoDB Atlas Account
- Go to https://www.mongodb.com/cloud/atlas
- Sign up for a free account (Free tier includes 512 MB storage)
- Verify your email

### 1.2 Create a Cluster
- Click "Create" or "Build a Database"
- Choose **"Shared Clusters"** (free tier)
- Select your region (closest to your users)
- Click "Create Cluster"
- Wait 2-3 minutes for cluster creation

### 1.3 Add Database User
- In MongoDB Atlas, go to **Database Access** (left sidebar)
- Click **"Add New Database User"**
- Enter username (e.g., `crewio_user`)
- Generate or enter a secure password
- Click **"Add User"**
- **SAVE THIS USERNAME AND PASSWORD - YOU'LL NEED IT FOR THE CONNECTION STRING**

### 1.4 Allow Network Access
- Go to **Network Access** (left sidebar)
- Click **"Add IP Address"**
- Click **"Allow Access from Anywhere"** (for development; restrict in production)
- Click **"Confirm"**

### 1.5 Get Connection String
- Go to **Clusters** > Your cluster > **"Connect"**
- Select **"Connect your application"**
- Copy the connection string
- Format: `mongodb+srv://username:password@cluster-name.mongodb.net/database-name?retryWrites=true&w=majority`

---

## 📝 Step 2: Update Backend Configuration

### 2.1 Create `.env` file from template
In the `backend/` folder, create a `.env` file:

```bash
cd backend
cp .env.example .env
```

### 2.2 Edit `backend/.env`
Replace the `MONGODB_URI` with your MongoDB Atlas connection string:

**Before:**
```env
MONGODB_URI=mongodb://admin:password@localhost:27017/crewio?authSource=admin&replicaSet=rs0
```

**After:**
```env
MONGODB_URI=mongodb+srv://your_username:your_password@your-cluster.mongodb.net/crewio?retryWrites=true&w=majority
```

**Example:**
```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb+srv://crewio_user:MySecurePassword123@cluster0.abc123.mongodb.net/crewio?retryWrites=true&w=majority
JWT_SECRET=your-super-secret-key-minimum-32-characters-long-here
JWT_EXPIRATION=3600
WEBSOCKET_PORT=3000
CORS_ORIGIN=http://localhost:3000,http://localhost:8080
```

---

## 🚀 Step 3: Start the Backend

```bash
cd backend
npm install
npm run start:dev
```

You should see:
```
🚀 Server running on http://localhost:3000
```

### Test Backend Connection
```bash
curl http://localhost:3000/health
```

---

## 📱 Step 4: Setup Flutter Mobile App

### 4.1 Install Dependencies
```bash
cd aquas
flutter pub get
dart run build_runner build
```

### 4.2 Update Environment Configuration
The `.env.dev` file is already configured to connect to your local backend:

```env
API_BASE_URL=http://localhost:3000
ENVIRONMENT=development
```

For production, update `.env.prod`:
```env
API_BASE_URL=https://your-backend-domain.com
ENVIRONMENT=production
```

### 4.3 Run the App
```bash
# Android
flutter run -d android

# iOS
flutter run -d ios

# Web
flutter run -d web
```

---

## ✅ Step 5: Test the Login Flow

### 5.1 Create a Test User
First, register a new user via the app or use:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!",
    "name": "Test User",
    "phone": "+1234567890"
  }'
```

### 5.2 Test Login in App
1. Open the app
2. Go to Login page
3. Enter email: `test@example.com`
4. Enter password: `TestPassword123!`
5. Click "Log In"
6. If successful, you'll be redirected to the Permission page

---

## 🔧 Files Created/Updated

### New Files Created:
- ✅ `lib/core/network/api_client.dart` - HTTP client with Dio
- ✅ `lib/core/services/token_service.dart` - Secure token storage
- ✅ `lib/core/services/auth_service.dart` - Authentication logic
- ✅ `lib/core/services/data_service.dart` - Data fetching service
- ✅ `lib/data/models/user_model.dart` - User data model (Freezed)
- ✅ `lib/data/models/auth_response_model.dart` - Auth response model
- ✅ `lib/presentation/providers/auth_provider.dart` - Riverpod state management
- ✅ `.env.dev` - Development environment variables
- ✅ `.env.prod` - Production environment variables

### Updated Files:
- ✅ `pubspec.yaml` - Added dependencies (Dio, Riverpod, etc.)
- ✅ `lib/main.dart` - Integrated service locator & Riverpod
- ✅ `lib/service_locator.dart` - Full dependency injection setup
- ✅ `lib/presentation/pages/auth/login_page.dart` - Integrated with auth provider
- ✅ `backend/.env.example` - Updated with MongoDB Atlas info

---

## 🌐 Architecture Overview

```
┌─────────────────────────────┐
│  Flutter Mobile App         │
│  (Login Page)              │
│  ├─ UI Layer               │
│  ├─ Riverpod (State Mgmt)  │
│  └─ Auth Provider          │
└──────────┬──────────────────┘
           │ (Dio HTTP)
           │
┌──────────▼──────────────────┐
│  NestJS Backend API         │
│  (Port 3000)               │
│  ├─ Auth Module            │
│  ├─ Users Module           │
│  ├─ Attendance Module      │
│  └─ Sync Module            │
└──────────┬──────────────────┘
           │ (Mongoose)
           │
┌──────────▼──────────────────┐
│  MongoDB Atlas Cloud        │
│  (mongodb+srv://)           │
└─────────────────────────────┘
```

---

## 🔑 Key Features Implemented

### Authentication Flow:
1. ✅ User enters email & password on Login page
2. ✅ App sends credentials to `/api/auth/login`
3. ✅ Backend validates against MongoDB & returns JWT
4. ✅ App stores JWT securely in `flutter_secure_storage`
5. ✅ JWT is auto-attached to all future API requests
6. ✅ On 401 error, tokens are cleared & user is redirected to login

### Data Fetching:
1. ✅ `DataService` has methods to fetch:
   - Current user profile (`GET /api/users/me`)
   - User by ID (`GET /api/users/:id`)
   - All users (`GET /api/users`)
   - Attendance records (`GET /api/attendance`)
   - Check-in/Check-out (`POST /api/attendance/check-in|check-out`)

### State Management:
- ✅ Riverpod for reactive state management
- ✅ Auth state includes: `isLoading`, `user`, `error`, `isAuthenticated`
- ✅ Real-time UI updates when state changes

### Secure Storage:
- ✅ JWT tokens stored in `flutter_secure_storage` (encrypted)
- ✅ Platform-specific security:
  - iOS: Keychain
  - Android: Keystore
  - Windows: Data Protection API

---

## ⚠️ Common Issues & Fixes

### Issue: "Connection refused"
**Cause:** Backend not running or wrong API URL
**Fix:**
```bash
cd backend
npm run start:dev
# Check that it shows "Server running on http://localhost:3000"
```

### Issue: "Invalid credentials"
**Cause:** Wrong email/password or user doesn't exist
**Fix:**
1. Create a new test user first
2. Verify credentials are correct
3. Check MongoDB has user records

### Issue: "Could not build the library"
**Cause:** Freezed models not generated
**Fix:**
```bash
cd aquas
flutter clean
dart run build_runner build
flutter pub get
```

### Issue: "Certificate verification failed"
**Cause:** SSL/TLS issue with MongoDB Atlas
**Fix:**
- Ensure MongoDB Atlas connection string includes `?retryWrites=true&w=majority`
- Try using IP whitelist instead of "Allow from Anywhere" temporarily

---

## 📚 API Endpoints Reference

### Authentication
```
POST /api/auth/login
POST /api/auth/register
POST /api/auth/refresh
POST /api/auth/logout
```

### Users
```
GET /api/users/me
GET /api/users/:id
GET /api/users
```

### Attendance
```
POST /api/attendance/check-in
POST /api/attendance/check-out
GET /api/attendance
```

### Messages
```
POST /api/messages/conversations
GET /api/messages/conversations
POST /api/messages/send
GET /api/messages/:conversationId
```

---

## 🎯 Next Steps

1. **Set up MongoDB Atlas** (5 minutes)
2. **Get connection string** and update `.env`
3. **Start backend** server
4. **Run Flutter app**
5. **Test login flow**
6. **Implement remaining screens** (Home, Attendance, Chat, etc.)

---

## 💡 Tips

- **Development:** Use localhost for backend (already configured in `.env.dev`)
- **Production:** Update `API_BASE_URL` in `.env.prod` before building
- **Security:** Never commit `.env` files to Git (add to `.gitignore`)
- **Debugging:** Enable LogInterceptor in ApiClient by setting `kDebugMode = true`

---

## ❓ Need Help?

Check these files for reference implementation:
- [API Specification](../docs/API_SPEC.md)
- [Backend Architecture](../aquas/docs/ARCHITECTURE.md)
- [Sync Protocol](../docs/SYNC_PROTOCOL.md)

