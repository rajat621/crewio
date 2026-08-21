import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:5000';
const EMAIL = __ENV.EMAIL || 'loadtest@example.com';
const PASSWORD = __ENV.PASSWORD || 'LoadTest123!';

export const options = {
  stages: [
    { duration: '2m', target: 40 },
    { duration: '2m', target: 80 },
    { duration: '2m', target: 120 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1200'],
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

  if (Math.random() < 0.6) {
    const body = {
      employee: '64f000000000000000000001',
      company: '64f000000000000000000002',
      date: new Date().toISOString(),
      status: 'present',
      checkIn: '09:00',
      hoursWorked: 8,
    };
    const res = http.post(`${BASE_URL}/api/attendance`, JSON.stringify(body), { headers, tags: { name: 'attendance.create' } });
    check(res, { 'attendance create ok': (r) => r.status === 201 || r.status === 400 || r.status === 403 });
  } else {
    const body = {
      company: '64f000000000000000000002',
      clientName: 'Acme Test',
      invoiceDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      items: [{ description: 'Labor', quantity: 8, rate: 100, amount: 800 }],
      subtotal: 800,
      vatAmount: 0,
      total: 800,
    };
    const res = http.post(`${BASE_URL}/api/invoices`, JSON.stringify(body), { headers, tags: { name: 'invoice.create' } });
    check(res, { 'invoice create ok': (r) => r.status === 201 || r.status === 400 || r.status === 403 });
  }

  sleep(1 + Math.random());
}
