# CrewControl - Quick Start & Deployment Guide

## 🚀 QUICK START (Local Development)

### Prerequisites
- Node.js 16+ installed
- MongoDB Atlas account (free tier OK)
- Git

---

### Step 1: Backend Setup

```bash
cd d:\Crew_control\backend

# Install dependencies (already done, but run if needed)
npm install

# Verify .env file exists with:
# - MONGO_URI (MongoDB Atlas connection string)
# - JWT_SECRET (any random string, suggest: openssl rand -hex 32)
# - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (from Google Cloud Console)
# - AI_SERVICE_URL=http://localhost:8001
# - SMTP credentials for Nodemailer

# Start server
npm start

# Expected output:
# ✓ MongoDB connected: cluster0.xxxxx.mongodb.net
# ✓ Backend running on port 5000
```

### Step 2: Frontend Setup

```bash
cd d:\Crew_control\crewcontrol-fron

# Install dependencies (already done, but run if needed)
npm install

# Start development server
npm run dev

# Expected output:
# ✓ Local: http://localhost:5173
# ✓ Port 5173 is ready
```

### Step 3: Test Auth Flow

1. Open browser to http://localhost:5173
2. Click "Sign Up"
3. Fill form (use test+timestamp@gmail.com)
4. Submit → check email for OTP
5. Enter OTP → redirects to Sign In
6. Sign In → redirects to /home dashboard

---

## 📋 API ENDPOINTS (Quick Reference)

### Authentication
```
POST   /api/auth/signup           - Create account
POST   /api/auth/verify-otp       - Verify email with OTP
POST   /api/auth/signin           - Login
POST   /api/auth/resend-otp       - Request new OTP
GET    /api/auth/me               - Get current user (protected)
```

### Employees (all require auth token)
```
GET    /api/employees             - List all employees
GET    /api/employees/:id         - Get single employee
POST   /api/employees             - Create employee
PUT    /api/employees/:id         - Update employee
DELETE /api/employees/:id         - Delete employee (soft)
POST   /api/employees/:id/assign  - Assign to company
```

### Attendance (all require auth token)
```
POST   /api/attendance            - Mark attendance
GET    /api/attendance            - Get records
PUT    /api/attendance/:id        - Update record
GET    /api/attendance/summary    - Daily stats
```

### Dashboard (require auth token)
```
GET    /api/dashboard/stats       - KPI data
```

---

## 🔑 Environment Configuration

### Backend (.env)

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGO_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/crewcontrol?retryWrites=true&w=majority

# Auth
JWT_SECRET=your_generated_secret_here
JWT_EXPIRES_IN=7d

# Google OAuth (get from Google Cloud Console)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# AI Service
AI_SERVICE_URL=http://localhost:8001
AI_SERVICE_KEY=your_internal_key

# Email (Nodemailer - example: Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM_EMAIL=noreply@crewcontrol.com

# Client
CLIENT_URL=http://localhost:5173
```

### Frontend (.env.local)

```env
VITE_API_URL=http://localhost:5000
```

---

## ✅ Testing Checklist

### 1. Auth Flow
- [ ] Signup creates user with isVerified=false
- [ ] OTP email sends within 10 seconds
- [ ] Wrong OTP shows error
- [ ] Correct OTP redirects to signin and marks user verified
- [ ] Signin with wrong password fails
- [ ] Signin with correct password returns JWT
- [ ] JWT stored in localStorage
- [ ] JWT expires after 7 days
- [ ] Resend OTP works and generates new code

### 2. Employee Management
- [ ] Create employee generates valid employeeId (AQWK2600001)
- [ ] Create employee generates random appPassword
- [ ] Employee IDs are unique (counter increments correctly)
- [ ] List employees filters by status/trade/company
- [ ] Update employee changes fields
- [ ] Soft delete sets status=inactive (not hard delete)
- [ ] Assign employee links to company

### 3. Attendance
- [ ] Mark single attendance works
- [ ] Bulk mark (array) works
- [ ] Get attendance filters by employee/company/date range
- [ ] Summary stats returns correct counts

### 4. Dashboard
- [ ] KPI stats loads without errors
- [ ] totalWorkers count = active + inactive + assigned employees
- [ ] presentToday = attendance records with present=true for today
- [ ] absentToday = attendance records with present=false for today

### 5. Protected Routes
- [ ] Accessing /home without auth redirects to /
- [ ] Accessing /employees without token redirects to /
- [ ] Token added to API requests automatically
- [ ] Invalid token triggers redirect to /

---

## 🐛 Troubleshooting

### Backend won't start
```
Error: MongoDB connection error
→ Check MONGO_URI in .env is correct
→ Verify MongoDB Atlas IP whitelist includes 0.0.0.0/0

Error: SMTP connection error
→ If using Gmail, use App Password (not regular password)
→ Enable Less Secure App Access if needed
```

### Frontend shows blank page
```
→ Check browser console for errors (F12)
→ Verify npm run dev succeeded
→ Clear cache and reload (Ctrl+Shift+Delete)

Error: Cannot find module '@/...'
→ Paths alias not working
→ Try deleting node_modules and running npm install again
```

### API calls failing
```
Error: 401 Unauthorized
→ Token missing or expired
→ Check localStorage for crewcontrol_token
→ Try signing in again

Error: 404 Not Found
→ Endpoint doesn't exist
→ Check API_URL in .env matches backend port (5000)
→ Verify backend is running
```

### OTP not sending
```
→ Check email credentials in .env
→ Check server logs for SMTP errors
→ For Gmail: use 16-character App Password, not regular password
→ Check email spam folder

→ If using different SMTP provider:
  • Gmail: smtp.gmail.com:587
  • Outlook: smtp-mail.outlook.com:587
  • SendGrid: smtp.sendgrid.net:587
```

---

## 📱 Mobile Testing

To test on mobile device:
```bash
# Find your computer's IP
ipconfig getifaddr en0  # macOS
hostname -I            # Linux

# Then access from phone:
http://YOUR_IP:5173
```

Note: Backend at 0.0.0.0:5000 will be accessible from phone automatically.

---

## 🔐 Security Notes

1. **Never commit .env to Git** - add to .gitignore
2. **JWT_SECRET should be strong** - use at least 32 random hex characters
3. **CORS is enabled** - restrict to frontend domain in production
4. **Passwords hashed with bcrypt** - salt rounds: 12
5. **OTP expires in 10 minutes** - change in auth.controller.js if needed
6. **All routes except /api/auth/* require token** - enforced by middleware

---

## 📦 Production Deployment

### Backend (Node.js, can use Heroku, Railway, Render, etc.)
```bash
# Set environment variables on platform
npm install
npm start
```

### Frontend (can use Vercel, Netlify, AWS S3+CloudFront, etc.)
```bash
npm run build
# Deploy dist/ folder
```

### Database
- Use MongoDB Atlas (free tier sufficient for small projects)
- Enable IP whitelist for production servers only
- Create backups regularly

### Email Service
- For production, use SendGrid/Mailgun instead of SMTP
- Update SMTP config in .env

---

## 💡 Tips & Best Practices

1. **localStorage persistence** - user data cached, auto-restored on refresh
2. **Design tokens** - keep all colors/spacing in src/theme/designSystem.js
3. **API errors** - all error responses follow format: `{ message: "error description" }`
4. **Loading states** - use CircularProgress for async operations
5. **Route protection** - always wrap new protected routes with `<ProtectedRoute>`

---

Generated for CrewControl Team | April 10, 2026
