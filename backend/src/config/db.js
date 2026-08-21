import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { obsLog } from '../middleware/requestContext.middleware.js';
import { installQueryProfiler } from '../middleware/queryProfiler.js';

dotenv.config();

installQueryProfiler();

const MONGODB_URI = process.env.MONGODB_URI;

// Every operational value below is env-overridable with a production-safe
// default, so tuning any of them is a config change (Railway env var), not
// a code change + redeploy. Validated at startup - a malformed value (e.g.
// a typo'd non-numeric override) fails fast with a clear error instead of
// silently becoming NaN and reaching the Mongo driver.
const parsePositiveInt = (envVar, fallback) => {
  const raw = process.env[envVar];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${envVar}="${raw}" - must be a positive number`);
  }
  return value;
};

const resolveMongoTuningConfig = () => {
  const config = {
    // NOTE: these are starting defaults, not measured numbers - confirm
    // maxPoolSize against your actual Atlas tier's connection limit,
    // keeping in mind both this process and the worker process
    // (extraction.worker.js) each open their own pool against the same
    // cluster.
    maxPoolSize: parsePositiveInt('MONGO_MAX_POOL_SIZE', 50),
    minPoolSize: parsePositiveInt('MONGO_MIN_POOL_SIZE', 5),
    serverSelectionTimeoutMS: parsePositiveInt('MONGO_SERVER_SELECTION_TIMEOUT_MS', 10000),
    socketTimeoutMS: parsePositiveInt('MONGO_SOCKET_TIMEOUT_MS', 45000),
    connectTimeoutMS: parsePositiveInt('MONGO_CONNECT_TIMEOUT_MS', 10000),
    maxIdleTimeMS: parsePositiveInt('MONGO_MAX_IDLE_TIME_MS', 30000),
    waitQueueTimeoutMS: parsePositiveInt('MONGO_WAIT_QUEUE_TIMEOUT_MS', 10000),
  };

  if (config.minPoolSize > config.maxPoolSize) {
    throw new Error(
      `Invalid Mongo pool config: MONGO_MIN_POOL_SIZE (${config.minPoolSize}) must not exceed MONGO_MAX_POOL_SIZE (${config.maxPoolSize})`
    );
  }

  return config;
};

// Connection-state visibility: previously nothing logged a dropped or
// recovered connection at all, so a real outage surfaced only as
// confusing downstream errors in whichever controller happened to be
// querying at the time. Registered once, outside connectDB(), so it
// covers reconnects too (not just the initial connect).
mongoose.connection.on('error', (err) => {
  obsLog('mongo_connection_error', { message: err.message });
});
mongoose.connection.on('disconnected', () => {
  obsLog('mongo_connection_disconnected', {});
});
mongoose.connection.on('reconnected', () => {
  obsLog('mongo_connection_reconnected', {});
});

export const connectDB = async () => {
  try {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in .env file');
    }

    const tuning = resolveMongoTuningConfig();
    // Effective config only - MONGODB_URI itself is never logged since it
    // carries credentials.
    obsLog('mongo_connection_config', tuning);

    await mongoose.connect(MONGODB_URI, {
      ...tuning,
      retryWrites: true,
      retryReads: true,
    });

    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

export default mongoose;


