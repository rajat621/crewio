import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import Company from '../models/Company.js';

export const getEmployees = async (req, res) => {
  try {
    const { assignedCompanyId, companyId, status, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (assignedCompanyId || companyId) {
      filter.company = assignedCompanyId || companyId;
    }
    if (status) {
      filter.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Employee.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Employee.countDocuments(filter),
    ]);

    res.json({
      message: 'Employees retrieved',
      data: items,
      meta: { total, page: Number(page), limit: Number(limit) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch employees', error: error.message });
  }
};

export const getEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
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
    const payload = { ...req.body };

    payload.name = payload.name || `${payload.firstName || ''} ${payload.lastName || ''}`.trim();
    payload.mobileNumber = payload.mobileNumber || payload.mobile;
    payload.position = payload.position || payload.trade;
    payload.joinDate = payload.joinDate || payload.joiningDate;

    let companyId = payload.company || payload.companyId || payload.assignedCompanyId;
    if (!companyId) {
      const latestCompany = await Company.findOne({}).sort({ createdAt: -1 }).select('_id');
      if (latestCompany?._id) {
        companyId = latestCompany._id;
      }
    }
    payload.company = companyId;

    if (!payload.name || !payload.company) {
      return res.status(400).json({ message: 'Employee name and company are required' });
    }

    if (!payload.email) {
      delete payload.email;
    }

    const employee = await Employee.create(payload);

    res.status(201).json({
      message: 'Employee created',
      data: employee,
      employee,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create employee', error: error.message });
  }
};

export const updateEmployee = async (req, res) => {
  try {
    const updated = await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true });
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
    const deleted = await Employee.findByIdAndDelete(req.params.id);
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
    const { companyId } = req.body;
    if (!companyId) {
      return res.status(400).json({ message: 'companyId is required' });
    }

    const updated = await Employee.findByIdAndUpdate(
      req.params.id,
      { company: companyId },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.json({ message: 'Employee assigned successfully', data: updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to assign employee', error: error.message });
  }
};

export const getEmployeeAttendance = async (req, res) => {
  try {
    const items = await Attendance.find({ employee: req.params.id }).sort({ date: -1 });
    res.json({ data: items });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch employee attendance', error: error.message });
  }
};
