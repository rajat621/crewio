// Phase 5H: mixed realistic workload. Combines owner-side reads (api.js's
// weighted endpoint list) with employee-side attendance actions in a single
// run, using k6 scenarios to run both concurrently with independent VU
// ramps - this is the closest single scenario to "real traffic," as
// opposed to the single-workload-type scenarios (api.js, attendance.js,
// dashboard.js) which isolate one traffic type at a time for diagnosis.
//
// Does NOT include ai.js or invoices.js in the mix - those have real
// external cost / are correctness tests, not throughput tests, and are
// run separately and deliberately (see README.md).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, ownerHeaders, OWNER_JWT_TOKEN, EMPLOYEE_IDS, EMPLOYEE_PASSWORD, pickEmployeeId, assertConfigured, dashboardRangeQuery } from '../config.js';
import { loginEmployee, employeeHeaders } from '../auth.js';

const OWNER_VUS = Number(__ENV.OWNER_VUS || 70);
const EMPLOYEE_VUS = Number(__ENV.EMPLOYEE_VUS || 30);
const DURATION = __ENV.DURATION || '3m';

export const options = {
  scenarios: {
    owner_dashboard_traffic: {
      executor: 'constant-vus',
      vus: OWNER_VUS,
      duration: DURATION,
      exec: 'ownerTraffic',
    },
    employee_mobile_traffic: {
      executor: 'constant-vus',
      vus: EMPLOYEE_VUS,
      duration: DURATION,
      exec: 'employeeTraffic',
      startTime: '5s', // small stagger so the whole mix doesn't cold-start in the same instant
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.03'],
    http_req_duration: ['p(95)<1200'],
  },
};

export function setup() {
  assertConfigured([
    { name: 'TEST_OWNER_JWT_TOKEN', value: OWNER_JWT_TOKEN },
    { name: 'TEST_EMPLOYEE_IDS', value: EMPLOYEE_IDS.length > 0 },
    { name: 'TEST_EMPLOYEE_PASSWORD', value: EMPLOYEE_PASSWORD },
  ]);
}

const READS = [
  { path: `/api/dashboard/summary?${dashboardRangeQuery()}`, name: 'dashboard_summary' },
  { path: '/api/employees?page=1&limit=50', name: 'employees_list' },
  { path: '/api/companies?page=1&limit=100', name: 'companies_list' },
  { path: '/api/attendance/summary', name: 'attendance_summary' },
  { path: '/api/invoices?page=1&limit=50', name: 'invoices_list' },
  { path: '/api/salary-slips?page=1&limit=20', name: 'salary_slips_list' },
  { path: '/api/notifications/owner?page=1&limit=20', name: 'notifications_list' },
];

export function ownerTraffic() {
  const headers = ownerHeaders();
  const endpoint = READS[Math.floor(Math.random() * READS.length)];
  const res = http.get(`${BASE_URL}${endpoint.path}`, { headers, tags: { name: endpoint.name } });
  check(res, { [`${endpoint.name}: not 5xx`]: (r) => r.status < 500 });
  sleep(Math.random() * 2 + 1);
}

export function employeeTraffic() {
  const employeeId = pickEmployeeId(__VU);
  const token = loginEmployee(employeeId, EMPLOYEE_PASSWORD);
  if (!token) return;
  const headers = employeeHeaders(token);

  const today = http.get(`${BASE_URL}/api/mobile/attendance/today`, { headers, tags: { name: 'mobile_attendance_today' } });
  check(today, { 'mobile today: not 5xx': (r) => r.status < 500 });

  const profile = http.get(`${BASE_URL}/api/mobile/profile`, { headers, tags: { name: 'mobile_profile' } });
  check(profile, { 'mobile profile: not 5xx': (r) => r.status < 500 });

  sleep(Math.random() * 3 + 2);
}
