// Phase 7: attendance spike test. Real employee login (auth.js), real
// check-in/start-work/stop-work endpoints (mobileLifecycle.controller.js),
// which are ALREADY guarded server-side against duplicate check-in
// (409 if already CHECKED_IN/WORKING) - this scenario exists to prove that
// guard actually holds under real concurrent load, not just in a
// single-request test.
//
// Requires TEST_EMPLOYEE_IDS to be assigned to a company (assignedStatus
// 'on-site') - checkIn() 400s otherwise. See README.md's test-data setup.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, EMPLOYEE_IDS, EMPLOYEE_PASSWORD, pickEmployeeId, assertConfigured } from '../config.js';
import { loginEmployee, employeeHeaders } from '../auth.js';

export const options = {
  vus: Number(__ENV.VUS || 50),
  duration: __ENV.DURATION || '1m',
  thresholds: {
    http_req_failed: ['rate<0.5'], // 409s on double check-in are EXPECTED, not failures - see below
  },
};

const doubleCheckinRejected = new Counter('double_checkin_correctly_rejected_409');
const doubleCheckinAllowed = new Counter('double_checkin_INCORRECTLY_allowed_200'); // should stay 0

export function setup() {
  assertConfigured([
    { name: 'TEST_EMPLOYEE_IDS', value: EMPLOYEE_IDS.length > 0 },
    { name: 'TEST_EMPLOYEE_PASSWORD', value: EMPLOYEE_PASSWORD },
  ]);
}

export default function () {
  const employeeId = pickEmployeeId(__VU);
  const token = loginEmployee(employeeId, EMPLOYEE_PASSWORD);
  if (!token) return;
  const headers = employeeHeaders(token);

  // First check-in of the iteration.
  const first = http.post(`${BASE_URL}/api/mobile/attendance/check-in`, JSON.stringify({}), {
    headers,
    tags: { name: 'check_in_first' },
  });

  // Immediate duplicate, simulating a double-tap / network-retry - this is
  // the actual concurrency-safety assertion for this scenario.
  const duplicate = http.post(`${BASE_URL}/api/mobile/attendance/check-in`, JSON.stringify({}), {
    headers,
    tags: { name: 'check_in_duplicate' },
  });

  check(first, { 'first check-in: 200 or 409 (already checked in today)': (r) => r.status === 200 || r.status === 409 });

  if (duplicate.status === 409) {
    doubleCheckinRejected.add(1);
  } else if (duplicate.status === 200) {
    // A 200 here would mean two check-ins were both accepted for the same
    // employee/day - the exact duplicate-record bug this test exists to
    // catch.
    doubleCheckinAllowed.add(1);
  }
  check(duplicate, { 'duplicate check-in correctly rejected (409)': (r) => r.status === 409 });

  sleep(Math.random() * 3 + 2);
}
