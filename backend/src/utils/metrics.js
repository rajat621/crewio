// Lightweight in-memory runtime metrics. No Prometheus/Grafana/external
// software - plain counters, reset only on process restart. Node is
// single-threaded for this kind of increment, so no locking is needed.
const metrics = {
  totalRequests: 0,
  activeRequests: 0,
  slowRequests: 0,
  errorCount: 0,
  totalRequestDurationMs: 0,
  dbQueryCount: 0,
  slowDbQueryCount: 0,
};

export const recordRequestStart = () => {
  metrics.totalRequests += 1;
  metrics.activeRequests += 1;
};

export const recordRequestEnd = ({ durationMs, isSlow, isError }) => {
  metrics.activeRequests = Math.max(0, metrics.activeRequests - 1);
  metrics.totalRequestDurationMs += durationMs;
  if (isSlow) metrics.slowRequests += 1;
  if (isError) metrics.errorCount += 1;
};

export const recordDbQuery = ({ isSlow }) => {
  metrics.dbQueryCount += 1;
  if (isSlow) metrics.slowDbQueryCount += 1;
};

// Snapshot for /health - computed values (like averages) are derived here,
// not stored, so there's nothing to keep in sync.
export const getMetricsSnapshot = () => ({
  totalRequests: metrics.totalRequests,
  activeRequests: metrics.activeRequests,
  slowRequests: metrics.slowRequests,
  errorCount: metrics.errorCount,
  averageRequestDurationMs: metrics.totalRequests > 0
    ? Math.round((metrics.totalRequestDurationMs / metrics.totalRequests) * 100) / 100
    : 0,
  dbQueryCount: metrics.dbQueryCount,
  slowDbQueryCount: metrics.slowDbQueryCount,
});
