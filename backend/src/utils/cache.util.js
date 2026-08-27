// Lightweight read-through cache for hot, read-heavy Mongo queries
// (employee list/detail, expense ledgers, salary-slip list/detail).
//
// Backed by the SAME Redis connection the extraction queue already uses
// (src/queue/redis.connection.js) when it's available, so this needs no new
// infra. If Redis is disabled (DISABLE_REDIS=true) or briefly unreachable,
// every call here transparently falls back to a per-process in-memory Map
// with the same TTL/invalidation semantics - the app never breaks because
// the cache is down, it just gets slower.
//
// Usage:
//   const data = await cacheGetOrSet(key, ttlSeconds, async () => { ...fetch from Mongo... });
//   await cacheInvalidate(prefix);           // on any write that could affect `key`
//
// Keys are namespaced by prefix (e.g. `employees:list:<ownerId>`,
// `employees:one:<id>`) so a write only has to invalidate the prefixes it
// could actually affect, not the whole cache.

import { redisConnection } from '../queue/redis.connection.js';

const DEFAULT_TTL_SECONDS = 60;

// A hung Redis command (e.g. mid-reconnect, since the shared connection
// uses maxRetriesPerRequest: null for BullMQ's benefit) must never stall a
// request indefinitely - race every Redis call against this and fall back
// to Mongo as if it were a cache miss.
const REDIS_OP_TIMEOUT_MS = 800;

// Exported so any Redis-backed call in a hot request path (not just this
// file's own get/set/scan) can be bounded the same way - e.g. BullMQ
// Queue.add() calls made directly from HTTP handlers, which otherwise ride
// the shared connection's maxRetriesPerRequest:null and can queue
// indefinitely during a Redis outage instead of failing fast.
export const withTimeout = (promise, ms) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`redis op timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });

// --- single-flight (cache-stampede) protection --------------------------
// Concurrent callers for the same key while a fetchFn() is already running
// (cold cache, or right after invalidation) share the same in-flight
// promise instead of each independently hitting Mongo and each writing the
// same value back to Redis. Bounded by construction: an entry only ever
// lives between the fetchFn() call starting and it settling (success or
// failure), then it's removed in a `finally` - no manual TTL/cleanup timer
// needed, so there's nothing to leak.
const inFlight = new Map(); // key -> Promise

// --- in-memory fallback -----------------------------------------------
const memoryStore = new Map(); // key -> { value, expiresAt }

const memoryGet = (key) => {
  const entry = memoryStore.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return undefined;
  }
  return entry.value;
};

const memorySet = (key, value, ttlSeconds) => {
  memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  // Cheap bound so a long-running process (this cache is never meant to be
  // huge - it's short-TTL request data, not a general-purpose store) can't
  // grow unbounded if invalidation is ever missed somewhere.
  if (memoryStore.size > 5000) {
    const oldestKey = memoryStore.keys().next().value;
    if (oldestKey !== undefined) memoryStore.delete(oldestKey);
  }
};

const memoryDeleteByPrefix = (prefix) => {
  for (const key of memoryStore.keys()) {
    if (key.startsWith(prefix)) memoryStore.delete(key);
  }
};

// --- redis-or-memory-backed API ----------------------------------------

const isRedisUp = () => Boolean(redisConnection) && redisConnection.status === 'ready';

/**
 * Returns the cached value for `key` if present, otherwise calls `fetchFn`,
 * caches its result for `ttlSeconds`, and returns it. `fetchFn` failures are
 * never cached and simply propagate.
 */
export const cacheGetOrSet = async (key, ttlSeconds = DEFAULT_TTL_SECONDS, fetchFn) => {
  try {
    if (isRedisUp()) {
      const cached = await withTimeout(redisConnection.get(key), REDIS_OP_TIMEOUT_MS);
      if (cached !== null) return JSON.parse(cached);
    } else {
      const cached = memoryGet(key);
      if (cached !== undefined) return cached;
    }
  } catch (err) {
    // A cache read failure/timeout should never take the request down with
    // it - fall through and hit the DB as if there were no cache.
    console.error('[cache] read failed, falling back to DB', key, err.message);
  }

  // Cache miss: join an in-flight fetch for this key if one is already
  // running (cache-stampede protection) instead of starting another.
  let pending = inFlight.get(key);
  if (!pending) {
    pending = fetchFn();
    inFlight.set(key, pending);

    // Cache write happens in the background, NOT on the response path.
    // Measured: each Redis round-trip to Upstash costs ~82-90ms here, and
    // this SET was previously `await`ed before the request could return -
    // adding a full extra round-trip to every cache-miss request for a
    // write the caller never needed to wait on (they already have `fresh`
    // once fetchFn() resolves; the write is purely for the NEXT request).
    // Errors are swallowed - worst case is one extra Mongo hit next time.
    const cacheWrite = pending.then((fresh) => {
      if (isRedisUp()) {
        return withTimeout(
          redisConnection.set(key, JSON.stringify(fresh), 'EX', ttlSeconds),
          REDIS_OP_TIMEOUT_MS
        ).catch((err) => console.error('[cache] write failed (result still returned)', key, err.message));
      }
      memorySet(key, fresh, ttlSeconds);
    });

    // Bug found under sustained concurrent load (2026-08-27): this used to
    // clear the in-flight guard as soon as fetchFn() resolved, *before* the
    // background write above had actually landed in Redis. Any request
    // arriving in that gap saw neither an in-flight promise to join nor a
    // populated cache key, so it silently started its own brand-new
    // fetchFn()+write cycle. Under a steady stream of concurrent requests
    // (not just a one-off burst) this repeats continuously, so the cache
    // for that key never actually stays warm - every request pays the full
    // fetchFn() cost. Cheap fetchFns (a few ms) hid this completely; an
    // expensive one (invoices' find+populate+count, ~150-330ms+ each) made
    // it visible as p95=3s+ at 100 concurrent VUs with 0% errors. Holding
    // the guard open until the write also settles closes the gap: a request
    // arriving mid-write still joins `pending`, which already has the
    // resolved value, instead of re-fetching from Mongo.
    Promise.allSettled([pending, cacheWrite]).finally(() => inFlight.delete(key));
  }

  return pending;
};

/**
 * Drops every cached key starting with `prefix`. Call this from any write
 * path (create/update/delete) that could make a previously-cached read
 * stale - e.g. after updating an employee, invalidate `employees:list:<ownerId>`
 * and `employees:one:<employeeId>`.
 */
export const cacheInvalidate = async (prefix) => {
  try {
    if (isRedisUp()) {
      // SCAN instead of KEYS - KEYS blocks the whole Redis instance on large
      // keyspaces, SCAN doesn't. Whole loop is timeout-bounded so a hung
      // connection can't stall the write path that triggered this.
      await withTimeout((async () => {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redisConnection.scan(
            cursor,
            'MATCH',
            `${prefix}*`,
            'COUNT',
            200
          );
          cursor = nextCursor;
          if (keys.length) await redisConnection.del(...keys);
        } while (cursor !== '0');
      })(), REDIS_OP_TIMEOUT_MS * 3);
    } else {
      memoryDeleteByPrefix(prefix);
    }
  } catch (err) {
    // Worst case here is a stale read for up to the TTL - never worth
    // failing the write itself over.
    console.error('[cache] invalidate failed', prefix, err.message);
  }
};

export default { cacheGetOrSet, cacheInvalidate };
