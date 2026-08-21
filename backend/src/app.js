// import express from 'express';
// import cors from 'cors';
// import dotenv from 'dotenv';
// import helmet from 'helmet';
// import mongoSanitize from 'express-mongo-sanitize';
// import { connectDB } from './config/db.js';
// import { apiLimiter } from './middleware/rateLimiters.js';
// import authRoutes from './routes/auth.routes.js';
// import companyRoutes from './routes/company.routes.js';
// import employeeRoutes from './routes/employee.routes.js';
// import attendanceRoutes from './routes/attendance.routes.js';
// import invoiceRoutes from './routes/invoice.routes.js';
// import invoiceDraftRoutes from './routes/invoiceDraft.routes.js';
// import uploadRoutes from './routes/upload.routes.js';
// import dashboardRoutes from './routes/dashboard.routes.js';
// import aiRoutes from './routes/ai.routes.js';
// import templateProfileRoutes from './routes/templateProfile.routes.js';
// import mobileRoutes from './routes/mobile.routes.js';
// import ownerRoutes from './routes/owner.routes.js';
// import salarySlipRoutes from './routes/salarySlip.routes.js';
// import expenseRoutes from './routes/expense.routes.js';
// import filesRoutes from './routes/files.routes.js';
// import chatRoutes from './routes/chat.routes.js';
// import notificationRoutes from './routes/notification.routes.js';
// import subscriptionRoutes from './routes/subscription.routes.js';
// import legalRoutes from './routes/legal.routes.js';
// import { handleWebhook } from './controllers/subscription.controller.js';
// import errorHandler from './middleware/error.middleware.js';
// dotenv.config();
// const env = process.env;
// const app = express();

// const localOrigins = [
//   'http://localhost:5173',
//   'http://localhost:5174',
//   'http://localhost:5175',
//   'http://127.0.0.1:5173',
//   'http://127.0.0.1:5174',
//   'http://127.0.0.1:5175',
//   'https://crewio-rust.vercel.app',
//   'https://app.crewio.ae'
// ];

// const allowedOrigins = Array.from(new Set([
//   process.env.FRONTEND_URL,
//   ...localOrigins,
// ].filter(Boolean)));

// // Connect to MongoDB
// connectDB();

// // Security headers - CSP kept permissive for API-only responses (no HTML
// // templates rendered here); adjust if this service ever serves web pages.
// app.use(
//   helmet({
//     contentSecurityPolicy: {
//       directives: {
//         defaultSrc: ["'none'"],
//         frameAncestors: ["'none'"],
//       },
//     },
//     crossOriginResourcePolicy: { policy: 'cross-origin' },
//   })
// );

// // Trust the first proxy hop (Render/Vercel/etc.) so req.ip and rate limiting
// // see the real client IP instead of the proxy's.
// app.set('trust proxy', 1);

// // CORS configuration
// app.use(cors({
//   origin: (origin, callback) => {
//     if (!origin || allowedOrigins.includes(origin)) {
//       callback(null, true);
//     } else {
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true,
// }));

// // Stripe webhook needs the raw request body for signature verification, so
// // it must be registered BEFORE express.json() runs (otherwise the body would
// // already be parsed/consumed as JSON and signature verification would fail).
// app.post('/api/subscription/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// // Body parsing middleware - trimmed from 50mb to 2mb. Nothing in this API
// // currently expects large JSON/urlencoded bodies (file uploads go through
// // multer on /api/upload separately, outside this parser).
// // app.use(express.json({ limit: '2mb' }));
// // app.use(express.urlencoded({ limit: '2mb', extended: true }));
// // Body parsing middleware
// app.use(express.json({
//     limit: '80mb'
// }));

// app.use(express.urlencoded({
//     limit: '80mb',
//     extended: true
// }));
// // Strip any request keys that look like Mongo operators ($gt, $ne, etc.) or
// // use dots to reach into nested paths - blocks NoSQL operator injection via
// // body/query/params.
// app.use(mongoSanitize());

// // Blunt, general-purpose rate limiting on every route. Auth-specific routes
// // layer a much stricter limiter on top (see auth.routes.js / mobile.routes.js).
// app.use(apiLimiter);

// app.get('/', (req, res) => {
//   res.json({
//     status: 'OK',
//     service: 'Backend API',
//     message: 'Construction Workforce Backend Running'
//   });
// });


// // Health check
// app.get('/health', (req, res) => {
//   res.json({ status: 'OK', message: 'Backend is running' });
// });

// // API Routes
// app.use('/api/auth', authRoutes);
// app.use('/api/companies', companyRoutes);
// app.use('/api/employees', employeeRoutes);
// app.use('/api/attendance', attendanceRoutes);
// // app.use('/api/invoices', invoiceRoutes);
// app.use('/api/invoices/drafts', invoiceDraftRoutes);
// app.use('/api/invoices', invoiceRoutes);


// app.use('/api/upload', uploadRoutes);
// app.use('/api/files/upload', uploadRoutes);
// app.use('/api/dashboard', dashboardRoutes);
// app.use('/api/ai', aiRoutes);
// app.use('/api/template-profiles', templateProfileRoutes);
// app.use('/api/mobile', mobileRoutes);
// app.use('/api/owner', ownerRoutes);
// app.use('/api/salary-slips', salarySlipRoutes);
// app.use('/api/expenses', expenseRoutes);
// app.use('/api/files', filesRoutes);
// app.use('/api/chat', chatRoutes);
// app.use('/api/notifications', notificationRoutes);
// app.use('/api/subscription', subscriptionRoutes);
// app.use('/api/legal', legalRoutes);

// // 404 handler
// app.use((req, res) => {
//   res.status(404).json({ message: 'Route not found' });
// });

// // Error handler
// app.use(errorHandler);

// export default app;

import express from 'express';
import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import { connectDB } from './config/db.js';
import { apiLimiter } from './middleware/rateLimiters.js';
import { attachRequestContext, logRequests } from './middleware/requestContext.middleware.js';
import { getMongoStatus, getRedisStatus, getQueueStatus, getAiServiceStatus, getSystemInfo } from './utils/healthCheck.js';
import { getMetricsSnapshot } from './utils/metrics.js';
import { runtimeConfig } from './config/env.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import authRoutes from './routes/auth.routes.js';
import companyRoutes from './routes/company.routes.js';
import employeeRoutes from './routes/employee.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import invoiceRoutes from './routes/invoice.routes.js';
import invoiceDraftRoutes from './routes/invoiceDraft.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import aiRoutes from './routes/ai.routes.js';
import templateProfileRoutes from './routes/templateProfile.routes.js';
import mobileRoutes from './routes/mobile.routes.js';
import ownerRoutes from './routes/owner.routes.js';
import salarySlipRoutes from './routes/salarySlip.routes.js';
import expenseRoutes from './routes/expense.routes.js';
import companyExpenseRoutes from './routes/companyExpense.routes.js';
import filesRoutes from './routes/files.routes.js';
import chatRoutes from './routes/chat.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import legalRoutes from './routes/legal.routes.js';
import { handleWebhook } from './controllers/subscription.controller.js';
import errorHandler from './middleware/error.middleware.js';

dotenv.config();
const env = process.env;
const app = express();

const appVersion = (() => {
  try {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
})();

import { getAllowedOrigins, isAllowedOrigin } from './config/corsOrigins.js';

connectDB();

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

// Default filter (via the `compressible` library) already skips
// already-compressed/binary content types - notably application/pdf,
// which invoice/salary-slip/invoiceDraft controllers serve - so no
// wasted CPU re-compressing PDF output. No custom filter needed.
app.use(compression());

app.set('trust proxy', 1);

const allowedOrigins = getAllowedOrigins();

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin, allowedOrigins)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(attachRequestContext);
app.use(logRequests);

app.post('/api/subscription/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// Sized against the application's own validated ceiling for the largest
// legitimate JSON-body payload: base64 company branding assets
// (logo/invoiceTemplate/signature/stamp), capped at 10MB raw by
// validateAssetField() in company.controller.js. Base64 adds ~33%
// overhead (10MB -> ~13.3MB encoded), so 15mb leaves real headroom for
// that plus the surrounding JSON envelope. Actual file uploads
// (/api/upload) go through multer's separate multipart parser with its
// own independent 10MB limit (routes/upload.routes.js) and never reach
// this parser at all; AI extraction endpoints work with stored file
// references (pdfPath), not embedded file bytes.
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));
app.use(mongoSanitize());
app.use(apiLimiter);

app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Backend API',
    message: 'Construction Workforce Backend Running'
  });
});

app.get('/health', async (req, res) => {
  const startedAt = process.hrtime.bigint();

  // Basic shape is always cheap and always present - matches what the
  // previous static response promised (status + a message), so nothing
  // that only checked those two fields breaks.
  const basic = { status: 'OK', message: 'Backend is running', app: 'crew-control-backend', version: appVersion, environment: process.env.NODE_ENV || 'development', timestamp: new Date().toISOString() };

  if (!runtimeConfig.featureFlags.enableHealthDetails) {
    return res.json(basic);
  }

  // Each of these is either a synchronous property read (Mongo) or a
  // short-timeout local call (Redis ping, queue depth) - no unbounded
  // external network calls, per the "must stay lightweight" requirement.
  const [mongo, redis, queue] = await Promise.all([
    Promise.resolve(getMongoStatus()),
    getRedisStatus(),
    getQueueStatus(),
  ]);

  res.json({
    ...basic,
    ...getSystemInfo(),
    mongo,
    redis,
    queue,
    aiService: getAiServiceStatus(),
    metrics: getMetricsSnapshot(),
    responseTimeMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6),
  });
});

// Readiness (distinct from liveness /health above): answers "can this
// instance actually serve traffic right now," for load-balancer/orchestrator
// health-check-gated routing. Mongo must be connected; Redis must be ready
// only if it's actually enabled (DISABLE_REDIS=true is a valid, deliberate
// configuration, not a failure).
app.get('/ready', async (req, res) => {
  const mongo = getMongoStatus();
  const redis = await getRedisStatus();

  const mongoReady = mongo.status === 'connected';
  const redisReady = redis.status === 'ready' || redis.status === 'disabled';
  const ready = mongoReady && redisReady;

  res.status(ready ? 200 : 503).json({
    status: ready ? 'READY' : 'NOT_READY',
    mongo: mongo.status,
    redis: redis.status,
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
// Must be registered BEFORE '/api/invoices' — invoice.routes.js has a
// GET '/:id' that treats "drafts" as a Mongo _id if this loses the race,
// producing a 500 (CastError), not a 404. Order is load-bearing here.
app.use('/api/invoices/drafts', invoiceDraftRoutes);
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
app.use('/api/company-expenses', companyExpenseRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/legal', legalRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use(errorHandler);

export default app;