/**
 * Employee Mobile Auth Middleware
 *
 * Validates JWT tokens issued specifically for employee mobile app sessions.
 * Sets req.employee with the full Employee document.
 * NEVER trusts employeeId from the request body/query - only from the verified token.
 *
 * Deliberately isolated from the admin authenticateToken middleware so
 * employee tokens cannot be used to access admin routes and vice-versa.
 */

import jwt from 'jsonwebtoken';
import Employee from '../models/Employee.js';
import Company from '../models/Company.js';
import { env } from '../config/env.js';

export const authenticateEmployee = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (_err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }

    // Ensure this token was issued for an employee, not an admin
    if (decoded.role !== 'employee') {
      return res.status(403).json({ message: 'Access denied: not an employee token' });
    }

    // Refresh tokens must never be usable as access tokens.
    if (decoded.tokenType === 'refresh') {
      return res.status(403).json({ message: 'Access denied: refresh token cannot be used for API access' });
    }

    // Load full employee document - abort if deleted
    const employee = await Employee.findById(decoded.employeeId).select('-appPassword');
    if (!employee) {
      return res.status(401).json({ message: 'Employee not found' });
    }

    // Reject tokens issued before the employee's last logout-everywhere/lock/reset.
    if (typeof decoded.tokenVersion === 'number' && decoded.tokenVersion !== (employee.tokenVersion || 0)) {
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }

    // Reject accounts currently locked out from repeated failed logins.
    if (employee.lockUntil && employee.lockUntil > new Date()) {
      return res.status(403).json({ message: 'Account temporarily locked. Please try again later.' });
    }

    // Validate ownerId in token (if present) matches employee's owner or company owner
    if (decoded.ownerId) {
      const empOwner = employee.ownerId || employee.owner || null;
      let companyOwner = null;
      if (!empOwner && employee.company) {
        const comp = await Company.findById(employee.company).select('ownerId owner');
        companyOwner = comp ? (comp.ownerId || comp.owner) : null;
      }
      const effectiveOwner = empOwner || companyOwner;
      if (effectiveOwner && String(decoded.ownerId) !== String(effectiveOwner)) {
        return res.status(403).json({ message: 'Access denied: owner mismatch' });
      }
    }

    // Attach to request - all downstream handlers use req.employee
    req.employee = employee;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Authentication error', error: error.message });
  }
};

export default authenticateEmployee;
