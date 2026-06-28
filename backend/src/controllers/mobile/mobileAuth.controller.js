import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Employee from '../../models/Employee.js';
import { env } from '../../config/env.js';

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
      { appUserId: { $in: candidates } },
      { employeeId: { $in: candidates } },
      { appUserId: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') },
      { employeeId: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') },
    ],
  };
  if (ownerId) query.ownerId = ownerId;

  return Employee.findOne(query).select('+appPassword');
};

const buildEmployeePayload = (employee) => ({
  _id: employee._id,
  employeeId: employee.employeeId || null,
  appUserId: employee.appUserId || null,
  name: employee.name || null,
  firstName: employee.firstName || null,
  lastName: employee.lastName || null,
  status: employee.status,
  company: employee.company || null,
});

export const loginEmployee = async (req, res) => {
  try {
    const loginId = String(req.body?.appUserId || req.body?.employeeId || req.body?.username || '').trim();
    const password = String(req.body?.password || '');

    if (!loginId || !password) {
      return res.status(400).json({ message: 'appUserId (or employeeId) and password are required' });
    }

    // Allow login without ownerId/companyId in the request. Resolve tenant ownership
    // from the Employee -> Company -> Owner relationship.
    const employee = await findEmployeeByLoginId(loginId);
    if (!employee) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const storedPassword = String(employee.appPassword || '');
    let isValid = false;

    try {
      isValid = await bcrypt.compare(password, storedPassword);
    } catch (_error) {
      isValid = false;
    }

    const shouldMigrateLegacyPassword = !isValid && storedPassword === password;
    if (shouldMigrateLegacyPassword) {
      isValid = true;
      employee.appPassword = await bcrypt.hash(password, 12);
      await employee.save();
    }

    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Resolve tenant ownerId and companyId for the employee and include them in the token
    let resolvedOwnerId = employee.ownerId || employee.owner || null;
    let resolvedCompanyId = employee.company || null;
    if (!resolvedOwnerId && resolvedCompanyId) {
      try {
        const Company = (await import('../../models/Company.js')).default;
        const comp = await Company.findById(resolvedCompanyId);
        if (comp) resolvedOwnerId = comp.ownerId || comp.owner || resolvedOwnerId;
      } catch (e) {
        // ignore
      }
    }

    const token = jwt.sign(
      {
        employeeId: employee._id,
        appUserId: employee.appUserId,
        role: 'employee',
        ownerId: resolvedOwnerId,
        companyId: resolvedCompanyId,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRE || '7d' }
    );

    return res.json({
      token,
      employee: buildEmployeePayload(employee),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Employee login failed', error: error.message });
  }
};

export default {
  loginEmployee,
};
