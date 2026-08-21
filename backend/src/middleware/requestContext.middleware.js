import { randomUUID } from 'crypto';
import { runtimeConfig } from '../config/env.js';
import { requestStore } from './requestStore.js';
import { recordRequestStart, recordRequestEnd } from '../utils/metrics.js';

// Requests at or above this duration count toward the "slow requests"
// metric (Step 7). Not exposed as its own env var since the task didn't
// call for one - MONGO_SLOW_QUERY_MS is specifically about DB queries, a
// separate concern from overall request latency.
const SLOW_REQUEST_MS = 1000;

// Generalizes the request-tracing pattern that already existed locally in
// ai.controller.js (ensureTraceContext/obsLog) to every route, instead of
// AI routes only. Kept intentionally identical in shape/behavior to that
// existing pattern - same header names, same requestId/traceId semantics,
// same JSON log shape - so nothing downstream that already expects that
// shape (e.g. anything reading x-request-id) needs to change.

// Attaches req.traceContext = { requestId, traceId } to every request and
// echoes both back as response headers, so a request can be correlated
// end-to-end (client log <-> server log <-> any downstream service call).
// Honors an inbound x-request-id/x-trace-id if the caller already set one
// (e.g. a proxy or another internal service), otherwise generates a new one.
// D19.12 finding (real, currently exploitable when observability logging
// is enabled): `authenticateDualOrQueryToken` (dualAuth.middleware.js)
// deliberately accepts a JWT via `?token=` for the narrow set of routes
// that must be opened directly by a browser/PDF viewer (salary-slip
// download, chat voice-note playback) - its own comment already flags
// "server logs" as a risk of that pattern, but nothing downstream actually
// redacted it before this fix. `req.originalUrl` includes the full query
// string, and was logged verbatim below - so with
// ENABLE_OBSERVABILITY=true, every request to one of those routes wrote a
// live, valid JWT (session lifetime up to 30 days for a refresh token) in
// cleartext into structured application logs, readable by anyone with log
// access (ops tooling, log aggregation/shipping services, cloud log
// storage) - a real credential-exposure path, not a theoretical one.
// Redacts any `token`/`access_token` query parameter's value before the
// path is used for logging or stored in the trace-context request store
// (so this covers the structured request log below AND anything else that
// might read `req.traceContext`/the request store's `path` field in the
// future). Does not change what the server actually accepts as auth -
// only what gets written to logs.
const redactSensitiveQueryParams = (originalUrl) => {
  const url = String(originalUrl || '');
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return url;
  try {
    const params = new URLSearchParams(url.slice(qIndex + 1));
    let redacted = false;
    for (const key of ['token', 'access_token', 'accessToken']) {
      if (params.has(key)) {
        params.set(key, 'REDACTED');
        redacted = true;
      }
    }
    if (!redacted) return url;
    return `${url.slice(0, qIndex)}?${params.toString()}`;
  } catch {
    return url;
  }
};

export const attachRequestContext = (req, res, next) => {
  const requestId = String(req.headers['x-request-id'] || randomUUID());
  const traceId = String(req.headers['x-trace-id'] || randomUUID());
  req.traceContext = { requestId, traceId };
  res.setHeader('x-request-id', requestId);
  res.setHeader('x-trace-id', traceId);

  // userId/ownerId start null and are filled in by auth.middleware.js once
  // authentication resolves (mutating this same object, not replacing it -
  // AsyncLocalStorage snapshots the reference at .run() time, so later
  // mutations of the object's own properties are still visible to any code
  // reading the store during this request).
  const store = { requestId, traceId, method: req.method, path: redactSensitiveQueryParams(req.originalUrl), userId: null, ownerId: null };
  requestStore.run(store, next);
};

// Structured (JSON) log line per request: method, path, status, duration,
// and the requestId set above - the minimum needed to answer "did this
// specific request succeed, and how long did it take" from logs alone.
// Gated by the same ENABLE_OBSERVABILITY flag ai.controller.js's obsLog
// already uses, so this can be disabled the same way if it's ever noisy.
export const logRequests = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  recordRequestStart();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const isSlow = durationMs >= SLOW_REQUEST_MS;
    const isError = res.statusCode >= 500;
    recordRequestEnd({ durationMs, isSlow, isError });

    if (!runtimeConfig.featureFlags.enableObservability) return;

    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        service: 'backend-api',
        event: 'request_completed',
        requestId: req.traceContext?.requestId || null,
        method: req.method,
        path: redactSensitiveQueryParams(req.originalUrl),
        status: res.statusCode,
        durationMs: Math.round(durationMs),
      })
    );
  });

  next();
};

// Shared structured-event logger for anything outside the AI pipeline that
// wants the same JSON shape ai.controller.js's local obsLog already uses.
// ai.controller.js keeps its own copy for now (not touched in this change)
// - this is available for other controllers/services to adopt incrementally.
export const obsLog = (event, data = {}) => {
  if (!runtimeConfig.featureFlags.enableObservability) return;
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'backend-api', event, ...data }));
};
