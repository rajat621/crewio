import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import Company from '../models/Company.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import EmployeeDocument from '../models/EmployeeDocument.js';
import FileRecord from '../models/FileRecord.js';

const buildEmployeeLookupQuery = (id) => {
  if (mongoose.Types.ObjectId.isValid(id)) {
    return { $or: [{ _id: id }, { employeeId: id }] };
  }

  return { employeeId: id };
};

const buildOwnerFilter = (ownerId) => ({ ownerId });

const buildScopedLookup = (id, ownerId) => ({
  $and: [
    buildEmployeeLookupQuery(id),
    buildOwnerFilter(ownerId),
  ],
});

export const getEmployees = async (req, res) => {
  try {
    const { status, page = 1, limit = 50, assignedCompanyId } = req.query;
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    const scopedClauses = [buildOwnerFilter(user.ownerId)];

    if (status) {
      scopedClauses.push({ status });
    }

    if (assignedCompanyId) {
      if (assignedCompanyId === 'unassigned') {
        scopedClauses.push({ $or: [{ company: null }, { company: { $exists: false } }] });
      } else if (mongoose.Types.ObjectId.isValid(assignedCompanyId)) {
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

    // Map assignedStatus for frontend clarity without changing existing schema
    const mapped = items.map((it) => {
      const obj = it.toObject ? it.toObject() : { ...it };

      let assignedStatus = 'site-over';

      // If employee has a company assigned
      if (obj.company) {
        // active => on-site, otherwise on-hold
        assignedStatus = obj.status === 'active' ? 'on-site' : 'on-hold';
      } else {
        // No company -> site-over
        assignedStatus = 'site-over';
      }

      obj.assignedStatus = assignedStatus;
      return obj;
    });

    res.json({
      message: 'Employees retrieved',
      data: mapped,
      employees: mapped,
      meta: { total, page: Number(page), limit: Number(limit) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch employees', error: error.message });
  }
};

export const getEmployee = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    const employee = await Employee.findOne(buildScopedLookup(req.params.id, user.ownerId)).populate('company', 'name');
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const empObj = employee.toObject ? employee.toObject() : { ...employee };
    empObj.assignedStatus = empObj.company ? (empObj.status === 'active' ? 'on-site' : 'on-hold') : 'site-over';

    res.json({ data: empObj });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch employee', error: error.message });
  }
};

export const createEmployee = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

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

    payload.ownerId = user.ownerId;
    payload.owner = user.userId;

if (payload.company != null) {
    if (!mongoose.Types.ObjectId.isValid(payload.company)) {
        return res.status(400).json({
            message: 'Invalid company id'
        });
    }

    const company = await Company.findOne({
        _id: payload.company,
        ownerId: user.ownerId,
    });

    if (!company) {
        return res.status(403).json({
            message: 'Company not accessible'
        });
    }
} 
    
    else {
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
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

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
      // Assume owner-level scoping; company must belong to same owner when enforced elsewhere
    }

    // Hash new password if admin is updating app credentials
    if (payload.appPassword) {
      payload.appPassword = await bcrypt.hash(payload.appPassword, 12);
    }

    const updated = await Employee.findOneAndUpdate(buildScopedLookup(req.params.id, user.ownerId), payload, { new: true });
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
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    const deleted = await Employee.findOneAndDelete(buildScopedLookup(req.params.id, user.ownerId));
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
    const currentUser = req.currentUser;
    if (!currentUser) return res.status(401).json({ message: 'User not authenticated' });

    const { companyId } = req.body;
    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ message: 'Valid companyId is required' });
    }

    const user = req.user || {};
    const targetCompany = await Company.findOne({ _id: companyId, ownerId: user.ownerId || currentUser.ownerId }).select('_id companyRole isOwner');
    if (!targetCompany) {
      return res.status(403).json({ message: 'Company not accessible' });
    }

    const employee = await Employee.findOne(buildScopedLookup(req.params.id, user.ownerId));
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const updatePayload = { company: targetCompany._id };
    if (!employee.ownerId) {
      updatePayload.ownerId = user.ownerId;
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
    const currentUser = req.currentUser;
    if (!currentUser) return res.status(401).json({ message: 'User not authenticated' });

    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    const employee = await Employee.findOne(buildScopedLookup(req.params.id, user.ownerId));
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const updatePayload = { company: null };
    if (!employee.owner) {
      updatePayload.owner = currentUser._id;
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
    const currentUser = req.currentUser;
    if (!currentUser) return res.status(401).json({ message: 'User not authenticated' });

    // Determine which company IDs the current user can access. In some
    // environments the helper `getAccessibleCompanyIds` may not be present,
    // so fall back to using the owner's id or the user's id.
    let companyIds = [];
    try {
      if (typeof getAccessibleCompanyIds === 'function') {
        companyIds = await getAccessibleCompanyIds(currentUser._id);
      }
    } catch (e) {
      // ignore and fall back
    }
    if (!Array.isArray(companyIds) || companyIds.length === 0) {
      companyIds = [currentUser.ownerId || currentUser._id].filter(Boolean);
    }

    const employee = await Employee.findOne(buildScopedLookup(req.params.id, currentUser.ownerId || currentUser._id, companyIds)).select('_id');
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const ownerId = currentUser.ownerId || currentUser._id || employee.ownerId || null;
    const items = await Attendance.find({ employee: employee._id, company: { $in: companyIds }, ownerId }).sort({ date: -1 });
    res.json({ data: items });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch employee attendance', error: error.message });
  }
};

export const addEmployeeDocument = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });
    const employeeId = req.params.id;
    const { fileRecordId, type } = req.body || {};
    if (!fileRecordId) return res.status(400).json({ message: 'fileRecordId is required' });

    const employee = await Employee.findOne(buildScopedLookup(employeeId, user.ownerId));
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const fr = await FileRecord.findOne({ _id: fileRecordId, ownerId: user.ownerId });
    if (!fr) return res.status(404).json({ message: 'FileRecord not found' });

    const doc = await EmployeeDocument.create({ employee: employee._id, fileRecord: fr._id, type: type || 'generic', ownerId: user.ownerId });
    return res.status(201).json({ message: 'Document attached', data: doc });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to attach document', error: error.message });
  }
}

export const listEmployeeDocuments = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });
    const employeeId = req.params.id;
    const employee = await Employee.findOne(buildScopedLookup(employeeId, user.ownerId));
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    const items = await EmployeeDocument.find({ employee: employee._id, ownerId: user.ownerId }).populate('fileRecord');
    return res.json({ message: 'Documents retrieved', data: items });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to list documents', error: error.message });
  }
}
