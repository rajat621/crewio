// Real authentication flows only - no bypass, no shortcut, no super-admin
// token. Goes through the exact same middleware every real client does.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from './config.js';

// Employee mobile login (employeeId + password) - the one auth flow that's
// actually scriptable end-to-end, since owner/admin login requires a live
// OTP. Real POST to /api/mobile/auth/login, real authLimiter middleware in
// front of it, real bcrypt password check server-side.
export function loginEmployee(employeeId, password) {
  // Deliberately omits deviceId - mobileAuth.controller.js only enforces
  // device-binding when a deviceId is supplied, and binds the FIRST
  // deviceId it sees to the account permanently. Sending one would either
  // collide across VUs sharing the same small synthetic-employee pool
  // (403 device_mismatch) or falsely bind a "device" that doesn't exist.
  // Omitting it exercises the same login/password/lockout logic real
  // clients hit, just without opting into the device-binding feature.
  const res = http.post(
    `${BASE_URL}/api/mobile/auth/login`,
    JSON.stringify({ employeeId, password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'auth_login_employee' } }
  );
  check(res, {
    'employee login: status 200': (r) => r.status === 200,
    'employee login: token present': (r) => {
      try {
        return Boolean(JSON.parse(r.body)?.accessToken);
      } catch {
        return false;
      }
    },
  });
  if (res.status !== 200) return null;
  const body = JSON.parse(res.body);
  return body?.accessToken || null;
}

export function employeeHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
