# Crew Control - Project Setup & Run Guide

## ✅ Project Structure Complete

All missing files have been created:

```
d:\Crew_control\
├── backend/                          ← NEWLY CREATED
│   ├── src/
│   │   ├── app.js                   ✓ Express app setup
│   │   ├── server.js                ✓ Server entry point
│   │   ├── config/
│   │   │   ├── db.js                ✓ MongoDB connection
│   │   │   └── env.js               ✓ Environment config
│   │   ├── controllers/              ✓ Route handlers
│   │   │   ├── auth.controller.js
│   │   │   ├── company.controller.js
│   │   │   ├── employee.controller.js
│   │   │   ├── attendance.controller.js
│   │   │   ├── invoice.controller.js
│   │   │   ├── upload.controller.js
│   │   │   └── dashboard.controller.js
│   │   ├── middleware/               ✓ Middleware
│   │   │   ├── auth.middleware.js
│   │   │   └── error.middleware.js
│   │   ├── models/                   ✓ Mongoose schemas
│   │   │   ├── User.js
│   │   │   ├── Company.js
│   │   │   ├── Employee.js
│   │   │   ├── Attendance.js
│   │   │   ├── Invoice.js
│   │   │   ├── SalarySlip.js
│   │   │   ├── File.js
│   │   │   ├── AuditLog.js
│   │   │   ├── InvoiceCounter.js
│   │   │   └── index.js
│   │   ├── routes/                   ✓ API routes
│   │   │   ├── auth.routes.js
│   │   │   ├── company.routes.js
│   │   │   ├── employee.routes.js
│   │   │   ├── attendance.routes.js
│   │   │   ├── invoice.routes.js
│   │   │   ├── upload.routes.js
│   │   │   └── dashboard.routes.js
│   │   ├── services/                 ✓ Business logic
│   │   ├── utils/                    ✓ Utilities
│   │   └── storage/                  ✓ File storage
│   ├── package.json                  ✓ Dependencies
│   ├── .env                          ✓ Configuration
│   ├── .env.example                  ✓ Reference
│   ├── .gitignore                    ✓ Git ignore
│   └── README.md                     ✓ Documentation
│
├── crewcontrol-fron/                 ✓ Frontend (Already exists)
│   ├── .env                          ✓ Created
│   ├── .env.local                    ✓ Created
│   └── src/
│       ├── pages/
│       │   ├── CompanyProfile.jsx    ✓ Working
│       │   └── ComprehensiveOnboarding.jsx ✓ Working
│       ├── api/
│       │   └── companies.js          ✓ API client
│       └── ...
│
└── ai-service/                       ✓ AI service (Exists)
```

## 🚀 Quick Start

### 1. Backend Setup

```bash
# Navigate to backend
cd d:\Crew_control\backend

# Install dependencies (already done)
npm install

# Configure MongoDB
# Edit .env and add your MongoDB URI:
# MONGODB_URI=mongodb+srv://username:password@your-cluster.mongodb.net/crew_control

# Start backend server
npm start
# Server runs on http://localhost:5000
```

### 2. Frontend Setup

```bash
# Navigate to frontend
cd d:\Crew_control\crewcontrol-fron

# Install dependencies (already done)
npm install

# Start development server
npm run dev
# Server runs on http://localhost:5173
```

### 3. Access the Application

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:5000/api
- **Health Check:** http://localhost:5000/health

## ⚙️ Environment Configuration

### Backend (.env)

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/crew_control
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRE=7d

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM_EMAIL=noreply@crewcontrol.com
SMTP_FROM_NAME=CrewControl

FRONTEND_URL=http://localhost:5173
VITE_API_URL=http://localhost:5000/api
```

### Frontend (.env)

```env
VITE_API_URL=http://localhost:5000/api
```

## 📋 Next Steps

1. **Setup MongoDB Atlas:**
   - Create account at https://www.mongodb.com/cloud/atlas
   - Create a cluster
   - Get connection string
   - Update `MONGODB_URI` in backend/.env

2. **Setup Email (SMTP):**
   - Use Gmail, SendGrid, or any SMTP service
   - Update SMTP credentials in backend/.env
   - Required for OTP emails

3. **Start Development:**
   - Terminal 1: `cd backend && npm start`
   - Terminal 2: `cd crewcontrol-fron && npm run dev`
   - Open http://localhost:5173 in browser

## 🔍 API Endpoints Available

### Authentication
- `POST /api/auth/signup` - Register user
- `POST /api/auth/verify-otp` - Verify email with OTP
- `POST /api/auth/login` - Login user

### Companies (Protected Routes)
- `GET /api/companies/owner/me` - Get owner's company
- `PUT /api/companies/owner/me` - Update owner's company (with stamp, signature, template)
- `POST /api/companies` - Create company
- `PUT /api/companies/:id` - Update company

### Other Endpoints
- `GET /api/employees` - List employees
- `POST /api/employees` - Create employee
- `GET /api/attendance` - List attendance
- `POST /api/attendance` - Record attendance
- `GET /api/invoices` - List invoices
- `POST /api/invoices` - Create invoice
- `POST /api/upload` - Upload file
- `GET /api/dashboard` - Dashboard stats

## 🐛 Troubleshooting

### Backend won't start
- Ensure Node.js is installed: `node --version`
- Check MongoDB connection string in .env
- Verify port 5000 is not in use

### Frontend won't start
- Run `npm install` in crewcontrol-fron folder
- Clear node_modules and reinstall if needed
- Check that port 5173 is available

### CORS Errors
- Backend already configured to accept localhost:5173-5175
- Ensure VITE_API_URL points to correct backend

### MongoDB Connection Fails
- Verify MongoDB URI format
- Check IP whitelist in Atlas (add 0.0.0.0/0 for development)
- Ensure internet connectivity

### OTP Email Not Sending
- Verify SMTP credentials are correct
- For Gmail, use App Password (not regular password)
- Check firewall/network settings allow SMTP

## 📁 File Storage

- Invoice uploads: `backend/src/storage/invoices/uploads/`
- Generated PDFs: `backend/src/storage/invoices/generated/`
- General uploads: `backend/src/storage/uploads/`

## 🔐 Security Notes

- Change JWT_SECRET in production
- Use environment-specific .env files
- Never commit .env file to git
- Use strong database passwords
- Enable MongoDB encryption in production

## ✨ Features Implemented

✅ User authentication with OTP verification
✅ Company profile management
✅ Stamp/Signature/Template uploads (as data URLs)
✅ Employee management
✅ Attendance tracking
✅ Invoice generation
✅ Dashboard analytics
✅ File upload handling
✅ CORS configuration for development
✅ Error handling middleware
✅ JWT authentication

---

**All missing files have been created and dependencies are installed!**
Ready to develop. 🚀
