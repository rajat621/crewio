import dotenv from 'dotenv';

dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET || 'your_secret_key',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:5000',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || '',
  
  // FRONTEND_URL: process.env.FRONTEND_URL || 'https://crewio-rust.vercel.app',
  // VITE_API_URL: process.env.VITE_API_URL || 'https://crewio.onrender.com/api',
  // AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'https://crewio-ai-services.onrender.com',
  // AI_SERVICE_TIMEOUT_MS: process.env.AI_SERVICE_TIMEOUT_MS || 45000,
};

export default env;
