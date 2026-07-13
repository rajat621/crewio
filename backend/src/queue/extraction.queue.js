//backend/src/queue/extraction.queue.js
import { Queue } from 'bullmq';
import redisConnection from './redis.connection.js';
import { runtimeConfig } from '../config/env.js';

export const EXTRACTION_QUEUE_NAME = 'ai-extraction-jobs';

let extractionQueue = null;

// If Redis is disabled or connection not provided, use a benign stub
if (!redisConnection || process.env.DISABLE_REDIS === 'true') {
  console.warn('Redis disabled or unavailable — using extraction queue stub');
extractionQueue = {
  add: async (name, data, opts) => {
    console.warn('Queue stub: skip enqueue', name);
    return null;
  },

  close: async () => {},

  getJobCounts: async () => ({
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
  }),
};
} else {
  extractionQueue = new Queue(EXTRACTION_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: runtimeConfig?.retries?.queueAttempts,
      backoff: {
        type: runtimeConfig?.queue?.backoffType,
        delay: runtimeConfig?.queue?.backoffDelayMs,
      },
      removeOnComplete: runtimeConfig?.queue?.removeOnComplete,
      removeOnFail: runtimeConfig?.queue?.removeOnFail,
    },
  });
}

export { extractionQueue };
export default extractionQueue;


