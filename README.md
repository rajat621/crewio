# CrewControl - Employee & Attendance Management System

A comprehensive full-stack application for managing employees, attendance tracking, invoicing, and automated PDF data extraction using AI.

## 📁 Project Structure

```
crewcontrol/
├── backend/              # Node.js + Express REST API
├── crewcontrol-fron/     # React + Vite Frontend
├── ai-service/           # Python AI service for PDF extraction & invoice generation
└── docs/                 # Documentation
```

## 🚀 Quick Start

### Prerequisites
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
