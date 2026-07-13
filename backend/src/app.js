import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import { connectDB } from './config/db.js';
import { apiLimiter } from './middleware/rateLimiters.js';
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
import ownerRoutes from './routes/owner.routes.js';
import salarySlipRoutes from './routes/salarySlip.routes.js';
import expenseRoutes from './routes/expense.routes.js';
import filesRoutes from './routes/files.routes.js';
import chatRoutes from './routes/chat.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import errorHandler from './middleware/error.middleware.js';

dotenv.config();
const env = process.env;
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
  process.env.FRONTEND_URL,
  ...localOrigins,
].filter(Boolean)));

// Connect to MongoDB
connectDB();

// Security headers - CSP kept permissive for API-only responses (no HTML
// templates rendered here); adjust if this service ever serves web pages.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Trust the first proxy hop (Render/Vercel/etc.) so req.ip and rate limiting
// see the real client IP instead of the proxy's.
app.set('trust proxy', 1);

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

// Body parsing middleware - trimmed from 50mb to 2mb. Nothing in this API
// currently expects large JSON/urlencoded bodies (file uploads go through
// multer on /api/upload separately, outside this parser).
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));

// Strip any request keys that look like Mongo operators ($gt, $ne, etc.) or
// use dots to reach into nested paths - blocks NoSQL operator injection via
// body/query/params.
app.use(mongoSanitize());

// Blunt, general-purpose rate limiting on every route. Auth-specific routes
// layer a much stricter limiter on top (see auth.routes.js / mobile.routes.js).
app.use(apiLimiter);

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
app.use('/api/owner', ownerRoutes);
app.use('/api/salary-slips', salarySlipRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use(errorHandler);

export default app;


