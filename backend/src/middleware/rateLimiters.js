import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisConnection from '../queue/redis.connection.js';

// express-rate-limit's default MemoryStore counts requests per-process.
// With more than one Railway replica behind a load balancer, each replica
// enforces the limit independently - an attacker/abusive client effectively
// gets `limit x replica count` requests before being blocked, and
// legitimate users can get inconsistently limited depending on which
// replica they land on. A Redis-backed store makes the count shared and
// replica-consistent. Falls back to the default in-memory store only when
// Redis is explicitly disabled (DISABLE_REDIS=true) - degraded-but-working
// per-replica limiting beats no rate limiting at all in that deliberate
// configuration.
// Each limiter needs its OWN store instance with a distinct key prefix -
// rate-limit-redis defaults every instance to the same "rl:" prefix, which
// would silently merge e.g. apiLimiter's and authLimiter's counts under
// the same Redis keys if left unset.
const makeRedisStore = (prefix) =>
  redisConnection
    ? new RedisStore({
        sendCommand: (...args) => redisConnection.call(...args),
        prefix,
      })
    : undefined;

if (!redisConnection) {
  console.warn('[rateLimiters] Redis disabled - rate limits are per-replica in-memory, not shared across horizontally-scaled instances.');
}

// Applied globally to every request. Generous enough not to bother real
// users, tight enough to blunt scraping/DoS attempts against a single IP.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore('rl:api:'),
  message: { message: 'Too many requests. Please try again in a few minutes.' },
});

// Applied to login/OTP/refresh endpoints specifically. This is the one that
// actually matters for brute force / credential stuffing - keep it strict.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only counts failed attempts against the limit
  store: makeRedisStore('rl:auth:'),
  message: { message: 'Too many attempts. Please wait 15 minutes before trying again.' },
});

// A looser limiter for things like resend-otp, which a legitimate user might
// hit a few times in quick succession but which is still abuse-prone.
export const moderateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore('rl:moderate:'),
  message: { message: 'Too many requests. Please try again shortly.' },
});

// For expensive operations - AI extraction (calls an external provider,
// consumes OCR/processing resources) and file upload (storage + bandwidth).
// The global apiLimiter (300/15min) still applies underneath this, but
// isn't proportionate on its own to the actual per-request cost here.
export const expensiveOperationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore('rl:expensive:'),
  message: { message: 'Too many requests for this operation. Please try again shortly.' },
});

export default { apiLimiter, authLimiter, moderateLimiter, expensiveOperationLimiter };
