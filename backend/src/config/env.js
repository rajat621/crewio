// import dotenv from 'dotenv';

// dotenv.config();

// const toBool = (value, fallback = false) => {
//   if (typeof value === 'boolean') return value;
//   if (typeof value !== 'string') return fallback;
//   const v = value.trim().toLowerCase();
//   if (['1', 'true', 'yes', 'on'].includes(v)) return true;
//   if (['0', 'false', 'no', 'off'].includes(v)) return false;
//   return fallback;
// };

// const toInt = (value, fallback) => {
//   const n = Number(value);
//   if (!Number.isFinite(n)) return fallback;
//   return Math.trunc(n);
// };

// const warnConfig = (message, data) => {
//   // Warn-only validation mode for safe rollout.
//   console.warn(`[config warning] ${message}`, data || '');
// };

// const NODE_ENV = process.env.NODE_ENV || 'development';
// const IS_PRODUCTION = NODE_ENV === 'production';

// // --- Hard fail on missing/weak secrets -------------------------------------
// // A hardcoded JWT secret fallback means anyone who reads the source (or this
// // repo, since it's public knowledge now) can forge a valid token for any
// // user or employee. Refuse to boot in production rather than run insecurely.
// const rawJwtSecret = process.env.JWT_SECRET;
// if (!rawJwtSecret) {
//   if (IS_PRODUCTION) {
//     throw new Error('FATAL: JWT_SECRET environment variable is not set. Refusing to start in production.');
//   }
//   warnConfig(
//     'JWT_SECRET is not set - using a random per-process secret for this dev session only. ' +
//       'Every restart invalidates existing tokens. Set JWT_SECRET in your .env before deploying.'
//   );
// }
// if (rawJwtSecret && rawJwtSecret.length < 32) {
//   warnConfig('JWT_SECRET is shorter than 32 characters - use a longer, random value in production.');
// }
// const devFallbackJwtSecret = rawJwtSecret || [...Array(48)].map(() => Math.floor(Math.random() * 36).toString(36)).join('');

// if (IS_PRODUCTION && !process.env.MONGODB_URI) {
//   throw new Error('FATAL: MONGODB_URI environment variable is not set. Refusing to start in production.');
// }

// if (IS_PRODUCTION && !process.env.STRIPE_SECRET_KEY) {
//   warnConfig('STRIPE_SECRET_KEY is not set - subscription checkout/billing-portal/webhook endpoints will fail until it is configured.');
// }

// export const env = {
//   NODE_ENV: NODE_ENV,
//   IS_PRODUCTION: IS_PRODUCTION,
//   PORT: process.env.PORT || 5000,
//   MONGODB_URI: process.env.MONGODB_URI,
//   JWT_SECRET: devFallbackJwtSecret,
//   JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
//   BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:5000',
//   GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
//   GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  
//   SMTP_HOST: process.env.SMTP_HOST,
//   SMTP_PORT: process.env.SMTP_PORT || 587,
//   SMTP_USER: process.env.SMTP_USER,
//   SMTP_PASS: process.env.SMTP_PASS,
//   SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL,
//   SMTP_FROM_NAME: process.env.SMTP_FROM_NAME || 'CrewControl',
  
//   FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
//   VITE_API_URL: process.env.VITE_API_URL || 'http://localhost:5000/api',

//   // --- Stripe -----------------------------------------------------------
//   STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
//   STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
//   STRIPE_PLUS_MONTHLY_PRICE_ID: process.env.STRIPE_PLUS_MONTHLY_PRICE_ID || '',
//   STRIPE_PLUS_YEARLY_PRICE_ID: process.env.STRIPE_PLUS_YEARLY_PRICE_ID || '',
//   STRIPE_PRO_MONTHLY_PRICE_ID: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || '',
//   STRIPE_PRO_YEARLY_PRICE_ID: process.env.STRIPE_PRO_YEARLY_PRICE_ID || '',
//   STRIPE_ULTRA_MONTHLY_PRICE_ID: process.env.STRIPE_ULTRA_MONTHLY_PRICE_ID || '',
//   STRIPE_ULTRA_YEARLY_PRICE_ID: process.env.STRIPE_ULTRA_YEARLY_PRICE_ID || '',
//   AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001',
//   AI_SERVICE_TIMEOUT_MS: process.env.AI_SERVICE_TIMEOUT_MS || 45000,
//   REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
//   REDIS_PORT: process.env.REDIS_PORT || 6379,
//   REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
//   REDIS_DB: process.env.REDIS_DB || 0,
//   AI_WORKER_CONCURRENCY: process.env.AI_WORKER_CONCURRENCY || 4,
//   ENABLE_ASYNC_AI: process.env.ENABLE_ASYNC_AI || 'false',
//   ENABLE_OLLAMA: process.env.ENABLE_OLLAMA || 'true',
//   ENABLE_SEMANTIC_EXTRACTION: process.env.ENABLE_SEMANTIC_EXTRACTION || 'true',
//   ENABLE_PADDLE_OCR: process.env.ENABLE_PADDLE_OCR || 'true',
//   ENABLE_OBSERVABILITY: process.env.ENABLE_OBSERVABILITY || 'true',
//   ENABLE_CIRCUIT_BREAKER: process.env.ENABLE_CIRCUIT_BREAKER || 'false',
//   ASYNC_AI_DEDUP_WINDOW_MS: process.env.ASYNC_AI_DEDUP_WINDOW_MS || 120000,
// };

// const extractionModeRaw = String(process.env.EXTRACTION_MODE || 'hybrid').trim().toLowerCase();
// const extractionMode = ['deterministic_only', 'hybrid', 'semantic_full'].includes(extractionModeRaw)
//   ? extractionModeRaw
//   : 'hybrid';

// if (extractionModeRaw !== extractionMode) {
//   warnConfig('Invalid EXTRACTION_MODE, falling back to hybrid', { extractionModeRaw });
// }

// const backendRequestTimeoutMs = toInt(process.env.AI_SERVICE_TIMEOUT_MS, 45000);
// if (backendRequestTimeoutMs <= 0) {
//   warnConfig('AI_SERVICE_TIMEOUT_MS should be positive, using 45000', { backendRequestTimeoutMs });
// }

// export const runtimeConfig = {
//   featureFlags: {
//     enableAsyncAi: toBool(process.env.ENABLE_ASYNC_AI, false),
//     enableOllama: toBool(process.env.ENABLE_OLLAMA, true),
//     enableSemanticExtraction: toBool(process.env.ENABLE_SEMANTIC_EXTRACTION, true),
//     enablePaddleOcr: toBool(process.env.ENABLE_PADDLE_OCR, true),
//     enableObservability: toBool(process.env.ENABLE_OBSERVABILITY, true),
//     enableCircuitBreaker: toBool(process.env.ENABLE_CIRCUIT_BREAKER, false),
//   },
//   extraction: {
//     mode: extractionMode,
//     semanticConfidenceThreshold: Number(process.env.SEMANTIC_CONFIDENCE_THRESHOLD || 0.6),
//     ocrEnabled: toBool(process.env.ENABLE_PADDLE_OCR, true),
//     providerPriority: String(process.env.PROVIDER_PRIORITY || 'deterministic,ocr,semantic'),
//   },
//   timeouts: {
//     backendRequestMs: backendRequestTimeoutMs > 0 ? backendRequestTimeoutMs : 45000,
//     workerMs: toInt(process.env.AI_JOB_TIMEOUT_MS, 240000),
//     providerMs: toInt(process.env.PROVIDER_TIMEOUT_MS, 90000),
//     ocrMs: toInt(process.env.OCR_TIMEOUT_MS, 90000),
//     tableExtractionMs: toInt(process.env.TABLE_EXTRACTION_TIMEOUT_MS, 90000),
//   },
//   retries: {
//     ocr: toInt(process.env.OCR_RETRIES, 1),
//     provider: toInt(process.env.PROVIDER_RETRIES, 1),
//     worker: toInt(process.env.WORKER_RETRIES, 3),
//     queueAttempts: toInt(process.env.QUEUE_ATTEMPTS, 3),
//   },
//   circuitBreaker: {
//     enabled: toBool(process.env.ENABLE_CIRCUIT_BREAKER, false),
//     failureThreshold: toInt(process.env.CB_FAILURE_THRESHOLD, 3),
//     cooldownMs: toInt(process.env.CB_COOLDOWN_MS, 30000),
//     halfOpenSuccessThreshold: toInt(process.env.CB_HALF_OPEN_SUCCESS_THRESHOLD, 2),
//     baseRetryDelayMs: toInt(process.env.PROVIDER_RETRY_DELAY_MS, 250),
//     jitterMs: toInt(process.env.PROVIDER_RETRY_JITTER_MS, 150),
//   },
//   queue: {
//     redisHost: process.env.REDIS_HOST || '127.0.0.1',
//     redisPort: toInt(process.env.REDIS_PORT, 6379),
//     redisPassword: process.env.REDIS_PASSWORD || '',
//     redisDb: toInt(process.env.REDIS_DB, 0),
//     workerConcurrency: toInt(process.env.AI_WORKER_CONCURRENCY, 4),
//     backoffType: String(process.env.QUEUE_BACKOFF_TYPE || 'exponential'),
//     backoffDelayMs: toInt(process.env.QUEUE_BACKOFF_DELAY_MS, 5000),
//     dedupeWindowMs: toInt(process.env.ASYNC_AI_DEDUP_WINDOW_MS, 120000),
//     removeOnComplete: toInt(process.env.QUEUE_REMOVE_ON_COMPLETE, 500),
//     removeOnFail: toInt(process.env.QUEUE_REMOVE_ON_FAIL, 1000),
//     cleanupIntervalMs: toInt(process.env.QUEUE_CLEANUP_INTERVAL_MS, 600000),
//   },
//   concurrencyLimits: {
//     ocr: toInt(process.env.OCR_CONCURRENCY, 2),
//     semantic: toInt(process.env.SEMANTIC_CONCURRENCY, 2),
//     pdf: toInt(process.env.PDF_CONCURRENCY, 2),
//     inference: toInt(process.env.INFERENCE_CONCURRENCY, 1),
//   },
//   resourceLimits: {
//     maxPdfPages: toInt(process.env.MAX_PDF_PAGES, 100),
//     maxPayloadMb: toInt(process.env.MAX_PAYLOAD_MB, 32),
//     maxOcrImages: toInt(process.env.MAX_OCR_IMAGES, 200),
//     maxSemanticTokens: toInt(process.env.MAX_SEMANTIC_TOKENS, 4096),
//   },
//   observability: {
//     tracingEnabled: toBool(process.env.TRACING_ENABLED, true),
//     metricsEnabled: toBool(process.env.METRICS_ENABLED, true),
//     structuredLogsEnabled: toBool(process.env.STRUCTURED_LOGS_ENABLED, true),
//     verbosity: String(process.env.LOG_VERBOSITY || 'info'),
//     failureClassificationEnabled: toBool(process.env.FAILURE_CLASSIFICATION_ENABLED, true),
//     traceSamplingRate: Number(process.env.TRACE_SAMPLING_RATE || 0.1),
//     verboseSamplingRate: Number(process.env.VERBOSE_LOG_SAMPLING_RATE || 0.05),
//     debugArtifactSamplingRate: Number(process.env.DEBUG_ARTIFACT_SAMPLING_RATE || 0.02),
//     metricsAggregationIntervalMs: toInt(process.env.METRICS_AGGREGATION_INTERVAL_MS, 60000),
//   },
//   storageGovernance: {
//     tempFileRetentionMs: toInt(process.env.TEMP_FILE_RETENTION_MS, 24 * 60 * 60 * 1000),
//     debugRetentionMs: toInt(process.env.DEBUG_RETENTION_MS, 7 * 24 * 60 * 60 * 1000),
//     queueRetentionMs: toInt(process.env.QUEUE_RETENTION_MS, 7 * 24 * 60 * 60 * 1000),
//     cleanupScheduleMs: toInt(process.env.CLEANUP_SCHEDULE_MS, 60 * 60 * 1000),
//     generatedFileGovernance: String(process.env.GENERATED_FILE_GOVERNANCE || 'filesystem-v1'),
//   },
//   legacy: {
//     // Compatibility aliases for existing deployments.
//     ollamaEnableSemanticEnv: process.env.OLLAMA_ENABLE_SEMANTIC,
//   },
//   storage: {
//     // 'local' (default, current behavior) or 'r2'. Nothing changes for you
//     // until you set STORAGE_DRIVER=r2 and fill in the R2_* vars below.
//     driver: String(process.env.STORAGE_DRIVER || 'local').toLowerCase(),
//     r2: {
//       accountId: process.env.R2_ACCOUNT_ID || '',
//       accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
//       secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
//       bucket: process.env.R2_BUCKET_NAME || '',
//       // Full endpoint, e.g. https://<accountId>.r2.cloudflarestorage.com
//       endpoint: process.env.R2_ENDPOINT || '',
//       // How long a generated download link stays valid.
//       signedUrlExpirySeconds: toInt(process.env.R2_SIGNED_URL_EXPIRY_SECONDS, 900),
//     },
//   },
// };

// // if (env.storage.driver === 'r2') {
// //   const missing = ['accountId', 'accessKeyId', 'secretAccessKey', 'bucket', 'endpoint'].filter(
// //     (k) => !env.storage.r2[k]
// //   );
// if (runtimeConfig.storage.driver === 'r2') {
//   const missing = [
//     'accountId',
//     'accessKeyId',
//     'secretAccessKey',
//     'bucket',
//     'endpoint'
//   ].filter((k) => !runtimeConfig.storage.r2[k]);
  
//   if (missing.length) {
//     const msg = `STORAGE_DRIVER=r2 is set but missing R2 config: ${missing.join(', ')}`;
//     if (IS_PRODUCTION) {
//       throw new Error(`FATAL: ${msg}. Refusing to start in production.`);
//     }
//     warnConfig(msg, { fallback: 'requests touching storage will fail until this is fixed' });
//   }
// }

// export default env;


import dotenv from 'dotenv';

dotenv.config();

const toBool = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const v = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return fallback;
};

const toInt = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
};

const warnConfig = (message, data) => {
  // Warn-only validation mode for safe rollout.
  console.warn(`[config warning] ${message}`, data || '');
};

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// --- Hard fail on missing/weak secrets -------------------------------------
// A hardcoded JWT secret fallback means anyone who reads the source (or this
// repo, since it's public knowledge now) can forge a valid token for any
// user or employee. Refuse to boot in production rather than run insecurely.
const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret) {
  if (IS_PRODUCTION) {
    throw new Error('FATAL: JWT_SECRET environment variable is not set. Refusing to start in production.');
  }
  warnConfig(
    'JWT_SECRET is not set - using a random per-process secret for this dev session only. ' +
      'Every restart invalidates existing tokens. Set JWT_SECRET in your .env before deploying.'
  );
}
if (rawJwtSecret && rawJwtSecret.length < 32) {
  warnConfig('JWT_SECRET is shorter than 32 characters - use a longer, random value in production.');
}
const devFallbackJwtSecret = rawJwtSecret || [...Array(48)].map(() => Math.floor(Math.random() * 36).toString(36)).join('');

if (IS_PRODUCTION && !process.env.MONGODB_URI) {
  throw new Error('FATAL: MONGODB_URI environment variable is not set. Refusing to start in production.');
}

if (IS_PRODUCTION && !process.env.STRIPE_SECRET_KEY) {
  warnConfig('STRIPE_SECRET_KEY is not set - subscription checkout/billing-portal/webhook endpoints will fail until it is configured.');
}

// Redis backs BullMQ (invoice approval, AI extraction) and the read-through
// cache - it is not optional infrastructure in production. Without this
// check, an unset REDIS_URL silently falls back to 127.0.0.1 inside
// redis.connection.js, which simply never connects in a Railway container -
// queues and cache degrade silently instead of failing loudly at boot.
// DISABLE_REDIS=true remains a valid, explicit opt-out (queues fail fast on
// enqueue instead; see invoiceApproval.queue.js/extraction.queue.js).
if (IS_PRODUCTION && !process.env.REDIS_URL && process.env.DISABLE_REDIS !== 'true') {
  throw new Error(
    'FATAL: REDIS_URL is not set in production. Set REDIS_URL, or set DISABLE_REDIS=true to explicitly run without Redis/queues. Refusing to start.'
  );
}

export const env = {
  NODE_ENV: NODE_ENV,
  IS_PRODUCTION: IS_PRODUCTION,
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: devFallbackJwtSecret,
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:5000',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL,
  SMTP_FROM_NAME: process.env.SMTP_FROM_NAME || 'CrewControl',

  // Resend
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || '',

  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  VITE_API_URL: process.env.VITE_API_URL || 'http://localhost:5000/api',

  // --- Stripe -----------------------------------------------------------
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  STRIPE_PLUS_MONTHLY_PRICE_ID: process.env.STRIPE_PLUS_MONTHLY_PRICE_ID || '',
  STRIPE_PLUS_YEARLY_PRICE_ID: process.env.STRIPE_PLUS_YEARLY_PRICE_ID || '',
  STRIPE_PRO_MONTHLY_PRICE_ID: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || '',
  STRIPE_PRO_YEARLY_PRICE_ID: process.env.STRIPE_PRO_YEARLY_PRICE_ID || '',
  STRIPE_ULTRA_MONTHLY_PRICE_ID: process.env.STRIPE_ULTRA_MONTHLY_PRICE_ID || '',
  STRIPE_ULTRA_YEARLY_PRICE_ID: process.env.STRIPE_ULTRA_YEARLY_PRICE_ID || '',
  AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001',
  AI_SERVICE_SHARED_SECRET: process.env.AI_SERVICE_SHARED_SECRET || '',
  AI_SERVICE_TIMEOUT_MS: process.env.AI_SERVICE_TIMEOUT_MS || 45000,
  REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
  REDIS_PORT: process.env.REDIS_PORT || 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
  REDIS_DB: process.env.REDIS_DB || 0,
  AI_WORKER_CONCURRENCY: process.env.AI_WORKER_CONCURRENCY || 4,
  // --- Temporary application-managed free trial --------------------------
  // Launch mechanism used until Stripe checkout is turned on for real
  // customers. When true, every brand-new non-lifetime user gets a
  // FREE_TRIAL_DAYS-day trial at signup (see services/trial.service.js).
  // Flip to false to stop issuing new trials - existing trials already
  // granted are left untouched (see User.hasActiveAccess()).
  ENABLE_FREE_TRIAL: toBool(process.env.ENABLE_FREE_TRIAL, true),
  FREE_TRIAL_DAYS: toInt(process.env.FREE_TRIAL_DAYS, 15),
  ENABLE_ASYNC_AI: process.env.ENABLE_ASYNC_AI || 'false',
  ENABLE_OLLAMA: process.env.ENABLE_OLLAMA || 'true',
  ENABLE_SEMANTIC_EXTRACTION: process.env.ENABLE_SEMANTIC_EXTRACTION || 'true',
  ENABLE_PADDLE_OCR: process.env.ENABLE_PADDLE_OCR || 'true',
  ENABLE_OBSERVABILITY: process.env.ENABLE_OBSERVABILITY || 'true',
  ENABLE_CIRCUIT_BREAKER: process.env.ENABLE_CIRCUIT_BREAKER || 'false',
  ASYNC_AI_DEDUP_WINDOW_MS: process.env.ASYNC_AI_DEDUP_WINDOW_MS || 120000,
  storage: {
  driver: String(process.env.STORAGE_DRIVER || 'local').toLowerCase(),
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET_NAME || '',
    endpoint: process.env.R2_ENDPOINT || '',
    signedUrlExpirySeconds: Number(process.env.R2_SIGNED_URL_EXPIRY_SECONDS || 900),
  },
},
};

const extractionModeRaw = String(process.env.EXTRACTION_MODE || 'hybrid').trim().toLowerCase();
const extractionMode = ['deterministic_only', 'hybrid', 'semantic_full'].includes(extractionModeRaw)
  ? extractionModeRaw
  : 'hybrid';

if (extractionModeRaw !== extractionMode) {
  warnConfig('Invalid EXTRACTION_MODE, falling back to hybrid', { extractionModeRaw });
}

const backendRequestTimeoutMs = toInt(process.env.AI_SERVICE_TIMEOUT_MS, 45000);
if (backendRequestTimeoutMs <= 0) {
  warnConfig('AI_SERVICE_TIMEOUT_MS should be positive, using 45000', { backendRequestTimeoutMs });
}

export const runtimeConfig = {
  featureFlags: {
    enableAsyncAi: toBool(process.env.ENABLE_ASYNC_AI, false),
    enableOllama: toBool(process.env.ENABLE_OLLAMA, true),
    enableSemanticExtraction: toBool(process.env.ENABLE_SEMANTIC_EXTRACTION, true),
    enablePaddleOcr: toBool(process.env.ENABLE_PADDLE_OCR, true),
    enableObservability: toBool(process.env.ENABLE_OBSERVABILITY, true),
    enableCircuitBreaker: toBool(process.env.ENABLE_CIRCUIT_BREAKER, false),
    enableQueryProfiler: toBool(process.env.ENABLE_QUERY_PROFILER, true),
    enableHealthDetails: toBool(process.env.ENABLE_HEALTH_DETAILS, true),
    logQueryParameters: toBool(process.env.LOG_QUERY_PARAMETERS, true),
  },
  mongoProfiler: {
    slowQueryMs: toInt(process.env.MONGO_SLOW_QUERY_MS, 150),
  },
  extraction: {
    mode: extractionMode,
    semanticConfidenceThreshold: Number(process.env.SEMANTIC_CONFIDENCE_THRESHOLD || 0.6),
    ocrEnabled: toBool(process.env.ENABLE_PADDLE_OCR, true),
    providerPriority: String(process.env.PROVIDER_PRIORITY || 'deterministic,ocr,semantic'),
  },
  timeouts: {
    backendRequestMs: backendRequestTimeoutMs > 0 ? backendRequestTimeoutMs : 45000,
    workerMs: toInt(process.env.AI_JOB_TIMEOUT_MS, 240000),
    providerMs: toInt(process.env.PROVIDER_TIMEOUT_MS, 90000),
    ocrMs: toInt(process.env.OCR_TIMEOUT_MS, 90000),
    tableExtractionMs: toInt(process.env.TABLE_EXTRACTION_TIMEOUT_MS, 90000),
  },
  retries: {
    ocr: toInt(process.env.OCR_RETRIES, 1),
    provider: toInt(process.env.PROVIDER_RETRIES, 1),
    worker: toInt(process.env.WORKER_RETRIES, 3),
    queueAttempts: toInt(process.env.QUEUE_ATTEMPTS, 3),
  },
  circuitBreaker: {
    enabled: toBool(process.env.ENABLE_CIRCUIT_BREAKER, false),
    failureThreshold: toInt(process.env.CB_FAILURE_THRESHOLD, 3),
    cooldownMs: toInt(process.env.CB_COOLDOWN_MS, 30000),
    halfOpenSuccessThreshold: toInt(process.env.CB_HALF_OPEN_SUCCESS_THRESHOLD, 2),
    baseRetryDelayMs: toInt(process.env.PROVIDER_RETRY_DELAY_MS, 250),
    jitterMs: toInt(process.env.PROVIDER_RETRY_JITTER_MS, 150),
  },
  
  queue: {
    redisUrl: process.env.REDIS_URL || '',

    redisHost: process.env.REDIS_HOST || '127.0.0.1',
    redisPort: toInt(process.env.REDIS_PORT, 6379),
    redisPassword: process.env.REDIS_PASSWORD || '',
    redisDb: toInt(process.env.REDIS_DB, 0),
    workerConcurrency: toInt(process.env.AI_WORKER_CONCURRENCY, 4),
    backoffType: String(process.env.QUEUE_BACKOFF_TYPE || 'exponential'),
    backoffDelayMs: toInt(process.env.QUEUE_BACKOFF_DELAY_MS, 5000),
    dedupeWindowMs: toInt(process.env.ASYNC_AI_DEDUP_WINDOW_MS, 120000),
    removeOnComplete: toInt(process.env.QUEUE_REMOVE_ON_COMPLETE, 500),
    removeOnFail: toInt(process.env.QUEUE_REMOVE_ON_FAIL, 1000),
    cleanupIntervalMs: toInt(process.env.QUEUE_CLEANUP_INTERVAL_MS, 600000),
  },
  concurrencyLimits: {
    ocr: toInt(process.env.OCR_CONCURRENCY, 2),
    semantic: toInt(process.env.SEMANTIC_CONCURRENCY, 2),
    pdf: toInt(process.env.PDF_CONCURRENCY, 2),
    inference: toInt(process.env.INFERENCE_CONCURRENCY, 1),
  },
  resourceLimits: {
    maxPdfPages: toInt(process.env.MAX_PDF_PAGES, 100),
    maxPayloadMb: toInt(process.env.MAX_PAYLOAD_MB, 32),
    maxOcrImages: toInt(process.env.MAX_OCR_IMAGES, 200),
    maxSemanticTokens: toInt(process.env.MAX_SEMANTIC_TOKENS, 4096),
  },
  observability: {
    tracingEnabled: toBool(process.env.TRACING_ENABLED, true),
    metricsEnabled: toBool(process.env.METRICS_ENABLED, true),
    structuredLogsEnabled: toBool(process.env.STRUCTURED_LOGS_ENABLED, true),
    verbosity: String(process.env.LOG_VERBOSITY || 'info'),
    failureClassificationEnabled: toBool(process.env.FAILURE_CLASSIFICATION_ENABLED, true),
    traceSamplingRate: Number(process.env.TRACE_SAMPLING_RATE || 0.1),
    verboseSamplingRate: Number(process.env.VERBOSE_LOG_SAMPLING_RATE || 0.05),
    debugArtifactSamplingRate: Number(process.env.DEBUG_ARTIFACT_SAMPLING_RATE || 0.02),
    metricsAggregationIntervalMs: toInt(process.env.METRICS_AGGREGATION_INTERVAL_MS, 60000),
  },
  storageGovernance: {
    tempFileRetentionMs: toInt(process.env.TEMP_FILE_RETENTION_MS, 24 * 60 * 60 * 1000),
    debugRetentionMs: toInt(process.env.DEBUG_RETENTION_MS, 7 * 24 * 60 * 60 * 1000),
    queueRetentionMs: toInt(process.env.QUEUE_RETENTION_MS, 7 * 24 * 60 * 60 * 1000),
    cleanupScheduleMs: toInt(process.env.CLEANUP_SCHEDULE_MS, 60 * 60 * 1000),
    generatedFileGovernance: String(process.env.GENERATED_FILE_GOVERNANCE || 'filesystem-v1'),
  },
  legacy: {
    // Compatibility aliases for existing deployments.
    ollamaEnableSemanticEnv: process.env.OLLAMA_ENABLE_SEMANTIC,
  },
  storage: {
    // 'local' (default, current behavior) or 'r2'. Nothing changes for you
    // until you set STORAGE_DRIVER=r2 and fill in the R2_* vars below.
    driver: String(process.env.STORAGE_DRIVER || 'local').toLowerCase(),
    r2: {
      accountId: process.env.R2_ACCOUNT_ID || '',
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      bucket: process.env.R2_BUCKET_NAME || '',
      // Full endpoint, e.g. https://<accountId>.r2.cloudflarestorage.com
      endpoint: process.env.R2_ENDPOINT || '',
      // How long a generated download link stays valid.
      signedUrlExpirySeconds: toInt(process.env.R2_SIGNED_URL_EXPIRY_SECONDS, 900),
    },
  },
};

// if (env.storage.driver === 'r2') {
//   const missing = ['accountId', 'accessKeyId', 'secretAccessKey', 'bucket', 'endpoint'].filter(
//     (k) => !env.storage.r2[k]
//   );
if (IS_PRODUCTION && !process.env.STORAGE_DRIVER) {
  throw new Error(
    'FATAL: STORAGE_DRIVER is not set. Refusing to start in production with an ' +
    'implicit local-filesystem storage default - this would silently lose files ' +
    'on every deploy/restart and break access across multiple instances. Set ' +
    'STORAGE_DRIVER=r2 (with the R2_* variables) or STORAGE_DRIVER=local explicitly ' +
    'if local storage is genuinely intended.'
  );
}

if (runtimeConfig.storage.driver === 'r2') {
  const missing = [
    'accountId',
    'accessKeyId',
    'secretAccessKey',
    'bucket',
    'endpoint'
  ].filter((k) => !runtimeConfig.storage.r2[k]);
  
  if (missing.length) {
    const msg = `STORAGE_DRIVER=r2 is set but missing R2 config: ${missing.join(', ')}`;
    if (IS_PRODUCTION) {
      throw new Error(`FATAL: ${msg}. Refusing to start in production.`);
    }
    warnConfig(msg, { fallback: 'requests touching storage will fail until this is fixed' });
  }
}

// Closure-pass finding: AI_SERVICE_SHARED_SECRET was read at line 329 with
// a silent `|| ''` fallback and no startup-time validation anywhere in this
// file, despite this comment block (before this fix) claiming a production
// guard already existed "above" alongside STORAGE_DRIVER. It didn't - the
// Node backend could boot in production, silently omit the
// X-Internal-Service-Key header on every AI-service request (see
// extraction.service.js/invoiceDraft.service.js's `env.AI_SERVICE_SHARED_SECRET
// ? {...} : {}` pattern), and only the *Python* AI service's own
// `APP_ENV=production` check stood between "misconfigured" and "AI service
// wide open on the public internet." AI-service integration (invoice/
// timesheet extraction) is a core feature with no opt-out flag in this
// codebase (grepped for DISABLE_AI_SERVICE/AI_SERVICE_ENABLED - neither
// exists), so unlike Redis/Stripe (which have explicit DISABLE_REDIS /
// warn-only escape hatches for genuinely optional integrations), there is
// no legitimate production deployment that runs without it. Same
// fail-closed-in-production, warn-in-development pattern as STORAGE_DRIVER/
// SMTP below.
if (IS_PRODUCTION && !process.env.AI_SERVICE_SHARED_SECRET) {
  throw new Error(
    'FATAL: AI_SERVICE_SHARED_SECRET is not set. Refusing to start in production ' +
    'without it - every extraction.service.js/invoiceDraft.service.js request to ' +
    'the AI service would silently omit the X-Internal-Service-Key header, and ' +
    'depending on that service\'s own APP_ENV configuration this can mean its ' +
    'OCR/PDF/extraction endpoints are reachable with zero authentication. Set ' +
    'AI_SERVICE_SHARED_SECRET to the same value configured on the AI service, or ' +
    'set NODE_ENV to a non-production value for local/dev use.'
  );
}
if (!process.env.AI_SERVICE_SHARED_SECRET) {
  warnConfig(
    'AI_SERVICE_SHARED_SECRET is not set - requests to the AI service will be sent ' +
      'without the X-Internal-Service-Key header. Fine for local dev against a ' +
      'locally-run AI service with no secret configured; set this before deploying.'
  );
}

// Phase 11 finding: unlike STORAGE_DRIVER and AI_SERVICE_SHARED_SECRET
// above, SMTP config had no startup-time validation at all - nodemailer's
// createTransport() (email.util.js) doesn't validate its config at
// creation time, only when sendMail() is actually called. Without this
// check, a production deployment missing SMTP_HOST/SMTP_USER/SMTP_PASS/
// SMTP_FROM_EMAIL would start up looking completely healthy and only fail
// silently (a console.error, no alert) the first time a real user tries
// to sign up or reset their password - both core auth flows depend on
// OTP delivery via email. Matches the same fail-closed-in-production,
// warn-in-development pattern already established for storage and the
// AI-service shared secret.
{
  const missingResend = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'].filter((k) => !process.env[k]);
  if (missingResend.length) {
    const msg = `Resend is not fully configured - missing: ${missingResend.join(', ')}`;
    if (IS_PRODUCTION) {
      throw new Error(
        `FATAL: ${msg}. Refusing to start in production with broken email delivery - ` +
        'signup OTP verification and password reset both depend on this. Set both of ' +
        'RESEND_API_KEY/RESEND_FROM_EMAIL, or set NODE_ENV to a non-production value ' +
        'for local/dev use.'
      );
    }
    warnConfig(msg, { fallback: 'OTP/password-reset emails will fail to send until this is fixed' });
  }
}

export default env;