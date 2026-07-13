
import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';

/**
 * IMPORTANT SCOPING NOTE
 * -----------------------
 * `user.companyId` (see auth.middleware.js) is the OWNER's own internal
 * "my business" Company record (companyRole: 'owner', isOwner: true) that
 * is auto-created for invoicing purposes (see ensureOwnerCompanyForUser in
 * auth.controller.js). It is NOT the client company/site an employee is
 * assigned to. Attendance.company always stores the employee's assigned
 * CLIENT company, which is a different document entirely and will never
 * equal the owner's own internal company id.
 *
 * Previously these handlers filtered `Attendance.company` by
 * `user.companyId`, which meant the query could never match any real
 * attendance record and the dashboard silently received an empty list even
 * though the underlying Start Work / Stop Work APIs were succeeding. The
 * correct tenant boundary is `ownerId` alone - that already scopes every
 * attendance record to the office/owner account making the request. An
 * explicit `?company=<clientCompanyId>` query param is still supported for
 * callers that want to narrow to one specific site.
 */
const getDayBounds = (value = new Date()) => {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const end = new Date(value);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

export const getAttendance = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(403).json({ message: 'User not authorized' });

    const { employee, from, to, company } = req.query;
    const filter = { ownerId: user.ownerId };

    // Only narrow by company when the caller explicitly asks for one
    // specific client site - never implicitly from the owner's own
    // internal invoicing company.
    if (company) filter.company = company;
    if (employee) filter.employee = employee;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const items = await Attendance.find(filter).sort({ date: -1 });
    res.json({
      message: 'Attendance retrieved',
      data: items,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch attendance', error: error.message });
  }
};

export const createAttendance = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(403).json({ message: 'User not authorized' });

    // The attendance record's company must be the employee's assigned
    // CLIENT company, never the owner's own internal invoicing company.
    // Prefer an explicit body.company, otherwise derive it from the
    // employee record so manual entries stay consistent with what
    // Start Work / Stop Work would have produced.
    let companyId = req.body.company || null;
    if (!companyId && req.body.employee) {
      const employeeDoc = await Employee.findOne({ _id: req.body.employee, ownerId: user.ownerId }).select('company');
      companyId = employeeDoc?.company || null;
    }

    if (!companyId) {
      return res.status(400).json({ message: 'A company (the employee\'s assigned site) is required' });
    }

    const record = await Attendance.create({ ...req.body, company: companyId, ownerId: user.ownerId });
    res.status(201).json({
      message: 'Attendance record created',
      data: record,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create attendance', error: error.message });
  }
};

export const updateAttendance = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(403).json({ message: 'User not authorized' });

    const updated = await Attendance.findOneAndUpdate({ _id: req.params.id, ownerId: user.ownerId }, { ...req.body, ownerId: user.ownerId }, { new: true });
    if (!updated) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }
    res.json({ message: 'Attendance updated', data: updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update attendance', error: error.message });
  }
};

export const deleteAttendance = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(403).json({ message: 'User not authorized' });

    const deleted = await Attendance.findOneAndDelete({ _id: req.params.id, ownerId: user.ownerId });
    if (!deleted) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    res.json({ message: 'Attendance deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete attendance', error: error.message });
  }
};

// GET /api/attendance/summary
// Mirrors the KPI logic the dashboard computes client-side (present/absent
// today + total employees), scoped correctly by ownerId only. Absence has
// no explicit stored record - an employee with no attendance record today
// is absent today, exactly like the dashboard's own buildAttendanceRows.
export const getAttendanceSummary = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(403).json({ message: 'User not authorized' });

    const { start, end } = getDayBounds(new Date());
    const employeeFilter = { ownerId: user.ownerId };
    if (req.query.company) employeeFilter.company = req.query.company;

    const [totalEmployees, todayRecords] = await Promise.all([
      Employee.countDocuments(employeeFilter),
      Attendance.find({ ownerId: user.ownerId, date: { $gte: start, $lte: end } }).select('status'),
    ]);

    const present = todayRecords.filter((r) => r.status === 'present' || r.status === 'half-day').length;
    const leave = todayRecords.filter((r) => r.status === 'leave').length;
    const accountedFor = todayRecords.length;
    const absent = Math.max(totalEmployees - accountedFor, 0);

    res.json({ data: { present, absent, leave, total: totalEmployees } });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch attendance summary', error: error.message });
  }
};