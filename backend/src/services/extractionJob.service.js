import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import ExtractionJob from '../models/ExtractionJob.js';
import extractionQueue from '../queue/extraction.queue.js';
import env from '../config/env.js';
import { runtimeConfig } from '../config/env.js';

const ALLOWED_JOB_TYPES = new Set([
  'extract',
  'extract-invoice-summary',
  'extract-attendance',
  'generate-invoice',
]);

const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
};

const buildRequestHash = ({ jobType, companyId, userId, payload }) => {
  const canonical = stableStringify({
    jobType,
    companyId: String(companyId),
    userId: String(userId),
    payload,
  });
  return createHash('sha256').update(canonical).digest('hex');
};

export const enqueueExtractionJob = async ({ jobType, companyId, userId, payload, traceContext = {} }) => {
  if (!ALLOWED_JOB_TYPES.has(jobType)) {
    throw new Error(`Unsupported AI job type: ${jobType}`);
  }

  const dedupeWindowMs = Number(env.ASYNC_AI_DEDUP_WINDOW_MS || 120000);
  const requestHash = buildRequestHash({ jobType, companyId, userId, payload: payload || {} });
  const dedupeSince = new Date(Date.now() - dedupeWindowMs);

  const existing = await ExtractionJob.findOne({
    requestHash,
    companyId,
    userId,
    status: { $in: ['queued', 'active'] },
    createdAt: { $gte: dedupeSince },
  }).lean();

  if (existing) {
    return {
      jobId: existing.jobId,
      status: existing.status,
      reused: true,
    };
  }

  const jobId = randomUUID();

  await ExtractionJob.create({
    jobId,
    jobType,
    status: 'queued',
    companyId,
    userId,
    requestHash,
    dedupeWindowMs,
    payload: payload || {},
    requestId: traceContext.requestId || null,
    traceId: traceContext.traceId || null,
    decisionTrace: {
      extractionMode: runtimeConfig.extraction.mode,
      providerUsed: runtimeConfig.featureFlags.enableOllama ? 'ollama' : 'deterministic',
      ocrUsed: runtimeConfig.featureFlags.enablePaddleOcr,
      semanticUsed: runtimeConfig.featureFlags.enableSemanticExtraction,
      fallbackActivated: false,
      timeoutOccurred: false,
      retryOccurred: false,
      confidenceScore: null,
    },
    progress: 0,
  });

  await extractionQueue.add(
    'process-ai-job',
    {
      jobId,
      jobType,
      companyId: String(companyId),
      userId: String(userId),
      payload: payload || {},
      traceContext: {
        requestId: traceContext.requestId || null,
        traceId: traceContext.traceId || null,
      },
      observability: {
        enqueuedAt: new Date().toISOString(),
      },
    },
    {
      jobId,
    }
  );

  return {
    jobId,
    status: 'queued',
    reused: false,
  };
};

export const getTenantScopedJob = async ({ jobId, companyId, userId }) => {
  return ExtractionJob.findOne({
    jobId,
    companyId,
    userId,
  }).lean();
};

export const getTenantJobMetrics = async ({ companyId, userId }) => {
  const [queued, active, completed, failed, avgDuration] = await Promise.all([
    ExtractionJob.countDocuments({ companyId, userId, status: 'queued' }),
    ExtractionJob.countDocuments({ companyId, userId, status: 'active' }),
    ExtractionJob.countDocuments({ companyId, userId, status: 'completed' }),
    ExtractionJob.countDocuments({ companyId, userId, status: 'failed' }),
    ExtractionJob.aggregate([
      {
        $match: {
          companyId,
          userId,
          status: 'completed',
          startedAt: { $ne: null },
          completedAt: { $ne: null },
        },
      },
      {
        $project: {
          durationMs: { $subtract: ['$completedAt', '$startedAt'] },
        },
      },
      {
        $group: {
          _id: null,
          avgMs: { $avg: '$durationMs' },
        },
      },
    ]),
  ]);

  return {
    queued,
    active,
    completed,
    failed,
    avgDurationMs: Math.round(Number(avgDuration?.[0]?.avgMs || 0)),
  };
};

export const getQueueMetrics = async () => {
  // Redis disabled / queue stub mode
  if (
    !extractionQueue ||
    typeof extractionQueue.getJobCounts !== 'function'
  ) {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };
  }

  const counts = await extractionQueue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed'
  );

  return {
    waiting: Number(counts.waiting || 0),
    active: Number(counts.active || 0),
    completed: Number(counts.completed || 0),
    failed: Number(counts.failed || 0),
    delayed: Number(counts.delayed || 0),
  };
};
