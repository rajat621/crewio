import dotenv from 'dotenv';
import { Worker } from 'bullmq';

import { connectDB } from '../config/db.js';
import { runtimeConfig } from '../config/env.js';
import ExtractionJob from '../models/ExtractionJob.js';
import redisConnection from '../queue/redis.connection.js';
import { EXTRACTION_QUEUE_NAME } from '../queue/extraction.queue.js';
import {
  extractAttendance,
  extractDocument,
  extractInvoiceSummary,
  generateInvoiceFromPdf,
} from '../services/extraction.service.js';

dotenv.config();

const isEnabled = (v, defaultValue = false) => {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return defaultValue;
  const x = v.trim().toLowerCase();
  return x === '1' || x === 'true' || x === 'yes' || x === 'on';
};

const workerMetrics = {
  startedAt: new Date().toISOString(),
  completed: 0,
  failed: 0,
  timedOut: 0,
};

const FAILURE_CATEGORIES = {
  OCR_FAILURE: 'OCR_FAILURE',
  TABLE_EXTRACTION_FAILURE: 'TABLE_EXTRACTION_FAILURE',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  MALFORMED_JSON: 'MALFORMED_JSON',
  VALIDATION_FAILURE: 'VALIDATION_FAILURE',
  PDF_CORRUPTION: 'PDF_CORRUPTION',
  WORKER_TIMEOUT: 'WORKER_TIMEOUT',
  UNKNOWN_FAILURE: 'UNKNOWN_FAILURE',
  PROVIDER_OVERLOAD: 'PROVIDER_OVERLOAD',
  UNKNOWN_PROVIDER_ERROR: 'UNKNOWN_PROVIDER_ERROR',
};

const classifyFailure = (error) => {
  const msg = String(error?.message || error || '').toLowerCase();
  if (msg.includes('ocr')) return FAILURE_CATEGORIES.OCR_FAILURE;
  if (msg.includes('table')) return FAILURE_CATEGORIES.TABLE_EXTRACTION_FAILURE;
  if (msg.includes('timed out') || msg.includes('timeout')) return FAILURE_CATEGORIES.WORKER_TIMEOUT;
  if (msg.includes('429') || msg.includes('overload') || msg.includes('too many requests')) return FAILURE_CATEGORIES.PROVIDER_OVERLOAD;
  if (msg.includes('unavailable') || msg.includes('connection') || msg.includes('econn')) return FAILURE_CATEGORIES.PROVIDER_UNAVAILABLE;
  if (msg.includes('json')) return FAILURE_CATEGORIES.MALFORMED_JSON;
  if (msg.includes('validation')) return FAILURE_CATEGORIES.VALIDATION_FAILURE;
  if (msg.includes('corrupted pdf') || msg.includes('unreadable pdf')) return FAILURE_CATEGORIES.PDF_CORRUPTION;
  if (msg.includes('provider')) return FAILURE_CATEGORIES.UNKNOWN_PROVIDER_ERROR;
  return FAILURE_CATEGORIES.UNKNOWN_FAILURE;
};

const logEvent = (event, data = {}) => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      service: 'ai-worker',
      event,
      ...data,
    })
  );
};

const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
};

// Lightweight concurrency/resource guards (config-driven)
const Semaphore = (max) => {
  let count = max;
  const queue = [];
  return {
    acquire: () => new Promise((resolve) => {
      if (count > 0) {
        count--;
        resolve();
      } else {
        queue.push(resolve);
      }
    }),
    release: () => {
      count++;
      if (queue.length > 0 && count > 0) {
        count--;
        queue.shift()();
      }
    },
    value: () => count,
  };
};

const ocrSemaphore = Semaphore(runtimeConfig.concurrencyLimits.ocr);
const semanticSemaphore = Semaphore(runtimeConfig.concurrencyLimits.semantic);
const pdfSemaphore = Semaphore(runtimeConfig.concurrencyLimits.pdf);
const inferenceSemaphore = Semaphore(runtimeConfig.concurrencyLimits.inference);

const isLargePdf = (pdfPath) => {
  // Placeholder: implement PDF page count or file size check if needed
  // For now, always return false (safe default)
  return false;
};

const withGuard = async (sem, fn) => {
  if (!sem) return await fn();
  await sem.acquire();
  try {
    return await fn();
  } finally {
    sem.release();
  }
};

// Lightweight tenant-aware rate limiting
const tenantJobCounts = {};
const TENANT_MAX_PENDING = Number(process.env.TENANT_MAX_PENDING || 10);
const RETRY_BASE_DELAY_MS = Number(process.env.RETRY_BASE_DELAY_MS || 2000);
const RETRY_JITTER_MS = Number(process.env.RETRY_JITTER_MS || 1000);
const MAX_RETRIES = Number(process.env.MAX_JOB_RETRIES || 3);
const STALLED_JOB_TIMEOUT_MS = Number(process.env.STALLED_JOB_TIMEOUT_MS || 600000);
const DEAD_LETTER_RETENTION_MS = Number(process.env.DEAD_LETTER_RETENTION_MS || 604800000); // 7 days

// Debounced progress update helper
const PROGRESS_UPDATE_DEBOUNCE_MS = Number(process.env.PROGRESS_UPDATE_DEBOUNCE_MS || 5000);
let lastProgressUpdate = 0;
async function debouncedProgressUpdate(jobId, progress, extra = {}) {
  const now = Date.now();
  if (now - lastProgressUpdate > PROGRESS_UPDATE_DEBOUNCE_MS) {
    lastProgressUpdate = now;
    await ExtractionJob.findOneAndUpdate(
      { jobId },
      { progress, ...extra }
    );
    logEvent('db_progress_update', { jobId, progress });
  } else {
    logEvent('db_progress_suppressed', { jobId, progress });
  }
}

// Batch non-critical metadata writes
const BATCHED_METADATA_UPDATE_MS = Number(process.env.BATCHED_METADATA_UPDATE_MS || 10000);
let batchedMetadata = {};
let batchTimeout = null;
function queueMetadataUpdate(jobId, update) {
  batchedMetadata[jobId] = { ...(batchedMetadata[jobId] || {}), ...update };
  if (!batchTimeout) {
    batchTimeout = setTimeout(async () => {
      const updates = { ...batchedMetadata };
      batchedMetadata = {};
      batchTimeout = null;
      for (const [jid, upd] of Object.entries(updates)) {
        await ExtractionJob.findOneAndUpdate({ jobId: jid }, upd);
        logEvent('db_batched_metadata_update', { jobId: jid, fields: Object.keys(upd) });
      }
    }, BATCHED_METADATA_UPDATE_MS);
  }
}

const processAiJob = async (job) => {
  const { jobId, jobType, payload, traceContext, tenantId } = job.data || {};
  const requestId = traceContext?.requestId || null;
  const traceId = traceContext?.traceId || null;


  if (!jobId) {
    throw new Error('Missing jobId in queue payload');
  }
  // Tenant-aware pending job cap
  if (tenantId) {
    tenantJobCounts[tenantId] = (tenantJobCounts[tenantId] || 0) + 1;
    if (tenantJobCounts[tenantId] > TENANT_MAX_PENDING) {
      logEvent('tenant_queue_pressure', { tenantId, pending: tenantJobCounts[tenantId] });
      throw new Error(`Tenant ${tenantId} exceeded max pending jobs`);
    }
  }

  // Critical write: always update status/startedAt/attemptsMade at job start
  await ExtractionJob.findOneAndUpdate(
    { jobId },
    {
      status: 'active',
      startedAt: new Date(),
      attemptsMade: job.attemptsMade,
      progress: 10,
      error: null,
      requestId,
      traceId,
      decisionTrace: {
        extractionMode: runtimeConfig.extraction.mode,
        providerUsed: runtimeConfig.featureFlags.enableOllama ? 'ollama' : 'deterministic',
        ocrUsed: runtimeConfig.featureFlags.enablePaddleOcr,
        semanticUsed: runtimeConfig.featureFlags.enableSemanticExtraction,
        fallbackActivated: false,
        timeoutOccurred: false,
        retryOccurred: Number(job.attemptsMade || 0) > 0,
        confidenceScore: null,
      },
    }
  );

  const timeoutMs = Number(runtimeConfig.timeouts.workerMs || 240000);
  const baseCompanyData = {
    ...(payload?.company_data || {}),
    companyId: payload?.companyId || payload?.company_data?.companyId,
    userId: payload?.userId || payload?.company_data?.userId,
  };


  const startedAt = Date.now();
  const enqueuedAt = job.data?.observability?.enqueuedAt ? Date.parse(job.data.observability.enqueuedAt) : null;
  const queueWaitMs = Number.isFinite(enqueuedAt) ? Math.max(0, startedAt - enqueuedAt) : null;
  if (queueWaitMs !== null && queueWaitMs > 60000) {
    logEvent('queue_latency_warning', { jobId, queueWaitMs });
    // Semantic degradation under pressure
    if (runtimeConfig.featureFlags.enableSemanticExtraction) {
      logEvent('semantic_degradation', { jobId, reason: 'queue_latency' });
      runtimeConfig.featureFlags.enableSemanticExtraction = false;
    }
  }

  logEvent('stage_start', {
    stage: 'worker_execution',
    jobId,
    jobType,
    requestId,
    traceId,
    queueWaitMs,
  });


  let result;
  let retries = 0;
  let lastError = null;
  while (retries <= MAX_RETRIES) {
    try {

      if (jobType === 'extract') {
        // Priority: deterministic > PDF > OCR > semantic
        result = await withGuard(pdfSemaphore, async () =>
          await withTimeout(extractDocument({
            pdfPath: payload?.pdfPath,
            documentType: payload?.documentType || 'auto',
            traceContext: {
              requestId,
              traceId,
            },
          }), timeoutMs, `AI job timed out after ${timeoutMs}ms`)
        );
      } else if (jobType === 'extract-invoice-summary') {
        result = await withGuard(pdfSemaphore, async () =>
          await withTimeout(extractInvoiceSummary({
            pdfPath: payload?.pdfPath,
            traceContext: {
              requestId,
              traceId,
            },
          }), timeoutMs, `AI job timed out after ${timeoutMs}ms`)
        );
      } else if (jobType === 'extract-attendance') {
        result = await withGuard(pdfSemaphore, async () =>
          await withTimeout(extractAttendance({
            pdfPath: payload?.pdfPath,
            traceContext: {
              requestId,
              traceId,
            },
          }), timeoutMs, `AI job timed out after ${timeoutMs}ms`)
        );
      } else if (jobType === 'generate-invoice') {
        result = await withGuard(pdfSemaphore, async () =>
          await withTimeout(generateInvoiceFromPdf({
            pdfPath: payload?.pdfPath,
            owner_company_id: payload?.owner_company_id,
            owner_template_id: payload?.owner_template_id,
            template_override: payload?.template_override,
            signature_override: payload?.signature_override,
            stamp_override: payload?.stamp_override,
            include_signature: payload?.include_signature,
            include_stamp: payload?.include_stamp,
            company_data: baseCompanyData,
            traceContext: {
              requestId,
              traceId,
            },
          }), timeoutMs, `AI job timed out after ${timeoutMs}ms`)
        );
      } else {
        throw new Error(`Unsupported job type: ${jobType}`);
      }
      break; // Success, exit retry loop
    } catch (err) {
      lastError = err;
      retries++;
      if (retries > MAX_RETRIES) {
        logEvent('job_dead_lettered', { jobId, error: String(err), retries });
        // Dead-letter retention
        setTimeout(() => {
          logEvent('dead_letter_retained', { jobId, error: String(err) });
        }, DEAD_LETTER_RETENTION_MS);
        throw err;
      }
      // Jittered retry
      const delay = RETRY_BASE_DELAY_MS + Math.floor(Math.random() * RETRY_JITTER_MS);
      logEvent('job_retry', { jobId, retries, delay });
      await new Promise((res) => setTimeout(res, delay));
    }
  }

  // Critical write: always update status/result/progress at job completion
  await ExtractionJob.findOneAndUpdate(
    { jobId },
    {
      status: 'completed',
      result,
      progress: 100,
      attemptsMade: job.attemptsMade,
      completedAt: new Date(),
      error: null,
      failureCategory: null,
      decisionTrace: {
        extractionMode: runtimeConfig.extraction.mode,
        providerUsed: runtimeConfig.featureFlags.enableOllama ? 'ollama' : 'deterministic',
        ocrUsed: Boolean(result?.used_ocr || result?.pipeline?.used_ocr),
        semanticUsed: runtimeConfig.featureFlags.enableSemanticExtraction,
        fallbackActivated: Boolean((result?.warnings || []).some((w) => String(w).toLowerCase().includes('fallback'))),
        timeoutOccurred: false,
        retryOccurred: retries > 0,
        confidenceScore: Number(result?.confidence || result?.pipeline?.confidence || 0) || null,
      },
    }
  );


  workerMetrics.completed += 1;

  logEvent('job_completed', {
    jobId,
    jobType,
    elapsedMs: Date.now() - startedAt,
    metrics: workerMetrics,
    requestId,
    traceId,
    queueWaitMs,
    retries,
    tenantId,
    dbWrite: 'critical',
  });

  // Stalled job detection
  if (Date.now() - startedAt > STALLED_JOB_TIMEOUT_MS) {
    logEvent('stalled_job_detected', { jobId, durationMs: Date.now() - startedAt });
  }

  // Decrement tenant job count
  if (tenantId) {
    tenantJobCounts[tenantId] = Math.max(0, (tenantJobCounts[tenantId] || 1) - 1);
  }

  logEvent('stage_complete', {
    stage: 'worker_execution',
    jobId,
    jobType,
    requestId,
    traceId,
    durationMs: Date.now() - startedAt,
    queueWaitMs,
  });

  return result;
};

// Periodic temp cleanup janitor
// const { spawn } = require('child_process');

import { spawn } from 'child_process';
const TEMP_CLEANUP_INTERVAL_MS = Number(process.env.TEMP_CLEANUP_INTERVAL_MS || 3600000); // 1 hour
let janitorInterval = null;
function startJanitor() {
  if (janitorInterval) return;
  janitorInterval = setInterval(() => {
    const proc = spawn('python', ['ai-service/scripts/janitor_temp_cleanup.py']);
    proc.stdout.on('data', (data) => {
      try {
        const evt = JSON.parse(data.toString());
        logEvent('temp_cleanup', evt);
      } catch (e) {
        // Not JSON, just log
        logEvent('temp_cleanup_log', { raw: data.toString() });
      }
    });
    proc.stderr.on('data', (data) => {
      logEvent('temp_cleanup_error', { error: data.toString() });
    });
    proc.on('exit', (code) => {
      logEvent('temp_cleanup_exit', { code });
    });
  }, TEMP_CLEANUP_INTERVAL_MS);
}

const bootstrap = async () => {
  if (!isEnabled(String(runtimeConfig.featureFlags.enableAsyncAi), false)) {
    logEvent('worker_disabled', { reason: 'ENABLE_ASYNC_AI=false' });
    return;
  }


  await connectDB();
  if (isEnabled(process.env.ENABLE_TEMP_CLEANUP, true)) {
    startJanitor();
  }

  const worker = new Worker(EXTRACTION_QUEUE_NAME, processAiJob, {
    connection: redisConnection,
    concurrency: Number(runtimeConfig.queue.workerConcurrency || 4),
  });

  worker.on('completed', (job) => {
    logEvent('queue_completed', { queueJobId: job.id });
  });

  worker.on('failed', async (job, error) => {
    const jobId = job?.data?.jobId;
    const requestId = job?.data?.traceContext?.requestId || null;
    const traceId = job?.data?.traceContext?.traceId || null;
    const failureCategory = classifyFailure(error);
    const fallbackActivated = [
      FAILURE_CATEGORIES.PROVIDER_TIMEOUT,
      FAILURE_CATEGORIES.PROVIDER_UNAVAILABLE,
      FAILURE_CATEGORIES.PROVIDER_OVERLOAD,
      FAILURE_CATEGORIES.UNKNOWN_PROVIDER_ERROR,
      FAILURE_CATEGORIES.MALFORMED_JSON,
    ].includes(failureCategory);
    const timedOut = (error?.message || '').toLowerCase().includes('timed out');
    if (jobId) {
      await ExtractionJob.findOneAndUpdate(
        { jobId },
        {
          status: 'failed',
          error: error?.message || 'Unknown worker error',
          failureCategory,
          attemptsMade: job.attemptsMade,
          completedAt: new Date(),
          decisionTrace: {
            extractionMode: runtimeConfig.extraction.mode,
            providerUsed: runtimeConfig.featureFlags.enableOllama ? 'ollama' : 'deterministic',
            ocrUsed: runtimeConfig.featureFlags.enablePaddleOcr,
            semanticUsed: runtimeConfig.featureFlags.enableSemanticExtraction,
            fallbackActivated,
            timeoutOccurred: timedOut,
            retryOccurred: Number(job?.attemptsMade || 0) > 0,
            confidenceScore: null,
          },
        }
      );
    }
    workerMetrics.failed += 1;
    if ((error?.message || '').toLowerCase().includes('timed out')) {
      workerMetrics.timedOut += 1;
    }
    logEvent('job_failed', {
      queueJobId: job?.id,
      jobId,
      error: error?.message || String(error),
      failureCategory,
      requestId,
      traceId,
      fallbackActivated,
      metrics: workerMetrics,
    });

    logEvent('stage_failure', {
      stage: 'worker_execution',
      jobId,
      jobType: job?.data?.jobType,
      requestId,
      traceId,
      reason: error?.message || String(error),
      failureCategory,
    });
  });

  worker.on('error', (error) => {
    logEvent('worker_error', { error: error?.message || String(error) });
  });

  logEvent('worker_started', {
    queue: EXTRACTION_QUEUE_NAME,
    concurrency: Number(runtimeConfig.queue.workerConcurrency || 4),
  });
};

bootstrap().catch((error) => {
  logEvent('worker_fatal', { error: error?.message || String(error) });
  process.exit(1);
});
