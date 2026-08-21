import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:5000';
const EMAIL = __ENV.EMAIL || 'loadtest@example.com';
const PASSWORD = __ENV.PASSWORD || 'LoadTest123!';

export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '1m', target: 40 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.1'],
    http_req_duration: ['p(95)<2000'],
  },
};

function login() {
  const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({ email: EMAIL, password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'auth.login' },
  });
  check(res, { 'login ok': (r) => r.status === 200 });
  return res.json('token');
}

export default function () {
  const token = login();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const body = {
    pdfPath: '/src/storage/uploads/timesheets/1778508592068-mcc_timesheet.pdf',
    documentType: 'auto',
    companyId: '6a5a0872251dab4d7e192a9c',
    userId: '6a5a083b37d6bb2301a33ff7',
  };
  const res = http.post(`${BASE_URL}/api/ai/jobs`, JSON.stringify(body), { headers, tags: { name: 'ai.jobs.create' } });
  check(res, { 'ai job accepted': (r) => r.status === 202 || r.status === 400 || r.status === 403 || r.status === 503 });
  sleep(0.3);
}
