import Employee from '../models/Employee.js';
import { serverError } from '../utils/apiResponse.js';
import Attendance from '../models/Attendance.js';
import Company from '../models/Company.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import EmployeeDocument from '../models/EmployeeDocument.js';
import FileRecord from '../models/FileRecord.js';
import { reportLifecycleEvent } from '../services/lifecycle.service.js';
import { cacheGetOrSet, cacheInvalidate } from '../utils/cache.util.js';
import { getUaeDayBounds } from '../utils/businessTime.util.js';
import { sumEmployeeExpenseCategories } from '../utils/employeeExpenseFields.js';

// All employee cache keys for one owner live under this prefix, so any
// write just has to invalidate `employeeCachePrefix(ownerId)` rather than
// enumerate every list-query variant (status/page/limit/company filters)
// that might have been cached.
export const employeeCachePrefix = (ownerId) => `employees:${ownerId}:`;

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
    const {
      status, page = 1, limit: rawLimit = 50, assignedCompanyId, search,
      assignedStatus, passportStatus, emirateIdStatus,
    } = req.query;
    const limit = Math.min(Math.max(Number(rawLimit) || 50, 1), 200);
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

    // These three mirror the exact facets /api/employees/stats already
    // groups by (canonical assignedStatus/passportStatus/emirateIdStatus
    // enum values - see getEmployeeStats) - lets the Assigned/Passport/
    // Emirates ID tabs filter their table server-side by the same KPI
    // card the user clicked, instead of filtering whatever page happens
    // to already be loaded client-side.
    if (assignedStatus) scopedClauses.push({ assignedStatus });
    if (passportStatus) scopedClauses.push({ passportStatus });
    if (emirateIdStatus) scopedClauses.push({ emirateIdStatus });

    // Server-side search so a match beyond whatever page happens to be
    // loaded is still reachable - the frontend previously only searched
    // client-side over the single already-fetched (200-row-capped) page,
    // so an employee outside that page could never be found regardless of
    // how correct the query was. Escaped before use in a $regex - this is
    // user input.
    if (search && String(search).trim()) {
      const escaped = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'i');
      scopedClauses.push({ $or: [{ employeeId: pattern }, { name: pattern }, { trade: pattern }] });
    }

    const filter = scopedClauses.length === 1 ? scopedClauses[0] : { $and: scopedClauses };
    const skip = (Number(page) - 1) * Number(limit);

    // Bug found via browser testing: assignedStatus/passportStatus/
    // emirateIdStatus were added as filter clauses above but NOT to this
    // cache key, so two requests differing only by those filters (e.g.
    // Assigned tab's "on-hold" filter vs the EmirateID tab's unfiltered
    // request) collided on the same cache key and the second request
    // silently got served the first request's (wrongly-filtered)
    // cached result for up to 30s.
    const cacheKey = `${employeeCachePrefix(user.ownerId)}list:${status || ''}:${page}:${limit}:${assignedCompanyId || ''}:${search || ''}:${assignedStatus || ''}:${passportStatus || ''}:${emirateIdStatus || ''}`;
    const { items, total } = await cacheGetOrSet(cacheKey, 30, async () => {
      const [items, total] = await Promise.all([
        // Minimal projection: the table/tab views on this list only ever
        // render these fields (verified against Employees.jsx). Document
        // copy URLs, expenses/expenseReceipts, avatar and location data are
        // all deliberately excluded here - they were the reason this cache
        // entry was ~460KB for a 50-row page. The full record (including
        // those fields) is still available via GET /api/employees/:id.
        Employee.find(filter)
          .select(
            'employeeId firstName lastName name mobile mobileNumber trade position ' +
            'status assignedStatus passportStatus passportExpiry emiratesId emirateId ' +
            'emirateIdStatus emiratesIdExpiry joiningDate joinDate ownerId company createdAt'
          )
          .populate('company', 'name')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        Employee.countDocuments(filter),
      ]);
      return { items, total };
    });

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
    return serverError(res, 'Failed to fetch employees');
  }
};

// Tenant-wide employee counts (total, site-assignment status, passport/
// Emirates ID status, active/inactive) computed with a single $facet
// aggregation over the FULL population - not the paginated/200-row-capped
// list getEmployees returns. Dashboard KPIs and the Employees page's
// status-tab counts must read from here, not from summing whatever page
// of employees happens to be loaded client-side, which silently
// undercounts once a tenant has more employees than one page holds.
//
// assignedStatus is the canonical site-assignment field (set explicitly
// by assignEmployee/unassignEmployee/reactivateEmployee - see those
// below), not an ad-hoc `company == null` check computed differently in
// different places (getEmployee's single-record shape used to do exactly
// that, inconsistently - see the comment there).
export const getEmployeeStats = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    const cacheKey = `${employeeCachePrefix(user.ownerId)}stats`;
    const stats = await cacheGetOrSet(cacheKey, 30, async () => {
      const ownerId = new mongoose.Types.ObjectId(user.ownerId);
      const [result] = await Employee.aggregate([
        { $match: { ownerId } },
        {
          $facet: {
            total: [{ $count: 'count' }],
            byAssignedStatus: [{ $group: { _id: '$assignedStatus', count: { $sum: 1 } } }],
            byPassportStatus: [{ $group: { _id: '$passportStatus', count: { $sum: 1 } } }],
            byEmirateIdStatus: [{ $group: { _id: '$emirateIdStatus', count: { $sum: 1 } } }],
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          },
        },
      ]);

      const toCountMap = (rows) =>
        rows.reduce((acc, row) => {
          acc[row._id || 'unknown'] = row.count;
          return acc;
        }, {});

      const assignedStatus = toCountMap(result.byAssignedStatus);
      return {
        total: result.total[0]?.count || 0,
        assignedStatus,
        // Named aliases matching the dashboard's own vocabulary, derived
        // from the same canonical field - 'on-hold' IS 'unassigned' here,
        // not a separately-computed value.
        onSite: assignedStatus['on-site'] || 0,
        onHold: assignedStatus['on-hold'] || 0,
        siteOver: assignedStatus['site-over'] || 0,
        passportStatus: toCountMap(result.byPassportStatus),
        emirateIdStatus: toCountMap(result.byEmirateIdStatus),
        status: toCountMap(result.byStatus),
      };
    });

    res.json({ message: 'Employee stats retrieved', data: stats });
  } catch (error) {
    return serverError(res, 'Failed to fetch employee stats');
  }
};

const _getDateKey = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const _monthRange = (monthValue) => {
  const [y, m] = String(monthValue).split('-').map(Number);
  return { start: new Date(y, m - 1, 1, 0, 0, 0, 0), end: new Date(y, m, 0, 23, 59, 59, 999) };
};
const _normalizeStatus = (status) => {
  if (status === 'leave') return 'on-leave';
  if (status === 'half-day') return 'present';
  return status || 'absent';
};
const _formatHours = (hours) => {
  const total = Number(hours || 0);
  if (!Number.isFinite(total) || total <= 0) return '0 hr';
  const rounded = Math.round(total * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} hr`;
};
const _formatTimeDisplay = (value) => {
  if (!value || typeof value !== 'string') return '-';
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  let hours = Number(match[1]);
  const minutes = String(match[2]).padStart(2, '0');
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${meridiem}`;
};

// Employees -> Attendance tab. Previously built entirely client-side from
// a single (backend-capped-at-200) employees fetch joined against the
// selected month's attendance in the browser (Employees.jsx's
// buildAttendanceRows) - any employee outside that first page was
// invisible to the tab regardless of their real attendance. This mirrors
// the same per-employee-per-day join, but: (1) employees are properly
// paginated/searched server-side first (same convention as getEmployees),
// and (2) attendance is only fetched for THAT page's employee IDs and the
// UNION of the selected+current month (matching useAttendance's own
// existing "union of selected and current month" business rule) - not
// the full tenant's attendance history. The join itself still happens in
// Node rather than a single Mongo $lookup pipeline: at one page (10-25
// employees) x ~60 days of attendance, that's a tiny, cheap, easily
// correct dataset - a $lookup aggregation buys nothing at this size and
// risks a much harder-to-verify pipeline for the same result.
export const getEmployeeAttendancePage = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authorized' });

    const { page = 1, limit: rawLimit = 10, search, month, status: statusFilter } = req.query;
    const limit = Math.min(Math.max(Number(rawLimit) || 10, 1), 100);
    const skip = (Number(page) - 1) * limit;

    const scopedClauses = [buildOwnerFilter(user.ownerId)];
    if (search && String(search).trim()) {
      const escaped = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'i');
      scopedClauses.push({ $or: [{ employeeId: pattern }, { name: pattern }, { trade: pattern }] });
    }

    // The KPI row's "Present Today"/"Absent Today"/"On Leave" cards must
    // filter this same table server-side against the full population,
    // not just whatever page is loaded - resolved via a small, cheap,
    // indexed today-only Attendance query (never the whole tenant's
    // history) into an employee id allowlist/denylist before the main
    // paginated employee query runs.
    if (statusFilter === 'present' || statusFilter === 'on-leave') {
      // Timezone audit finding: was `new Date(); setHours(0,0,0,0)`, which
      // computes "today" against the Node process's local timezone rather
      // than the business (UAE) one - see businessTime.util.js.
      const { start: todayStart, end: todayEnd } = getUaeDayBounds();
      const wantedDbStatuses = statusFilter === 'present' ? ['present', 'half-day'] : ['leave'];
      const matchingIds = await Attendance.distinct('employee', {
        ownerId: user.ownerId,
        date: { $gte: todayStart, $lte: todayEnd },
        status: { $in: wantedDbStatuses },
      });
      scopedClauses.push({ _id: { $in: matchingIds } });
    } else if (statusFilter === 'absent') {
      const { start: todayStart, end: todayEnd } = getUaeDayBounds();
      const accountedIds = await Attendance.distinct('employee', {
        ownerId: user.ownerId,
        date: { $gte: todayStart, $lte: todayEnd },
        status: { $in: ['present', 'half-day', 'leave'] },
      });
      scopedClauses.push({ _id: { $nin: accountedIds } });
    }

    const filter = scopedClauses.length === 1 ? scopedClauses[0] : { $and: scopedClauses };

    const [employees, total] = await Promise.all([
      Employee.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Employee.countDocuments(filter),
    ]);

    const selectedMonth = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const selectedRange = _monthRange(selectedMonth);
    const currentRange = _monthRange(currentMonth);
    const from = selectedRange.start < currentRange.start ? selectedRange.start : currentRange.start;
    const to = selectedRange.end > currentRange.end ? selectedRange.end : currentRange.end;

    const employeeIds = employees.map((e) => e._id);
    const attendanceRecords = employeeIds.length
      ? await Attendance.find({
          ownerId: user.ownerId,
          employee: { $in: employeeIds },
          date: { $gte: from, $lte: to },
        }).select('employee date status checkIn checkOut hoursWorked').lean()
      : [];

    const byEmployee = new Map();
    attendanceRecords.forEach((r) => {
      const id = String(r.employee);
      if (!byEmployee.has(id)) byEmployee.set(id, []);
      byEmployee.get(id).push(r);
    });

    const todayKey = _getDateKey(new Date());

    const rows = employees.map((employee) => {
      const empRecords = byEmployee.get(String(employee._id)) || [];
      const selectedMonthRecords = empRecords.filter((r) => _getDateKey(r.date).startsWith(selectedMonth));
      const currentMonthRecords = empRecords.filter((r) => _getDateKey(r.date).startsWith(currentMonth));
      const todayRecord = empRecords.find((r) => _getDateKey(r.date) === todayKey) || null;

      const selPresent = selectedMonthRecords.filter((r) => _normalizeStatus(r.status) === 'present');
      const curPresent = currentMonthRecords.filter((r) => _normalizeStatus(r.status) === 'present');
      const curAbsent = currentMonthRecords.filter((r) => _normalizeStatus(r.status) === 'absent');
      const curLeave = currentMonthRecords.filter((r) => _normalizeStatus(r.status) === 'on-leave');

      const fullName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.name || '-';

      return {
        id: employee.employeeId || String(employee._id),
        apiId: String(employee._id),
        name: fullName,
        attendanceStatus: todayRecord ? _normalizeStatus(todayRecord.status) : 'absent',
        selectedMonthWorkHours: _formatHours(selPresent.reduce((s, r) => s + Number(r.hoursWorked || 0), 0)),
        selectedMonthPresentCount: selPresent.length,
        selectedMonthAbsentCount: selectedMonthRecords.filter((r) => _normalizeStatus(r.status) === 'absent').length,
        selectedMonthLeaveCount: selectedMonthRecords.filter((r) => _normalizeStatus(r.status) === 'on-leave').length,
        currentMonthWorkHours: _formatHours(Number(todayRecord?.hoursWorked || 0)),
        currentMonthPresentCount: curPresent.length,
        currentMonthAbsentCount: curAbsent.length,
        currentMonthLeaveCount: curLeave.length,
        currentCheckIn: _formatTimeDisplay(todayRecord?.checkIn),
        currentCheckOut: _formatTimeDisplay(todayRecord?.checkOut),
      };
    });

    res.json({
      message: 'Employee attendance page retrieved',
      data: rows,
      meta: { total, page: Number(page), limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    return serverError(res, 'Failed to fetch employee attendance page');
  }
};

export const getEmployee = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    const cacheKey = `${employeeCachePrefix(user.ownerId)}one:${req.params.id}`;
    const empObj = await cacheGetOrSet(cacheKey, 30, async () => {
      const employee = await Employee.findOne(buildScopedLookup(req.params.id, user.ownerId))
        .select('+appPasswordPlain')
        .populate('company', 'name');
      if (!employee) return null;

      const obj = employee.toObject ? employee.toObject() : { ...employee };
      obj.assignedStatus = obj.company ? (obj.status === 'active' ? 'on-site' : 'on-hold') : 'site-over';

      // App Access tab expects `appPassword` to be the actual, readable
      // credential - alias the plaintext copy into that field name (the real
      // `appPassword` on the schema is a one-way bcrypt hash and was never
      // usable for display) and don't leak the internal field name itself.
      obj.appPassword = obj.appPasswordPlain || null;
      delete obj.appPasswordPlain;
      return obj;
    });

    if (!empObj) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.json({ data: empObj });
  } catch (error) {
    return serverError(res, 'Failed to fetch employee');
  }
};

export const createEmployee = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    const payload = { ...req.body };

    // D19.3/D19.4 finding: this spreads the full request body into
    // Employee.create() below. The prior D19.4 mass-assignment audit only
    // grepped for the literal pattern `.create(req.body)` and missed this
    // (a spread-then-create is functionally identical mass assignment but
    // doesn't match that string). ownerId/owner were already force-set
    // after the spread (safe, tenant boundary was never actually
    // crossable), but a handful of security-control fields on the Employee
    // schema were left client-settable at creation time:
    //   - tokenVersion: session-invalidation counter
    //   - failedLoginAttempts / lockUntil: brute-force lockout state
    //   - boundDeviceId: device-binding lock (see mobileAuth.controller.js)
    //     - lets a client pre-bind a device before the employee's first
    //       real login, which is exactly what this field exists to prevent
    // All four are stripped here; everything else on the schema (name,
    // documents, salary, contact info, etc.) is intentionally still
    // client-suppliable, since that's the legitimate purpose of this
    // endpoint and the office/owner already fully controls their own
    // tenant's data.
    delete payload.tokenVersion;
    delete payload.failedLoginAttempts;
    delete payload.lockUntil;
    delete payload.boundDeviceId;
    delete payload._id;

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

    await cacheInvalidate(employeeCachePrefix(user.ownerId));

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

    return serverError(res, 'Failed to create employee');
  }
};

export const updateEmployee = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    const payload = { ...req.body };
    // ownerId/owner establish tenant ownership and must never be
    // client-modifiable on an update - findOneAndUpdate's plain-object
    // update document is implicitly $set by Mongoose, so leaving these in
    // the spread would let a client reassign this employee to a
    // different tenant via a normal update request.
    delete payload.ownerId;
    delete payload.owner;
    // Sibling fix to the createEmployee mass-assignment finding above:
    // tokenVersion/failedLoginAttempts/lockUntil are exclusively
    // server-managed by mobileAuth.controller.js's login/logout flow and
    // have no legitimate admin-facing edit path - leaving them
    // client-settable here would let a client reset a lockout or
    // manipulate session-invalidation state directly. boundDeviceId is
    // deliberately NOT stripped: mobileAuth.controller.js's own comment
    // confirms "an office admin can clear boundDeviceId to allow
    // re-binding" and this generic update endpoint is that admin's only
    // way to do so - removing it would break that intended feature.
    delete payload.tokenVersion;
    delete payload.failedLoginAttempts;
    delete payload.lockUntil;

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

    // Recompute the cached "Total Investment" total (Employee Expenses
    // tab's KPI card, and Finance's Money Made table) whenever the tab
    // that owns these fields is saved - a real top-level Number field
    // rather than something summed from the `expenses` Mixed blob on
    // every read, so it survives if those source amounts are ever
    // cleared/archived later.
    if (Object.prototype.hasOwnProperty.call(payload, 'expenses')) {
      payload.totalInvestmentAmount = sumEmployeeExpenseCategories(payload.expenses);
    }

    const updated = await Employee.findOneAndUpdate(buildScopedLookup(req.params.id, user.ownerId), payload, { new: true });
    if (!updated) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    await cacheInvalidate(employeeCachePrefix(user.ownerId));
    if (Object.prototype.hasOwnProperty.call(payload, 'expenses')) {
      await cacheInvalidate(`expenses:${user.ownerId}:`);
    }

    res.json({ message: 'Employee updated', data: updated });
  } catch (error) {
    return serverError(res, 'Failed to update employee');
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

    await cacheInvalidate(employeeCachePrefix(user.ownerId));

    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    return serverError(res, 'Failed to delete employee');
  }
};

export const assignEmployee = async (req, res) => {
  try {
    const user = req.user || {};
    if (!user.userId) return res.status(401).json({ message: 'User not authenticated' });

    const { companyId } = req.body;
    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ message: 'Valid companyId is required' });
    }

    const targetCompany = await Company.findOne({ _id: companyId, ownerId: user.ownerId }).select('_id companyRole isOwner');
    if (!targetCompany) {
      return res.status(403).json({ message: 'Company not accessible' });
    }

    // .select('_id ownerId') - only these two fields are read below
    // (employee.ownerId in the guard check, employee._id passed to
    // findByIdAndUpdate). Note: this handler uses `ownerId`, not `owner` -
    // see unassignEmployee below, which uses the other half of that
    // duplicate field pair (Phase 1 finding) and needs a different
    // projection as a result.
    const employee = await Employee.findOne(buildScopedLookup(req.params.id, user.ownerId)).select('_id ownerId');
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

    await cacheInvalidate(employeeCachePrefix(user.ownerId));

    // Employee-facing push: "You have been assigned to Site X" - this is the
    // one event in the lifecycle that's triggered from the dashboard side
    // rather than by the employee's own action.
    await reportLifecycleEvent({
      employee: updated,
      ownerId: user.ownerId,
      event: 'employee:assigned',
      action: 'employee.assigned',
      title: `${updated.name} assigned to a company`,
      notifyDashboard: false, // dashboard bell is check-in only
      body: 'Employee has been assigned to a new company.',
      data: { type: 'site_assigned', companyId: String(targetCompany._id) },
      notifyEmployeePush: true,
      pushTitle: 'New site assignment',
      pushBody: 'You have been assigned to a new site. Open the app to check in.',
    });

    res.json({ message: 'Employee assigned successfully', data: updated });
  } catch (error) {
    return serverError(res, 'Failed to assign employee');
  }
};

export const unassignEmployee = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    // .select('_id owner') - this handler reads employee.owner (not
    // ownerId - see the duplicate-field note in assignEmployeeToCompany
    // above) and employee._id only.
    const employee = await Employee.findOne(buildScopedLookup(req.params.id, user.ownerId)).select('_id owner');
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const updatePayload = { company: null, lifecycleState: 'WAITING_FOR_COMPANY', assignedStatus: 'on-hold' };
    if (!employee.owner) {
      updatePayload.owner = user.userId;
    }

    const updated = await Employee.findByIdAndUpdate(employee._id, updatePayload, { new: true });

    if (!updated) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    await cacheInvalidate(employeeCachePrefix(user.ownerId));

    await reportLifecycleEvent({
      employee: updated,
      ownerId: user.ownerId,
      event: 'employee:unassigned',
      action: 'employee.unassigned',
      title: `${updated.name} unassigned from company`,
      notifyDashboard: false, // dashboard bell is check-in only
      body: 'Employee has been removed from their company assignment by the office.',
      data: { type: 'site_unassigned' },
      notifyEmployeePush: true,
      pushTitle: 'Assignment ended',
      pushBody: 'Your site assignment has been ended by your office.',
    });

    res.json({ message: 'Employee unassigned successfully', data: updated });
  } catch (error) {
    return serverError(res, 'Failed to unassign employee');
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
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    // .select('_id assignedStatus company') - the three fields this
    // handler reads (verified below: assignedStatus and company checks,
    // _id passed to findByIdAndUpdate).
    const employee = await Employee.findOne(buildScopedLookup(req.params.id, user.ownerId)).select('_id assignedStatus company');
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

    await cacheInvalidate(employeeCachePrefix(user.ownerId));

    await reportLifecycleEvent({
      employee: updated,
      ownerId: user.ownerId,
      event: 'employee:assigned',
      action: 'employee.reactivated',
      title: `${updated.name} re-assigned to ${updated.company?.name || 'their site'}`,
      notifyDashboard: false, // dashboard bell is check-in only
      body: 'Employee has been re-activated on their previous site.',
      data: { type: 'site_assigned', companyId: String(updated.company?._id || updated.company) },
      notifyEmployeePush: true,
      pushTitle: 'Site re-assigned',
      pushBody: 'You have been re-assigned to your site. Open the app to check in.',
    });

    res.json({ message: 'Employee re-activated successfully', data: updated });
  } catch (error) {
    return serverError(res, 'Failed to reactivate employee');
  }
};

export const getEmployeeAttendance = async (req, res) => {
  try {
    const user = req.user;
    if (!user?.ownerId) return res.status(401).json({ message: 'User not authenticated' });

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

    // .lean() - result goes straight to res.json(), never mutated.
    const items = await Attendance.find({ employee: employee._id, ownerId: user.ownerId }).sort({ date: -1 }).lean();
    res.json({ data: items });
  } catch (error) {
    return serverError(res, 'Failed to fetch employee attendance');
  }
};

export const addEmployeeDocument = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });
    const employeeId = req.params.id;
    const { fileRecordId, type } = req.body || {};
    if (!fileRecordId) return res.status(400).json({ message: 'fileRecordId is required' });

    // .select('_id') - only employee._id is used below.
    const employee = await Employee.findOne(buildScopedLookup(employeeId, user.ownerId)).select('_id');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const fr = await FileRecord.findOne({ _id: fileRecordId, ownerId: user.ownerId });
    if (!fr) return res.status(404).json({ message: 'FileRecord not found' });

    const doc = await EmployeeDocument.create({ employee: employee._id, fileRecord: fr._id, type: type || 'generic', ownerId: user.ownerId });
    return res.status(201).json({ message: 'Document attached', data: doc });
  } catch (error) {
    return serverError(res, 'Failed to attach document');
  }
}

export const listEmployeeDocuments = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });
    const employeeId = req.params.id;
    // .select('_id') - only employee._id is used below.
    const employee = await Employee.findOne(buildScopedLookup(employeeId, user.ownerId)).select('_id');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    const items = await EmployeeDocument.find({ employee: employee._id, ownerId: user.ownerId }).populate('fileRecord', '-path -storageKey');
    return res.json({ message: 'Documents retrieved', data: items });
  } catch (error) {
    return serverError(res, 'Failed to list documents');
  }
}