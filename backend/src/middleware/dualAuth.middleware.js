/**
 * Dual Auth Middleware
 *
 * Some resources (chat, notifications, salary slips) are read/written by
 * BOTH the dashboard (owner/admin, via authenticateToken) and the mobile
 * app (employee, via authenticateEmployee). This inspects the JWT payload
 * (without trusting it) to decide which of the two real auth middlewares
 * should run, then defers all real verification to that middleware.
 */

import jwt from 'jsonwebtoken';
import authenticateToken from './auth.middleware.js';
import authenticateEmployee from './employeeAuth.middleware.js';

const isEmployeeToken = (token) => {
  try {
    const decoded = jwt.decode(token) || {};
    return (
      decoded.role === 'employee' ||
      Boolean(decoded.employeeId) ||
      Boolean(decoded.empId) ||
      Boolean(decoded.appUserId)
    );
  } catch (_error) {
    return false;
  }
};

export const authenticateDual = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  if (isEmployeeToken(token)) {
    return authenticateEmployee(req, res, next);
  }

  return authenticateToken(req, res, next);
};

/**
 * Same as authenticateDual, but also accepts the token via `?token=` when no
 * Authorization header is present. Only use this for endpoints meant to be
 * opened directly by a browser/PDF viewer (which can't attach custom
 * headers) - e.g. the salary slip download link the mobile app opens in the
 * device's external browser. Everything else should keep using
 * authenticateDual so tokens aren't unnecessarily carried in URLs (which can
 * end up in browser history/server logs).
 */
export const authenticateDualOrQueryToken = (req, res, next) => {
  if (!req.headers.authorization && req.query?.token) {
    req.headers.authorization = `Bearer ${String(req.query.token)}`;
  }
  return authenticateDual(req, res, next);
};

export default authenticateDual;
