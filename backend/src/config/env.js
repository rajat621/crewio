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

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET || 'your_secret_key',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:5000',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
<<<<<<< HEAD
  
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT || 587,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL,
  SMTP_FROM_NAME: process.env.SMTP_FROM_NAME || 'CrewControl',
  
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  VITE_API_URL: process.env.VITE_API_URL || 'http://localhost:5000/api',
  AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001',
  AI_SERVICE_TIMEOUT_MS: process.env.AI_SERVICE_TIMEOUT_MS || 45000,
  REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
  REDIS_PORT: process.env.REDIS_PORT || 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
  REDIS_DB: process.env.REDIS_DB || 0,
  AI_WORKER_CONCURRENCY: process.env.AI_WORKER_CONCURRENCY || 4,
  ENABLE_ASYNC_AI: process.env.ENABLE_ASYNC_AI || 'false',
  ENABLE_OLLAMA: process.env.ENABLE_OLLAMA || 'true',
  ENABLE_SEMANTIC_EXTRACTION: process.env.ENABLE_SEMANTIC_EXTRACTION || 'true',
  ENABLE_PADDLE_OCR: process.env.ENABLE_PADDLE_OCR || 'true',
  ENABLE_OBSERVABILITY: process.env.ENABLE_OBSERVABILITY || 'true',
  ENABLE_CIRCUIT_BREAKER: process.env.ENABLE_CIRCUIT_BREAKER || 'false',
  ASYNC_AI_DEDUP_WINDOW_MS: process.env.ASYNC_AI_DEDUP_WINDOW_MS || 120000,
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
=======
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || '',
  
  // FRONTEND_URL: process.env.FRONTEND_URL || 'https://crewio-rust.vercel.app',
  // VITE_API_URL: process.env.VITE_API_URL || 'https://crewio.onrender.com/api',
  // AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'https://crewio-ai-services.onrender.com',
  // AI_SERVICE_TIMEOUT_MS: process.env.AI_SERVICE_TIMEOUT_MS || 45000,
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
};

export default env;
