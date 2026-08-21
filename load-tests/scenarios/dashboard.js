// Phase 6: dashboard-specific stress. dashboard.controller.js's
// getFinanceSummary is the heaviest read endpoint audited (9 queries in one
// Promise.all, 30s cache TTL) - this scenario isolates it to measure
// whether the cache actually absorbs concurrent load or whether every VU
// still causes a Mongo round-trip.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL, ownerHeaders, OWNER_JWT_TOKEN, assertConfigured, dashboardRangeQuery } from '../config.js';

export const options = {
  vus: Number(__ENV.VUS || 50),
  duration: __ENV.DURATION || '2m',
  thresholds: {
    http_req_duration: ['p(95)<1000'],
  },
};

const financeSummaryLatency = new Trend('finance_summary_latency', true);
const dashboardSummaryLatency = new Trend('dashboard_summary_latency', true);

export function setup() {
  assertConfigured([{ name: 'TEST_OWNER_JWT_TOKEN', value: OWNER_JWT_TOKEN }]);
}

export default function () {
  const headers = ownerHeaders();

  const summary = http.get(`${BASE_URL}/api/dashboard/summary?${dashboardRangeQuery()}`, { headers, tags: { name: 'dashboard_summary' } });
  dashboardSummaryLatency.add(summary.timings.duration);
  check(summary, { 'dashboard/summary: 200': (r) => r.status === 200 });

  const finance = http.get(`${BASE_URL}/api/dashboard/finance-summary`, { headers, tags: { name: 'finance_summary' } });
  financeSummaryLatency.add(finance.timings.duration);
  check(finance, { 'dashboard/finance-summary: 200': (r) => r.status === 200 });

  const workforce = http.get(`${BASE_URL}/api/companies/workforce-summary`, { headers, tags: { name: 'workforce_summary' } });
  check(workforce, { 'workforce-summary: 200': (r) => r.status === 200 });

  // All 3 of these are cached at 30s TTL (see cache.util.js) - hitting
  // them back-to-back within the same iteration, across many concurrent
  // VUs, is exactly the access pattern that proves (or disproves) whether
  // the cache is actually absorbing load vs every VU independently
  // missing and hitting Mongo.
  sleep(0.5);
}
