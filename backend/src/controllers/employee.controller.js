import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import Company from '../models/Company.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import EmployeeDocument from '../models/EmployeeDocument.js';
import FileRecord from '../models/FileRecord.js';
import { reportLifecycleEvent } from '../services/lifecycle.service.js';

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

    // Self-healing backfill: employees created before assignedStatus existed
    // won't have it set in the database at all. Rather than requiring a
    // manual migration, fix them up the first time they're read and use the
    // correct value immediately in this response too.
    const needsBackfill = items.filter((it) => !it.assignedStatus);
    if (needsBackfill.length > 0) {
      await Promise.all(
        needsBackfill.map((it) => {
          const inferred = it.company ? 'on-site' : 'on-hold';
          it.assignedStatus = inferred;
          return Employee.updateOne({ _id: it._id }, { $set: { assignedStatus: inferred } }).catch(() => {});
        })
      );
    }

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
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    const employee = await Employee.findOne(buildScopedLookup(req.params.id, user.ownerId))
      .select('+appPasswordPlain')
      .populate('company', 'name');
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const empObj = employee.toObject ? employee.toObject() : { ...employee };
    empObj.assignedStatus = empObj.company ? (empObj.status === 'active' ? 'on-site' : 'on-hold') : 'site-over';

    // App Access tab expects `appPassword` to be the actual, readable
    // credential - alias the plaintext copy into that field name (the real
    // `appPassword` on the schema is a one-way bcrypt hash and was never
    // usable for display) and don't leak the internal field name itself.
    empObj.appPassword = empObj.appPasswordPlain || null;
    delete empObj.appPasswordPlain;

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

    // Always store the password as a bcrypt hash for actual login
    // comparison, plus a separate plaintext copy purely so the office can
    // look it up again later on the App Access tab (see Employee.js).
    payload.appPasswordPlain = plainAppPassword;
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
    // A brand-new employee is Unassigned unless a company was picked right
    // at creation time, in which case they're immediately On-Site.
    payload.assignedStatus = payload.company ? 'on-site' : 'on-hold';
    payload.lifecycleState = payload.company ? 'ASSIGNED' : 'WAITING_FOR_COMPANY';

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

    // Hash new password if admin is updating app credentials, and keep the
    // plaintext copy (see Employee.js) in sync for the App Access tab.
    if (payload.appPassword) {
      payload.appPasswordPlain = payload.appPassword;
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

    const updatePayload = { company: targetCompany._id, lifecycleState: 'ASSIGNED', assignedStatus: 'on-site' };
    if (!employee.ownerId) {
      updatePayload.ownerId = user.ownerId;
    }

    const updated = await Employee.findByIdAndUpdate(employee._id, updatePayload, { new: true });

    if (!updated) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Employee-facing push: "You have been assigned to Site X" - this is the
    // one event in the lifecycle that's triggered from the dashboard side
    // rather than by the employee's own action.
    await reportLifecycleEvent({
      employee: updated,
      ownerId: user.ownerId,
      event: 'employee:assigned',
      action: 'employee.assigned',
      title: `${updated.name} assigned to a company`,
      body: 'Employee has been assigned to a new company.',
      data: { companyId: String(targetCompany._id) },
      notifyEmployeePush: true,
      pushTitle: 'New site assignment',
      pushBody: 'You have been assigned to a new site. Open the app to check in.',
    });

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

    const updatePayload = { company: null, lifecycleState: 'WAITING_FOR_COMPANY', assignedStatus: 'on-hold' };
    if (!employee.owner) {
      updatePayload.owner = currentUser._id;
    }

    const updated = await Employee.findByIdAndUpdate(employee._id, updatePayload, { new: true });

    if (!updated) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    await reportLifecycleEvent({
      employee: updated,
      ownerId: user.ownerId,
      event: 'employee:unassigned',
      action: 'employee.unassigned',
      title: `${updated.name} unassigned from company`,
      body: 'Employee has been removed from their company assignment by the office.',
      data: {},
      notifyEmployeePush: true,
      pushTitle: 'Assignment ended',
      pushBody: 'Your site assignment has been ended by your office.',
    });

    res.json({ message: 'Employee unassigned successfully', data: updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to unassign employee', error: error.message });
  }
};

/**
 * "Site Assigned" action for an employee currently in the site-over state.
 * Per the clarified spec this is a direct status flip - NOT the same as
 * Assign, and does not open the company-picker popup - because the
 * employee is still linked to their existing company (site-over never
 * clears it), this just re-activates that same assignment.
 */
export const reactivateEmployee = async (req, res) => {
  try {
    const currentUser = req.currentUser;
    if (!currentUser) return res.status(401).json({ message: 'User not authenticated' });

    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    const employee = await Employee.findOne(buildScopedLookup(req.params.id, user.ownerId));
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    if (employee.assignedStatus !== 'site-over') {
      return res.status(400).json({ message: 'This employee is not in the Worker Site-Over state.' });
    }
    if (!employee.company) {
      return res.status(400).json({ message: 'This employee has no prior company to reactivate - use Assign instead.' });
    }

    const updated = await Employee.findByIdAndUpdate(
      employee._id,
      { assignedStatus: 'on-site', lifecycleState: 'ASSIGNED' },
      { new: true }
    ).populate('company', 'name');

    await reportLifecycleEvent({
      employee: updated,
      ownerId: user.ownerId,
      event: 'employee:assigned',
      action: 'employee.reactivated',
      title: `${updated.name} re-assigned to ${updated.company?.name || 'their site'}`,
      body: 'Employee has been re-activated on their previous site.',
      data: { companyId: String(updated.company?._id || updated.company) },
      notifyEmployeePush: true,
      pushTitle: 'Site re-assigned',
      pushBody: 'You have been re-assigned to your site. Open the app to check in.',
    });

    res.json({ message: 'Employee re-activated successfully', data: updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to reactivate employee', error: error.message });
  }
};

export const getEmployeeAttendance = async (req, res) => {
  try {
    const user = req.user;
    const currentUser = req.currentUser;
    if (!currentUser || !user?.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    // NOTE: previously this filtered Attendance.company against the
    // owner's own id / internal invoicing company (via an undefined
    // getAccessibleCompanyIds helper that always fell through silently),
    // which never matches a real Attendance record - Attendance.company
    // is always the employee's assigned CLIENT company, a different
    // document from the owner's own company. The correct - and
    // sufficient - tenant boundary is ownerId; no company filter is
    // needed here at all.
    const employee = await Employee.findOne(buildScopedLookup(req.params.id, user.ownerId)).select('_id');
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const items = await Attendance.find({ employee: employee._id, ownerId: user.ownerId }).sort({ date: -1 });
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