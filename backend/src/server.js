import app from './app.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 5000;
const SERVER_TIMEOUT_MS = Number(process.env.SERVER_TIMEOUT_MS || process.env.BACKEND_TIMEOUT_MS || 300000);

const server = app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

// set Node http server timeout to align with env
try {
  server.timeout = SERVER_TIMEOUT_MS;
  console.log(`Backend server.timeout set to ${SERVER_TIMEOUT_MS} ms`);
} catch (err) {
  console.warn('Failed to set server.timeout:', err && err.message);
}
