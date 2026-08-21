// Phase 4 smoke test: 10 VUs, short duration, exercises the real
// authenticated read path end-to-end. Run this before anything larger -
// if this doesn't pass cleanly, progressive load testing is pointless.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, ownerHeaders, OWNER_JWT_TOKEN, dashboardRangeQuery } from '../config.js';

export const options = {
  vus: 10,
  duration: '2m',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1500'],
  },
};

export default function () {
  const health = http.get(`${BASE_URL}/health`, { tags: { name: 'health' } });
  check(health, { 'health: 200': (r) => r.status === 200 });

  if (OWNER_JWT_TOKEN) {
    const dashboard = http.get(`${BASE_URL}/api/dashboard/summary?${dashboardRangeQuery()}`, {
      headers: ownerHeaders(),
      tags: { name: 'dashboard_summary' },
    });
    check(dashboard, { 'dashboard: 200': (r) => r.status === 200 });

    const employees = http.get(`${BASE_URL}/api/employees?page=1&limit=20`, {
      headers: ownerHeaders(),
      tags: { name: 'employees_list' },
    });
    check(employees, { 'employees: 200': (r) => r.status === 200 });
  }

  sleep(1);
}
