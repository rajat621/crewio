// import bcrypt from 'bcryptjs';
// import jwt from 'jsonwebtoken';
// import Employee from '../../models/Employee.js';
// import { env } from '../../config/env.js';
// import { createAuditLog } from '../../services/audit.service.js';

// const MAX_FAILED_ATTEMPTS = 5;
// const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// const buildIdentifierCandidates = (rawIdentifier = '') => {
//   const raw = String(rawIdentifier || '').trim();
//   if (!raw) {
//     return [];
//   }

//   const candidates = new Set([raw, raw.toLowerCase(), raw.toUpperCase()]);

//   const compact = raw.replace(/[\s_-]+/g, '');
//   if (compact) {
//     candidates.add(compact);
//     candidates.add(compact.toLowerCase());
//     candidates.add(compact.toUpperCase());
//   }

//   // Normalize common formats like EMP0020 / EMP-0020 / emp_0020.
//   const parts = compact.match(/^([A-Za-z]+)(\d+)$/);
//   if (parts) {
//     const [, letters, digits] = parts;
//     candidates.add(`${letters.toLowerCase()}-${digits}`);
//     candidates.add(`${letters.toUpperCase()}${digits}`);
//   }

//   return Array.from(candidates);
// };

// const findEmployeeByLoginId = async (loginId, ownerId) => {
//   const trimmed = String(loginId || '').trim();
//   const candidates = buildIdentifierCandidates(trimmed);

//   const query = {
//     $or: [
//       { appUserId: { $in: candidates } },
//       { employeeId: { $in: candidates } },
//       { appUserId: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') },
//       { employeeId: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') },
//     ],
//   };
//   if (ownerId) query.ownerId = ownerId;

//   return Employee.findOne(query).select('+appPassword');
// };

// // Shape this EXACTLY like the Flutter UserModel expects:
// // { _id, employeeId, email, name, phone, status, createdAt, lastSeen, lastLocation }
// const buildUserPayload = (employee) => ({
//   _id: String(employee._id),
//   employeeId: employee.employeeId || employee.appUserId || String(employee._id),
//   email: employee.email || null,
//   name: employee.name || [employee.firstName, employee.lastName].filter(Boolean).join(' ') || 'Employee',
//   phone: employee.mobile || employee.mobileNumber || null,
//   status: employee.status || 'active',
//   createdAt: employee.createdAt ? new Date(employee.createdAt).toISOString() : null,
//   lastSeen: employee.lastSeen ? new Date(employee.lastSeen).toISOString() : null,
//   lastLocation: employee.lastLocation || null,
// });

// const resolveOwnerId = async (employee) => {
//   let resolvedOwnerId = employee.ownerId || employee.owner || null;
//   const resolvedCompanyId = employee.company || null;
//   if (!resolvedOwnerId && resolvedCompanyId) {
//     try {
//       const Company = (await import('../../models/Company.js')).default;
//       const comp = await Company.findById(resolvedCompanyId);
//       if (comp) resolvedOwnerId = comp.ownerId || comp.owner || resolvedOwnerId;
//     } catch (_e) {
//       // ignore - fall through with whatever we have
//     }
//   }
//   return { resolvedOwnerId, resolvedCompanyId };
// };

// const signAccessToken = (employee, ownerId, companyId) =>
//   jwt.sign(
//     {
//       employeeId: employee._id,
//       appUserId: employee.appUserId,
//       role: 'employee',
//       tokenType: 'access',
//       tokenVersion: employee.tokenVersion || 0,
//       ownerId,
//       companyId,
//     },
//     env.JWT_SECRET,
//     { expiresIn: '1d' }
//   );

// const signRefreshToken = (employee, ownerId, companyId) =>
//   jwt.sign(
//     {
//       employeeId: employee._id,
//       role: 'employee',
//       tokenType: 'refresh',
//       tokenVersion: employee.tokenVersion || 0,
//       ownerId,
//       companyId,
//     },
//     env.JWT_SECRET,
//     { expiresIn: '30d' }
//   );

// export const loginEmployee = async (req, res) => {
//   try {
//     const loginId = String(req.body?.employeeId || req.body?.appUserId || req.body?.username || '').trim();
//     const password = String(req.body?.password || '');

//     if (!loginId || !password) {
//       return res.status(400).json({ message: 'employeeId (or appUserId) and password are required' });
//     }

//     const employee = await findEmployeeByLoginId(loginId);
//     if (!employee) {
//       // Deliberately generic - don't reveal whether the ID exists.
//       return res.status(401).json({ message: 'Invalid credentials' });
//     }

//     // Locked out from too many recent failed attempts.
//     if (employee.lockUntil && employee.lockUntil > new Date()) {
//       const minutesLeft = Math.ceil((employee.lockUntil.getTime() - Date.now()) / 60000);
//       return res.status(403).json({ message: `Too many failed attempts. Try again in ${minutesLeft} minute(s).` });
//     }

//     const storedPassword = String(employee.appPassword || '');
//     let isValid = false;

//     try {
//       isValid = await bcrypt.compare(password, storedPassword);
//     } catch (_error) {
//       isValid = false;
//     }

//     // Best-effort migration from any plaintext legacy password.
//     const shouldMigrateLegacyPassword = !isValid && storedPassword && storedPassword === password;
//     if (shouldMigrateLegacyPassword) {
//       isValid = true;
//       employee.appPassword = await bcrypt.hash(password, 12);
//     }

//     if (!isValid) {
//       employee.failedLoginAttempts = (employee.failedLoginAttempts || 0) + 1;
//       if (employee.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
//         employee.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
//         employee.failedLoginAttempts = 0;
//       }
//       await employee.save();

//       await createAuditLog({
//         action: 'employee.login.failed',
//         entity: 'Employee',
//         entityId: employee._id,
//         ownerId: employee.ownerId || employee.owner || null,
//         changes: { loginId },
//       });

//       return res.status(401).json({ message: 'Invalid credentials' });
//     }

//     if (employee.status && employee.status !== 'active') {
//       return res.status(403).json({ message: 'This account is not active. Contact your office.' });
//     }

//     // Successful login - reset lockout counters.
//     employee.failedLoginAttempts = 0;
//     employee.lockUntil = null;
//     employee.lastSeen = new Date();
//     await employee.save();

//     const { resolvedOwnerId, resolvedCompanyId } = await resolveOwnerId(employee);

//     const accessToken = signAccessToken(employee, resolvedOwnerId, resolvedCompanyId);
//     const refreshToken = signRefreshToken(employee, resolvedOwnerId, resolvedCompanyId);

//     await createAuditLog({
//       action: 'employee.login.success',
//       entity: 'Employee',
//       entityId: employee._id,
//       ownerId: resolvedOwnerId || null,
//     });

//     return res.json({
//       accessToken,
//       refreshToken,
//       user: buildUserPayload(employee),
//     });
//   } catch (error) {
//     return res.status(500).json({ message: 'Employee login failed', error: error.message });
//   }
// };

// export const refreshEmployeeToken = async (req, res) => {
//   try {
//     const refreshToken = String(req.body?.refreshToken || '');
//     if (!refreshToken) {
//       return res.status(400).json({ message: 'refreshToken is required' });
//     }

//     let decoded;
//     try {
//       decoded = jwt.verify(refreshToken, env.JWT_SECRET);
//     } catch (_err) {
//       return res.status(401).json({ message: 'Invalid or expired refresh token' });
//     }

//     if (decoded.role !== 'employee' || decoded.tokenType !== 'refresh') {
//       return res.status(401).json({ message: 'Invalid refresh token' });
//     }

//     const employee = await Employee.findById(decoded.employeeId);
//     if (!employee) {
//       return res.status(401).json({ message: 'Employee not found' });
//     }

//     if (typeof decoded.tokenVersion === 'number' && decoded.tokenVersion !== (employee.tokenVersion || 0)) {
//       return res.status(401).json({ message: 'Session expired. Please log in again.' });
//     }

//     if (employee.lockUntil && employee.lockUntil > new Date()) {
//       return res.status(403).json({ message: 'Account temporarily locked. Please try again later.' });
//     }

//     const { resolvedOwnerId, resolvedCompanyId } = await resolveOwnerId(employee);
//     const newAccessToken = signAccessToken(employee, resolvedOwnerId, resolvedCompanyId);
//     const newRefreshToken = signRefreshToken(employee, resolvedOwnerId, resolvedCompanyId);

//     return res.json({
//       accessToken: newAccessToken,
//       refreshToken: newRefreshToken,
//       user: buildUserPayload(employee),
//     });
//   } catch (error) {
//     return res.status(500).json({ message: 'Failed to refresh token', error: error.message });
//   }
// };

// // Bumps tokenVersion so every access/refresh token issued before this call
// // stops working immediately (checked in employeeAuth/auth middleware) -
// // this is what makes "log out" and "log out everywhere" actually mean something
// // for JWTs, which otherwise can't be individually revoked.
// export const logoutEmployee = async (req, res) => {
//   try {
//     if (req.employee?._id) {
//       await Employee.findByIdAndUpdate(req.employee._id, { $inc: { tokenVersion: 1 } });
//     }
//     return res.json({ message: 'Logged out' });
//   } catch (error) {
//     // Logout should never fail hard on the client - clearing local tokens is enough either way.
//     return res.json({ message: 'Logged out' });
//   }
// };

// export default {
//   loginEmployee,
//   refreshEmployeeToken,
//   logoutEmployee,
// };
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Employee from '../../models/Employee.js';
import { env } from '../../config/env.js';
import { createAuditLog } from '../../services/audit.service.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildIdentifierCandidates = (rawIdentifier = '') => {
  const raw = String(rawIdentifier || '').trim();
  if (!raw) {
    return [];
  }

  const candidates = new Set([raw, raw.toLowerCase(), raw.toUpperCase()]);

  const compact = raw.replace(/[\s_-]+/g, '');
  if (compact) {
    candidates.add(compact);
    candidates.add(compact.toLowerCase());
    candidates.add(compact.toUpperCase());
  }

  // Normalize common formats like EMP0020 / EMP-0020 / emp_0020.
  const parts = compact.match(/^([A-Za-z]+)(\d+)$/);
  if (parts) {
    const [, letters, digits] = parts;
    candidates.add(`${letters.toLowerCase()}-${digits}`);
    candidates.add(`${letters.toUpperCase()}${digits}`);
  }

  return Array.from(candidates);
};

const findEmployeeByLoginId = async (loginId, ownerId) => {
  const trimmed = String(loginId || '').trim();
  const candidates = buildIdentifierCandidates(trimmed);

  const query = {
    $or: [
      // Primary: the "Employee ID" field in the app is the Emirates ID
      // recorded on the employee's dashboard profile.
      { emiratesId: { $in: candidates } },
      { emiratesId: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') },
      // Fallbacks: also accept the dashboard's "App Access" username or the
      // internal employeeId, in case an office hasn't filled in Emirates ID
      // for every employee yet.
      { appUserId: { $in: candidates } },
      { employeeId: { $in: candidates } },
      { appUserId: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') },
      { employeeId: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') },
    ],
  };
  if (ownerId) query.ownerId = ownerId;

  return Employee.findOne(query).select('+appPassword');
};

// Shape this EXACTLY like the Flutter UserModel expects:
// { _id, employeeId, email, name, phone, status, createdAt, lastSeen, lastLocation }
const buildUserPayload = (employee) => ({
  _id: String(employee._id),
  employeeId: employee.employeeId || employee.appUserId || String(employee._id),
  email: employee.email || null,
  name: employee.name || [employee.firstName, employee.lastName].filter(Boolean).join(' ') || 'Employee',
  phone: employee.mobile || employee.mobileNumber || null,
  status: employee.status || 'active',
  createdAt: employee.createdAt ? new Date(employee.createdAt).toISOString() : null,
  lastSeen: employee.lastSeen ? new Date(employee.lastSeen).toISOString() : null,
  lastLocation: employee.lastLocation || null,
});

const resolveOwnerId = async (employee) => {
  let resolvedOwnerId = employee.ownerId || employee.owner || null;
  const resolvedCompanyId = employee.company || null;
  if (!resolvedOwnerId && resolvedCompanyId) {
    try {
      const Company = (await import('../../models/Company.js')).default;
      const comp = await Company.findById(resolvedCompanyId);
      if (comp) resolvedOwnerId = comp.ownerId || comp.owner || resolvedOwnerId;
    } catch (_e) {
      // ignore - fall through with whatever we have
    }
  }
  return { resolvedOwnerId, resolvedCompanyId };
};

const signAccessToken = (employee, ownerId, companyId) =>
  jwt.sign(
    {
      employeeId: employee._id,
      appUserId: employee.appUserId,
      role: 'employee',
      tokenType: 'access',
      tokenVersion: employee.tokenVersion || 0,
      ownerId,
      companyId,
    },
    env.JWT_SECRET,
    { expiresIn: '1d' }
  );

const signRefreshToken = (employee, ownerId, companyId) =>
  jwt.sign(
    {
      employeeId: employee._id,
      role: 'employee',
      tokenType: 'refresh',
      tokenVersion: employee.tokenVersion || 0,
      ownerId,
      companyId,
    },
    env.JWT_SECRET,
    { expiresIn: '30d' }
  );

export const loginEmployee = async (req, res) => {
  try {
    const loginId = String(req.body?.employeeId || req.body?.appUserId || req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const deviceId = req.body?.deviceId ? String(req.body.deviceId).trim() : null;

    if (!loginId || !password) {
      return res.status(400).json({ message: 'employeeId (or appUserId) and password are required' });
    }

    const employee = await findEmployeeByLoginId(loginId);
    if (!employee) {
      // Deliberately generic - don't reveal whether the ID exists.
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Device binding: the first successful login binds the account to that
    // device. Later logins from a different device are rejected so a leaked
    // password alone can't be used to access the account from an unknown
    // phone - an office admin can clear boundDeviceId to allow re-binding
    // (e.g. after a legitimate phone upgrade).
    if (deviceId && employee.boundDeviceId && employee.boundDeviceId !== deviceId) {
      await createAuditLog({
        action: 'employee.login.device_mismatch',
        entity: 'Employee',
        entityId: employee._id,
        ownerId: employee.ownerId || employee.owner || null,
        changes: { attemptedDeviceId: deviceId },
      });
      return res.status(403).json({
        message: 'This account is registered to a different device. Contact your office to reset device access.',
      });
    }

    // Locked out from too many recent failed attempts.
    if (employee.lockUntil && employee.lockUntil > new Date()) {
      const minutesLeft = Math.ceil((employee.lockUntil.getTime() - Date.now()) / 60000);
      return res.status(403).json({ message: `Too many failed attempts. Try again in ${minutesLeft} minute(s).` });
    }

    const storedPassword = String(employee.appPassword || '');
    let isValid = false;

    try {
      isValid = await bcrypt.compare(password, storedPassword);
    } catch (_error) {
      isValid = false;
    }

    // Best-effort migration from any plaintext legacy password.
    const shouldMigrateLegacyPassword = !isValid && storedPassword && storedPassword === password;
    if (shouldMigrateLegacyPassword) {
      isValid = true;
      employee.appPassword = await bcrypt.hash(password, 12);
    }

    if (!isValid) {
      employee.failedLoginAttempts = (employee.failedLoginAttempts || 0) + 1;
      if (employee.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        employee.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        employee.failedLoginAttempts = 0;
      }
      await employee.save();

      await createAuditLog({
        action: 'employee.login.failed',
        entity: 'Employee',
        entityId: employee._id,
        ownerId: employee.ownerId || employee.owner || null,
        changes: { loginId },
      });

      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (employee.status && employee.status !== 'active') {
      return res.status(403).json({ message: 'This account is not active. Contact your office.' });
    }

    // Successful login - reset lockout counters.
    employee.failedLoginAttempts = 0;
    employee.lockUntil = null;
    employee.lastSeen = new Date();
    if (deviceId && !employee.boundDeviceId) {
      employee.boundDeviceId = deviceId;
    }
    await employee.save();

    const { resolvedOwnerId, resolvedCompanyId } = await resolveOwnerId(employee);

    const accessToken = signAccessToken(employee, resolvedOwnerId, resolvedCompanyId);
    const refreshToken = signRefreshToken(employee, resolvedOwnerId, resolvedCompanyId);

    await createAuditLog({
      action: 'employee.login.success',
      entity: 'Employee',
      entityId: employee._id,
      ownerId: resolvedOwnerId || null,
    });

    return res.json({
      accessToken,
      refreshToken,
      user: buildUserPayload(employee),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Employee login failed', error: error.message });
  }
};

export const refreshEmployeeToken = async (req, res) => {
  try {
    const refreshToken = String(req.body?.refreshToken || '');
    if (!refreshToken) {
      return res.status(400).json({ message: 'refreshToken is required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, env.JWT_SECRET);
    } catch (_err) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    if (decoded.role !== 'employee' || decoded.tokenType !== 'refresh') {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const employee = await Employee.findById(decoded.employeeId);
    if (!employee) {
      return res.status(401).json({ message: 'Employee not found' });
    }

    if (typeof decoded.tokenVersion === 'number' && decoded.tokenVersion !== (employee.tokenVersion || 0)) {
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }

    if (employee.lockUntil && employee.lockUntil > new Date()) {
      return res.status(403).json({ message: 'Account temporarily locked. Please try again later.' });
    }

    const { resolvedOwnerId, resolvedCompanyId } = await resolveOwnerId(employee);
    const newAccessToken = signAccessToken(employee, resolvedOwnerId, resolvedCompanyId);
    const newRefreshToken = signRefreshToken(employee, resolvedOwnerId, resolvedCompanyId);

    return res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: buildUserPayload(employee),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to refresh token', error: error.message });
  }
};

// Bumps tokenVersion so every access/refresh token issued before this call
// stops working immediately (checked in employeeAuth/auth middleware) -
// this is what makes "log out" and "log out everywhere" actually mean something
// for JWTs, which otherwise can't be individually revoked.
export const logoutEmployee = async (req, res) => {
  try {
    if (req.employee?._id) {
      await Employee.findByIdAndUpdate(req.employee._id, { $inc: { tokenVersion: 1 } });
    }
    return res.json({ message: 'Logged out' });
  } catch (error) {
    // Logout should never fail hard on the client - clearing local tokens is enough either way.
    return res.json({ message: 'Logged out' });
  }
};

// POST /api/mobile/push/register - stores/updates the FCM registration token
// for this device so the backend can send push notifications to it.
export const registerPushToken = async (req, res) => {
  try {
    const fcmToken = String(req.body?.fcmToken || req.body?.token || '').trim();
    if (!fcmToken) return res.status(400).json({ message: 'fcmToken is required' });

    await Employee.findByIdAndUpdate(req.employee._id, { $set: { fcmToken } });
    return res.json({ message: 'Push token registered' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to register push token', error: error.message });
  }
};

export default {
  loginEmployee,
  refreshEmployeeToken,
  logoutEmployee,
  registerPushToken,
};
