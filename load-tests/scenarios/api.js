// Phase 5: normal owner-side API traffic - weighted mix of the actual
// read/write endpoints real dashboard usage hits, based on the real routes
// in backend/src/routes/*.js (not invented). VU count is set via env
// VUS/DURATION so the same file drives every progressive-load stage
// (10/25/50/.../1000) without duplicating scenario logic.
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { BASE_URL, ownerHeaders, OWNER_JWT_TOKEN, assertConfigured, dashboardRangeQuery } from '../config.js';

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '3m',
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<800', 'p(99)<2000'],
  },
};

const rateLimited = new Counter('rate_limited_429');
const serverErrors = new Counter('server_errors_5xx');
const readLatency = new Trend('read_endpoint_latency', true);

export function setup() {
  assertConfigured([{ name: 'TEST_OWNER_JWT_TOKEN', value: OWNER_JWT_TOKEN }]);
}

// Weighted so GETs dominate (real dashboard usage is read-heavy) and
// writes are the rarer, deliberate actions they actually are.
const WEIGHTED_READS = [
  { path: `/api/dashboard/summary?${dashboardRangeQuery()}`, name: 'dashboard_summary' },
  { path: '/api/dashboard/finance-summary', name: 'finance_summary' },
  { path: '/api/employees?page=1&limit=50', name: 'employees_list' },
  { path: '/api/employees/stats', name: 'employees_stats' },
  { path: '/api/companies?page=1&limit=100', name: 'companies_list' },
  { path: '/api/companies/clients?page=1&limit=100', name: 'client_companies_list' },
  { path: '/api/attendance/summary', name: 'attendance_summary' },
  { path: '/api/invoices?page=1&limit=50', name: 'invoices_list' },
  { path: '/api/salary-slips?page=1&limit=20', name: 'salary_slips_list' },
  { path: '/api/notifications/owner?page=1&limit=20', name: 'notifications_list' },
  // Matches expensesApi.getExpenses(undefined, page, limit, search) - the
  // real frontend always paginates this call. Hitting it WITHOUT page/limit
  // (as this scenario originally did) exercises expense.controller.js's
  // unbounded "dump every employee's full expense history" branch instead -
  // a real, separate, non-representative worst case, not this scenario's
  // intended read-heavy-dashboard traffic.
  { path: '/api/expenses?page=1&limit=20', name: 'expenses_list' },
  { path: '/api/company-expenses', name: 'company_expenses_list' },
];

export default function () {
  const headers = ownerHeaders();

  group('reads', () => {
    // Each iteration hits 3-4 randomly-weighted read endpoints, mirroring
    // a dashboard session that loads several widgets per page view rather
    // than hammering one single endpoint (which is explicitly disallowed
    // by the brief).
    for (let i = 0; i < 3; i++) {
      const endpoint = WEIGHTED_READS[Math.floor(Math.random() * WEIGHTED_READS.length)];
      const res = http.get(`${BASE_URL}${endpoint.path}`, { headers, tags: { name: endpoint.name } });
      readLatency.add(res.timings.duration);
      if (res.status === 429) rateLimited.add(1);
      if (res.status >= 500) serverErrors.add(1);
      check(res, { [`${endpoint.name}: not 5xx`]: (r) => r.status < 500 });
    }
  });

  sleep(Math.random() * 2 + 1); // 1-3s think time, like a real user reading the screen
}
