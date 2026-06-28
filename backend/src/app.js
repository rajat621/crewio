import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import companyRoutes from './routes/company.routes.js';
import employeeRoutes from './routes/employee.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import invoiceRoutes from './routes/invoice.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import aiRoutes from './routes/ai.routes.js';
import templateProfileRoutes from './routes/templateProfile.routes.js';
import mobileRoutes from './routes/mobile.routes.js';
<<<<<<< HEAD
import ownerRoutes from './routes/owner.routes.js';
import salarySlipRoutes from './routes/salarySlip.routes.js';
import expenseRoutes from './routes/expense.routes.js';
import filesRoutes from './routes/files.routes.js';
import chatRoutes from './routes/chat.routes.js';
import notificationRoutes from './routes/notification.routes.js';
=======
import { env } from './config/env.js';
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
import errorHandler from './middleware/error.middleware.js';

dotenv.config();

const app = express();

const localOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'https://crewio-rust.vercel.app',
];

const allowedOrigins = Array.from(new Set([
  env.FRONTEND_URL,
  ...localOrigins,
].filter(Boolean)));

// Connect to MongoDB
connectDB();

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Backend API',
    message: 'Construction Workforce Backend Running'
  });
});


// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend is running' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/files/upload', uploadRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/template-profiles', templateProfileRoutes);
app.use('/api/mobile', mobileRoutes);
<<<<<<< HEAD
app.use('/api/owner', ownerRoutes);
app.use('/api/salary-slips', salarySlipRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);
=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use(errorHandler);

export default app;
