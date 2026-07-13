import app from './app.js';
import dotenv from 'dotenv';
import { initSocket } from './services/socket.service.js';

dotenv.config();

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || process.env.BIND_HOST || '0.0.0.0';
const SERVER_TIMEOUT_MS = Number(process.env.SERVER_TIMEOUT_MS || process.env.BACKEND_TIMEOUT_MS || 300000);

const server = app.listen(PORT, HOST, () => {
  console.log(`Backend running on http://${HOST.includes('0.0.0.0') ? '0.0.0.0' : HOST}:${PORT}`);
});

// Attach Socket.IO to the same underlying HTTP server so dashboard/mobile
// real-time events share the port already open for the REST API - no
// second port or process needed.
try {
  initSocket(server);
  console.log('Socket.IO initialized for real-time dashboard/mobile events.');
} catch (err) {
  console.error('[fatal] Failed to initialize Socket.IO:', err.message);
}

// set Node http server timeout to align with env
try {
  server.timeout = SERVER_TIMEOUT_MS;
  console.log(`Backend server.timeout set to ${SERVER_TIMEOUT_MS} ms`);
} catch (err) {
  console.warn('Failed to set server.timeout:', err && err.message);
}

// --- Process-level safety nets ----------------------------------------------
// Without these, one unhandled error anywhere in the app (a missed .catch on
// a promise, for example) silently kills the entire process with no log, or
// leaves it in an undefined state. Log loudly and shut down cleanly instead.
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[fatal] Uncaught exception:', error);
  // Give in-flight responses a moment to finish, then exit so a process
  // manager (PM2/systemd/Render) can restart us into a known-good state.
  server.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 5000).unref();
});

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
