import mongoose from 'mongoose';
import os from 'os';
import redisConnection from '../queue/redis.connection.js';
import { extractionQueue } from '../queue/extraction.queue.js';

const MONGO_READY_STATES = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

// Cheap, synchronous - no sampling interval, just cumulative CPU time since
// process start. A real percentage would need two samples over an
// interval, which isn't appropriate for a health check that must stay
// lightweight and return immediately.
export const getMongoStatus = () => {
  const state = mongoose.connection.readyState;
  return { status: MONGO_READY_STATES[state] || 'unknown', readyState: state };
};

// Redis: a real (but short-timeout) PING, not just the last-known
// `.status` string - Redis is low-latency infra, so a real round-trip is
// still cheap enough to be "lightweight." Explicitly reports `disabled`
// (not `failed`) when Redis is turned off via DISABLE_REDIS, per design.
export const getRedisStatus = async () => {
  if (!redisConnection) return { status: 'disabled' };

  try {
    const pingPromise = redisConnection.ping();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500));
    await Promise.race([pingPromise, timeoutPromise]);
    return { status: 'ready' };
  } catch (error) {
    return { status: 'failed', message: error.message };
  }
};

// Queue depth via BullMQ's own getJobCounts - already a fast local Redis
// call (the queue stub returns zeros instantly when Redis is disabled, so
// this never needs its own disabled/enabled branch).
export const getQueueStatus = async () => {
  try {
    const counts = await extractionQueue.getJobCounts();
    return { status: 'ok', counts };
  } catch (error) {
    return { status: 'failed', message: error.message };
  }
};

// Deliberately NOT a live network call to the external AI service - see
// the design note in this session's summary: an external HTTP call isn't
// guaranteed fast, and a hanging dependency shouldn't be able to make
// /health itself hang. Reports configuration presence only.
export const getAiServiceStatus = () => ({
  status: process.env.AI_SERVICE_URL ? 'configured' : 'not_configured',
});

export const getSystemInfo = () => {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  return {
    nodeVersion: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
    },
    cpu: {
      userMs: Math.round(cpu.user / 1000),
      systemMs: Math.round(cpu.system / 1000),
    },
    loadAverage: os.loadavg(),
  };
};
