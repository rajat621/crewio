import IORedis from 'ioredis';
import { runtimeConfig } from '../config/env.js';

let redisConnection = null;

if (process.env.DISABLE_REDIS === 'true') {
  console.warn('Redis disabled via DISABLE_REDIS=true — redisConnection will be null');
  redisConnection = null;
} else {
  const redisHost = runtimeConfig?.queue?.redisHost || process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = Number(runtimeConfig?.queue?.redisPort || process.env.REDIS_PORT || 6379);
  const redisPassword = runtimeConfig?.queue?.redisPassword || process.env.REDIS_PASSWORD || undefined;
  const redisDb = Number(runtimeConfig?.queue?.redisDb || process.env.REDIS_DB || 0);

  redisConnection = new IORedis({
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    db: redisDb,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export { redisConnection };
export default redisConnection;
