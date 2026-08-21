import ws from 'k6/ws';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:5000';
const EMAIL = __ENV.EMAIL || 'loadtest@example.com';
const PASSWORD = __ENV.PASSWORD || 'LoadTest123!';

export const options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '1m', target: 250 },
  ],
  thresholds: {
    ws_session_duration: ['p(95)<5000'],
  },
};

function login() {
  const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({ email: EMAIL, password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json('token');
}

import http from 'k6/http';

export default function () {
  const token = login();
  const url = `${BASE_URL.replace('http', 'ws')}/socket.io/?transport=websocket&token=${encodeURIComponent(token)}`;
  const response = ws.connect(url, {}, function (socket) {
    socket.on('open', function () {
      socket.send(JSON.stringify({ type: 'ping' }));
    });
    socket.on('message', function (msg) {
      check(msg, { 'socket message received': (m) => m.length > 0 });
    });
    socket.on('close', function () {
      // no-op
    });
    sleep(2);
    socket.close();
  });
  check(response, { 'ws connected': (r) => r && r.status === 101 });
  sleep(1);
}
