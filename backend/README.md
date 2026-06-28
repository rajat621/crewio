# Backend - Crew Control

## Setup Instructions

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   - Copy `.env.example` to `.env`
   - Update MongoDB connection string
   - Add SMTP credentials for email notifications

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Start production server:**
   ```bash
   npm start
   ```

## API Endpoints

### Authentication
- POST `/api/auth/signup` - Register new user
- POST `/api/auth/verify-otp` - Verify OTP
- POST `/api/auth/login` - Login user

### Companies
- GET `/api/companies/owner/me` - Get owner's company
- PUT `/api/companies/owner/me` - Update owner's company
- POST `/api/companies` - Create company
- POST `/api/companies/client` - Create client company
- PUT `/api/companies/:id` - Update company

### Other Routes
- GET `/api/employees` - List employees
- POST `/api/employees` - Create employee
- GET `/api/attendance` - List attendance
- POST `/api/attendance` - Record attendance
- GET `/api/invoices` - List invoices
- POST `/api/invoices` - Create invoice
- POST `/api/upload` - Upload file
- GET `/api/dashboard` - Dashboard stats

## Database Models

- User
- Company
- Employee
- Attendance
- Invoice
- SalarySlip
- AuditLog

## Features

- User authentication with OTP verification
- Company profile management
- Employee management
- Attendance tracking
- Invoice generation
- File uploads
- Dashboard analytics
