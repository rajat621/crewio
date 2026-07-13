import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import User from '../models/User.js';
import Employee from '../models/Employee.js';

const findEmployeeFromDecodedToken = async (decoded = {}) => {
  const identifiers = [decoded.employeeId, decoded.empId, decoded.appUserId, decoded.userId].filter(Boolean);

  for (const identifier of identifiers) {
    const employee = await Employee.findOne({
      $or: [
        { _id: identifier },
        { employeeId: identifier },
        { appUserId: identifier },
      ],
    }).select('-appPassword');
    if (employee) return employee;
  }

  return null;
};

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }

    // Refresh tokens must never be usable as access tokens.
    if (decoded.tokenType === 'refresh') {
      return res.status(403).json({ message: 'Access denied: refresh token cannot be used for API access' });
    }

    // Attach the raw decoded token for reference
    req.auth = decoded;

    // Fetch canonical user record for authorization decisions
    try {
      const dbUser = await User.findById(decoded.userId).populate('company');
      if (!dbUser) {
        // Fallback: if token was an employee mobile token, try loading employee
        const emp = await findEmployeeFromDecodedToken(decoded);
        if (emp) {
          // Reject tokens issued before the employee's last logout/lock/reset.
          if (typeof decoded.tokenVersion === 'number' && decoded.tokenVersion !== (emp.tokenVersion || 0)) {
            return res.status(401).json({ message: 'Session expired. Please log in again.' });
          }
          req.employee = emp;
          return next();
        }
        return res.status(401).json({ message: 'User not found' });
      }

      // Reject tokens issued before the user's last password change/logout-everywhere.
      if (typeof decoded.tokenVersion === 'number' && decoded.tokenVersion !== (dbUser.tokenVersion || 0)) {
        return res.status(401).json({ message: 'Session expired. Please log in again.' });
      }

      const companyId = dbUser.company?._id || null;
      const isOwner = String(dbUser.role || '').toUpperCase() === 'OWNER';
      const ownerId = isOwner
        ? dbUser._id
        : (dbUser.company?.ownerId || dbUser.company?.owner || decoded.ownerId || null);

      // Normalized req.user used across controllers
      req.user = {
        userId: String(dbUser._id),
        email: dbUser.email,
        role: isOwner ? 'OWNER' : dbUser.role,
        companyId: companyId ? String(companyId) : null,
        ownerId: ownerId ? String(ownerId) : null,
      };

      // Full DB user available when controllers need latest data
      req.currentUser = dbUser;
      return next();
    } catch (dbError) {
      return res.status(500).json({ message: 'Failed to load user for auth', error: dbError.message });
    }
  } catch (error) {
    res.status(500).json({ message: 'Authentication error', error: error.message });
  }
};

export default authenticateToken;
