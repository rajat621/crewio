import mongoose from 'mongoose';
import { runtimeConfig } from '../config/env.js';
import { obsLog } from './requestContext.middleware.js';
import { getRequestContext } from './requestStore.js';
import { recordDbQuery } from '../utils/metrics.js';

// Field names verified against this codebase's actual schemas
// (models/User.js, models/Employee.js) plus standard auth-adjacent names -
// never log these regardless of where they appear in a filter/pipeline.
const SENSITIVE_KEY_PATTERN = /password|passwordhash|otp|token|secret|authorization|cookie|jwt|fcmtoken/i;

const MAX_STRING_LENGTH = 200;
const MAX_ARRAY_LENGTH = 20;
const MAX_DEPTH = 4;

// Recursively redacts sensitive fields and truncates oversized values so a
// slow-query log line is always small and always safe to log, even if the
// underlying query happens to touch a huge array or a base64 blob. Applied
// only to the handful of fields actually logged (filter/pipeline/
// projection/sort) - never the full query result.
const sanitize = (value, depth = 0) => {
  if (value == null) return value;
  if (depth >= MAX_DEPTH) return '[max depth]';

  if (Buffer.isBuffer(value)) return '[BINARY]';

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]` : value;
  }

  if (Array.isArray(value)) {
    const truncated = value.slice(0, MAX_ARRAY_LENGTH).map((v) => sanitize(v, depth + 1));
    if (value.length > MAX_ARRAY_LENGTH) truncated.push(`...(${value.length - MAX_ARRAY_LENGTH} more)`);
    return truncated;
  }

  if (typeof value === 'object') {
    // Mongo ObjectId / Date / etc. - stringify rather than recurse into
    // their internal structure.
    if (typeof value.toHexString === 'function' || value instanceof Date) return String(value);

    const out = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : sanitize(v, depth + 1);
    }
    return out;
  }

  return value;
};

let patched = false;

// Patches the shared Query/Aggregate prototypes once - this is the "one
// central implementation" the design calls for. Every query type
// (find/findOne/update*/delete*/countDocuments/distinct/bulkWrite) runs
// through Query.prototype.exec; aggregate() runs through
// Aggregate.prototype.exec. No controller needs to change.
export const installQueryProfiler = () => {
  if (patched) return;
  patched = true;

  const originalQueryExec = mongoose.Query.prototype.exec;
  mongoose.Query.prototype.exec = function patchedExec(...args) {
    const startedAt = process.hrtime.bigint();
    const result = originalQueryExec.apply(this, args);

    // exec() can return a Promise or (rarely, with a callback arg) not -
    // only attach timing to the Promise path, which is what this codebase
    // uses everywhere (async/await).
    if (result && typeof result.then === 'function') {
      return result.then(
        (value) => {
          logIfSlow({
            durationMs: msSince(startedAt),
            collection: this.model?.collection?.collectionName,
            operation: this.op,
            filter: this.getFilter?.(),
            projection: this.projection?.(),
            sort: this.options?.sort,
            limit: this.options?.limit,
            skip: this.options?.skip,
          });
          return value;
        },
        (err) => {
          logIfSlow({
            durationMs: msSince(startedAt),
            collection: this.model?.collection?.collectionName,
            operation: this.op,
            filter: this.getFilter?.(),
            error: true,
          });
          throw err;
        }
      );
    }
    return result;
  };

  const originalAggregateExec = mongoose.Aggregate.prototype.exec;
  mongoose.Aggregate.prototype.exec = function patchedAggregateExec(...args) {
    const startedAt = process.hrtime.bigint();
    const result = originalAggregateExec.apply(this, args);

    if (result && typeof result.then === 'function') {
      return result.then(
        (value) => {
          logIfSlow({
            durationMs: msSince(startedAt),
            collection: this._model?.collection?.collectionName,
            operation: 'aggregate',
            pipeline: this._pipeline,
          });
          return value;
        },
        (err) => {
          logIfSlow({
            durationMs: msSince(startedAt),
            collection: this._model?.collection?.collectionName,
            operation: 'aggregate',
            error: true,
          });
          throw err;
        }
      );
    }
    return result;
  };
};

const msSince = (startedAtNs) => Number(process.hrtime.bigint() - startedAtNs) / 1e6;

const logIfSlow = ({ durationMs, collection, operation, filter, projection, sort, limit, skip, pipeline, error }) => {
  const threshold = runtimeConfig.mongoProfiler.slowQueryMs;
  const isSlow = durationMs >= threshold;

  // Always feed the counters (Step 7's "database query count" needs every
  // query, not just slow ones) - only the log line itself is gated by
  // threshold + feature flag.
  recordDbQuery({ isSlow });

  if (!runtimeConfig.featureFlags.enableQueryProfiler) return;
  if (!isSlow) return;

  const ctx = getRequestContext();
  const includeParams = runtimeConfig.featureFlags.logQueryParameters;

  obsLog('slow_query', {
    collection: collection || 'unknown',
    operation,
    durationMs: Math.round(durationMs),
    thresholdMs: threshold,
    ...(includeParams && filter ? { filter: sanitize(filter) } : {}),
    ...(includeParams && projection ? { projection: sanitize(projection) } : {}),
    ...(includeParams && sort ? { sort: sanitize(sort) } : {}),
    ...(includeParams && pipeline ? { pipeline: sanitize(pipeline) } : {}),
    ...(limit != null ? { limit } : {}),
    ...(skip != null ? { skip } : {}),
    ...(error ? { error: true } : {}),
    requestId: ctx?.requestId || null,
    traceId: ctx?.traceId || null,
    userId: ctx?.userId || null,
    ownerId: ctx?.ownerId || null,
    route: ctx?.path || null,
    method: ctx?.method || null,
  });
};
