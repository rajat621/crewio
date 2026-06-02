/**
 * Employee Mobile Auth Middleware
 *
 * Validates JWT tokens issued specifically for employee mobile app sessions.
 * Sets req.employee with the full Employee document.
 * NEVER trusts employeeId from the request body/query – only from the verified token.
 *
 * Deliberately isolated from the admin authenticateToken middleware so
 * employee tokens cannot be used to access admin routes and vice-versa.
 */

import jwt from 'jsonwebtoken';
import Employee from '../models/Employee.js';
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

    // Load full employee document – abort if deleted
    const employee = await Employee.findById(decoded.employeeId).select('-appPassword');
    if (!employee) {
      return res.status(401).json({ message: 'Employee not found' });
    }

    // Attach to request – all downstream handlers use req.employee
    req.employee = employee;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Authentication error', error: error.message });
  }
};

export default authenticateEmployee;
