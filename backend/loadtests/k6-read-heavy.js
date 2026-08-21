import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:5000';
const EMAIL = __ENV.EMAIL || 'loadtest@example.com';
const PASSWORD = __ENV.PASSWORD || 'LoadTest123!';

export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '2m', target: 500 },
    { duration: '2m', target: 1000 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<800'],
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

  const endpoints = [
    '/api/dashboard',
    '/api/employees',
    '/api/attendance',
    '/api/attendance/summary',
  ];

  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const res = http.get(`${BASE_URL}${endpoint}`, { headers, tags: { name: endpoint } });
  check(res, { [`${endpoint} ok`]: (r) => r.status === 200 });
  sleep(0.5 + Math.random() * 0.5);
}
