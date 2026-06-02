import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import Company from '../models/Company.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const buildEmployeeLookupQuery = (id) => {
  if (mongoose.Types.ObjectId.isValid(id)) {
    return { $or: [{ _id: id }, { employeeId: id }] };
  }

  return { employeeId: id };
};

const getAccessibleCompanyIds = async (userId) => {
  const ownedCompanies = await Company.find({ owner: userId }).select('_id');
  return ownedCompanies.map((company) => company._id);
};

const buildAccessFilter = (userId, companyIds) => {
  const companyConditions = Array.isArray(companyIds) && companyIds.length > 0
    ? [{ company: { $in: companyIds } }]
    : [];

  return {
    $or: [
      { owner: userId },
      ...companyConditions,
    ],
  };
};

const buildScopedLookup = (id, userId, companyIds) => ({
  $and: [
    buildEmployeeLookupQuery(id),
    buildAccessFilter(userId, companyIds),
  ],
});

export const getEmployees = async (req, res) => {
  try {
    const { status, page = 1, limit = 50, assignedCompanyId } = req.query;
    const userId = req.user?.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const companyIds = await getAccessibleCompanyIds(user._id);
    const scopedClauses = [buildAccessFilter(user._id, companyIds)];

    if (status) {
      scopedClauses.push({ status });
    }

    if (assignedCompanyId) {
      if (assignedCompanyId === 'unassigned') {
        scopedClauses.push({
          $or: [{ company: null }, { company: { $exists: false } }],
        });
      } else if (mongoose.Types.ObjectId.isValid(assignedCompanyId)) {
        const requestedCompany = String(assignedCompanyId);
        const isAccessibleCompany = companyIds.some((companyId) => String(companyId) === requestedCompany);
        if (!isAccessibleCompany) {
          return res.status(403).json({ message: 'Company not accessible' });
        }
        scopedClauses.push({ company: assignedCompanyId });
      }
    }

    const filter = scopedClauses.length === 1 ? scopedClauses[0] : { $and: scopedClauses };
    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Employee.find(filter)
        .populate('company', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Employee.countDocuments(filter),
    ]);
    res.json({
      message: 'Employees retrieved',
      data: items,
      employees: items,
      meta: { total, page: Number(page), limit: Number(limit) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch employees', error: error.message });
  }
};

export const getEmployee = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const companyIds = await getAccessibleCompanyIds(user._id);
    const employee = await Employee.findOne(buildScopedLookup(req.params.id, user._id, companyIds));
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    res.json({ data: employee });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch employee', error: error.message });
  }
};

export const createEmployee = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const companyIds = await getAccessibleCompanyIds(user._id);
    const payload = { ...req.body };
    payload.name = payload.name || `${payload.firstName || ''} ${payload.lastName || ''}`.trim();
    payload.employeeId = payload.employeeId || payload.emiratesId;
    payload.emiratesId = payload.emiratesId || payload.employeeId;
    payload.mobile = payload.mobile || payload.mobileNumber;
    payload.mobileNumber = payload.mobileNumber || payload.mobile;
    payload.position = payload.position || payload.trade;
    payload.joiningDate = payload.joiningDate || payload.joinDate;
    payload.joinDate = payload.joinDate || payload.joiningDate;
    if (!payload.appUserId) {
      payload.appUserId = payload.employeeId || `EMP${Date.now().toString().slice(-6)}`;
    }

    const plainAppPassword = payload.appPassword || `${payload.appUserId}@123`;

    // Always store the password as a bcrypt hash
    payload.appPassword = await bcrypt.hash(plainAppPassword, 12);

    payload.owner = user._id;

    if (payload.company != null) {
      if (!mongoose.Types.ObjectId.isValid(payload.company)) {
        return res.status(400).json({ message: 'Invalid company id' });
      }

      const isAccessibleCompany = companyIds.some((companyId) => String(companyId) === String(payload.company));
      if (!isAccessibleCompany) {
        return res.status(403).json({ message: 'Company not accessible' });
      }
    } else {
      payload.company = null;
    }

    if (!payload.name) {
      return res.status(400).json({ message: 'Employee name is required' });
    }
    if (!payload.email) {
      delete payload.email;
    }
    const employee = await Employee.create(payload);
    const employeeResponse = employee.toObject();

    // Return one-time generated plain app password for admin UI display.
    employeeResponse.appPassword = plainAppPassword;

    res.status(201).json({
      message: 'Employee created',
      data: employeeResponse,
      employee: employeeResponse,
    });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.email) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    if (error?.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({ message: 'Failed to create employee', error: error.message });
  }
};

export const updateEmployee = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const companyIds = await getAccessibleCompanyIds(user._id);

    const payload = { ...req.body };

    if (payload.firstName || payload.lastName) {
      payload.name = payload.name || `${payload.firstName || ''} ${payload.lastName || ''}`.trim();
    }

    payload.mobileNumber = payload.mobileNumber || payload.mobile;
    payload.position = payload.position || payload.trade;
    payload.joinDate = payload.joinDate || payload.joiningDate;
    payload.employeeId = payload.employeeId || payload.emiratesId;
    payload.emiratesId = payload.emiratesId || payload.employeeId;

    if (Object.prototype.hasOwnProperty.call(payload, 'company') && payload.company != null) {
      if (!mongoose.Types.ObjectId.isValid(payload.company)) {
        return res.status(400).json({ message: 'Invalid company id' });
      }

      const isAccessibleCompany = companyIds.some((companyId) => String(companyId) === String(payload.company));
      if (!isAccessibleCompany) {
        return res.status(403).json({ message: 'Company not accessible' });
      }
    }

    // Hash new password if admin is updating app credentials
    if (payload.appPassword) {
      payload.appPassword = await bcrypt.hash(payload.appPassword, 12);
    }

    const updated = await Employee.findOneAndUpdate(
      buildScopedLookup(req.params.id, user._id, companyIds),
      payload,
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.json({ message: 'Employee updated', data: updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update employee', error: error.message });
  }
};

export const deleteEmployee = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const companyIds = await getAccessibleCompanyIds(user._id);

    const deleted = await Employee.findOneAndDelete(buildScopedLookup(req.params.id, user._id, companyIds));
    if (!deleted) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete employee', error: error.message });
  }
};

export const assignEmployee = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { companyId } = req.body;
    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ message: 'Valid companyId is required' });
    }

    const companyIds = await getAccessibleCompanyIds(user._id);
    const targetCompany = await Company.findOne({ _id: companyId, owner: user._id }).select('_id companyRole isOwner');
    if (!targetCompany) {
      return res.status(403).json({ message: 'Company not accessible' });
    }

    const employee = await Employee.findOne(buildScopedLookup(req.params.id, user._id, companyIds));
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const updatePayload = { company: targetCompany._id };
    if (!employee.owner) {
      updatePayload.owner = user._id;
    }

    const updated = await Employee.findByIdAndUpdate(employee._id, updatePayload, { new: true });

    if (!updated) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.json({ message: 'Employee assigned successfully', data: updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to assign employee', error: error.message });
  }
};

export const unassignEmployee = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const companyIds = await getAccessibleCompanyIds(user._id);

    const employee = await Employee.findOne(buildScopedLookup(req.params.id, user._id, companyIds));
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const updatePayload = { company: null };
    if (!employee.owner) {
      updatePayload.owner = user._id;
    }

    const updated = await Employee.findByIdAndUpdate(employee._id, updatePayload, { new: true });

    if (!updated) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.json({ message: 'Employee unassigned successfully', data: updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to unassign employee', error: error.message });
  }
};

export const getEmployeeAttendance = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const companyIds = await getAccessibleCompanyIds(user._id);

    const employee = await Employee.findOne(buildScopedLookup(req.params.id, user._id, companyIds)).select('_id');
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const items = await Attendance.find({ employee: employee._id, company: { $in: companyIds } }).sort({ date: -1 });
    res.json({ data: items });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch employee attendance', error: error.message });
  }
};
