// import IORedis from 'ioredis';
// import { runtimeConfig } from '../config/env.js';

// let redisConnection = null;

// if (process.env.DISABLE_REDIS === 'true') {
//   console.warn('Redis disabled via DISABLE_REDIS=true — redisConnection will be null');
//   redisConnection = null;
// } else {
//   const redisHost = runtimeConfig?.queue?.redisHost || process.env.REDIS_HOST || '127.0.0.1';
//   const redisPort = Number(runtimeConfig?.queue?.redisPort || process.env.REDIS_PORT || 6379);
//   const redisPassword = runtimeConfig?.queue?.redisPassword || process.env.REDIS_PASSWORD || undefined;
//   const redisDb = Number(runtimeConfig?.queue?.redisDb || process.env.REDIS_DB || 0);

//   redisConnection = new IORedis({
//     host: redisHost,
//     port: redisPort,
//     password: redisPassword,
//     db: redisDb,
//     maxRetriesPerRequest: null,
//     enableReadyCheck: false,
//   });
// }

// export { redisConnection };
// export default redisConnection;


import IORedis from 'ioredis';
import { runtimeConfig } from '../config/env.js';
import { obsLog } from '../middleware/requestContext.middleware.js';

let redisConnection = null;

if (process.env.DISABLE_REDIS === 'true') {
  console.warn('Redis disabled via DISABLE_REDIS=true — redisConnection will be null');
} else {
  const redisUrl = runtimeConfig?.queue?.redisUrl || process.env.REDIS_URL;

  if (redisUrl) {
    // Upstash / Redis Cloud
    redisConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  } else {
    // Local Redis / Docker Redis
    const redisHost =
      runtimeConfig?.queue?.redisHost ||
      process.env.REDIS_HOST ||
      '127.0.0.1';

    const redisPort = Number(
      runtimeConfig?.queue?.redisPort ||
      process.env.REDIS_PORT ||
      6379
    );

    const redisPassword =
      runtimeConfig?.queue?.redisPassword ||
      process.env.REDIS_PASSWORD ||
      undefined;

    const redisDb = Number(
      runtimeConfig?.queue?.redisDb ||
      process.env.REDIS_DB ||
      0
    );

    redisConnection = new IORedis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      db: redisDb,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
}

// Without this listener, an unhandled 'error' event on this connection
// (a Redis network blip, restart, or auth failure) would crash the
// entire Node process per EventEmitter's default behavior - not just
// degrade the cache/queue features that actually depend on Redis. This
// only logs; ioredis retries/reconnects on its own by default.
if (redisConnection) {
  redisConnection.on('error', (err) => {
    obsLog('redis_connection_error', { message: err.message });
  });
  redisConnection.on('reconnecting', () => {
    obsLog('redis_connection_reconnecting', {});
  });
  redisConnection.on('ready', () => {
    obsLog('redis_connection_ready', {});
  });
}

export { redisConnection };
export default redisConnection;