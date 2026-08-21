
import mongoose from 'mongoose';
import { serverError } from '../utils/apiResponse.js';
import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';
import Company from '../models/Company.js';
import { getUaeDayBounds, getUaeDateKey, UAE_TIMEZONE_OFFSET } from '../utils/businessTime.util.js';

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
// Timezone audit finding: this used to compute "today" with
// `new Date(); date.setHours(0,0,0,0)`, which resolves against the Node
// PROCESS's local timezone - not the business's (UAE). Delegates to
// businessTime.util.js's fixed-offset UAE calculation instead, so "today"
// is the same calendar day regardless of what timezone the server
// happens to be deployed/running in.
const getDayBounds = (value = new Date()) => getUaeDayBounds(value);

// Same clamp/validate convention as notification.controller.js's
// parsePagination - only applied when the caller actually passes page or
// limit, so today's real callers (Company.jsx, CompanyDetail.jsx,
// Employees.jsx, Home.jsx - none of which pass either param, all of which
// already scope by from/to date range) see no behavior change.
const parseAttendancePagination = (req) => {
  const { page: rawPage, limit: rawLimit } = req.query;
  if (rawPage === undefined && rawLimit === undefined) return null;

  const page = Math.max(1, parseInt(rawPage, 10) || 1);
  const limit = Math.min(1000, Math.max(1, parseInt(rawLimit, 10) || 100));
  return { page, limit, skip: (page - 1) * limit };
};

export const getAttendance = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(403).json({ message: 'User not authorized' });

    const { employee, from, to, company, status } = req.query;
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
    // Opt-in status filter - lets a caller that only cares about certain
    // statuses (e.g. the Home dashboard's absent-streak calc, which reads
    // present/on-leave and discards everything else client-side today -
    // see dashboardDerivation.js) push that filtering into the query
    // instead of transferring every status and throwing most rows away
    // after the fact.
    if (status) {
      const statuses = String(status).split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length) filter.status = { $in: statuses };
    }

    const pagination = parseAttendancePagination(req);

    // Every real caller in this codebase already scopes by from/to, so
    // this costs nothing for them. What it closes is the true unbounded
    // case (no date filter, no pagination) - previously handled with a
    // silent 5000-row ceiling, which is a data-integrity problem: a
    // caller can't tell "5000 records returned" from "5000 records
    // exist." Rejecting explicitly instead, with a clear message.
    if (!pagination && !filter.date) {
      return res.status(400).json({
        message: 'Request is too broad: provide either a date range (from/to) or pagination (page/limit).',
      });
    }

    if (pagination) {
      const { page, limit, skip } = pagination;
      // .lean() - result goes straight to res.json(), never mutated;
      // Attendance has no virtuals/instance methods/middleware (verified
      // against models/Attendance.js).
      const [items, total] = await Promise.all([
        Attendance.find(filter).sort({ date: -1 }).skip(skip).limit(limit).lean(),
        Attendance.countDocuments(filter),
      ]);
      return res.json({
        message: 'Attendance retrieved',
        data: items,
        meta: { page, limit, total, hasMore: skip + items.length < total },
      });
    }

    // Closure-pass finding, traced and deliberately left as-is: this branch
    // is only reachable with a date filter present (the `!pagination &&
    // !filter.date` guard above already rejects the truly unbounded case -
    // neither date range nor pagination). A caller here has explicitly
    // opted out of pagination in favor of "give me the whole range in one
    // response," and that range is calendar-bounded, not infinite - every
    // current caller (dashboard's rolling 120-day window, month-picker
    // views) sends a range on the order of days to a few months. A caller
    // that legitimately needs a very wide historical range (e.g. a
    // multi-year compliance export) already has the pagination path above
    // available and would silently lose data to an arbitrary hard .limit()
    // added here without their knowledge - exactly the kind of
    // data-integrity problem the guard above was written to avoid in the
    // first place. Left unbounded intentionally; if a genuinely huge
    // unpaginated pull becomes a real production issue, the fix is a
    // reasonable max-range check on `to - from` (reject, not silently
    // truncate), not a row-count .limit().
    // Dashboard's rolling 120-day window only ever reads
    // employee/date/status per record (see dashboardHelpers.js /
    // dashboardDerivation.js - it computes chart buckets and today's
    // on-site count, nothing else) but was pulling every field on every
    // one of ~40k rows just to throw the rest away client-side -
    // measured at ~5.5s for this single request against the seeded
    // 1000-employee dataset, the dominant cost on the Home page. Other
    // callers on this same unbounded branch (the real Attendance page,
    // company-detail attendance) genuinely need checkIn/checkOut/
    // hoursWorked/remarks for display, so the full-document shape stays
    // the default; only a caller that explicitly opts in via
    // fields=minimal gets the trimmed projection.
    const query = Attendance.find(filter).sort({ date: -1 });
    if (req.query.fields === 'minimal') {
      query.select('employee date status');
    }
    const items = await query.lean();
    res.json({
      message: 'Attendance retrieved',
      data: items,
    });
  } catch (error) {
    return serverError(res, 'Failed to fetch attendance');
  }
};

export const createAttendance = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(403).json({ message: 'User not authorized' });

    // Both employee and company must always be validated against this
    // owner's tenant before use - previously, company validation ran
    // Employee.findOne against ownerId, but ONLY when a company wasn't
    // also supplied in the same request. A request providing both
    // fields together skipped that check entirely for both, and the
    // subsequent Attendance.create({...req.body, ...}) spread the
    // unvalidated employee id straight into the document - an
    // authenticated owner could reference another tenant's employee
    // (and an arbitrary company id, which was never validated at all).
    let employeeId = req.body.employee || null;
    if (employeeId) {
      const validEmployee = await Employee.findOne({ _id: employeeId, ownerId: user.ownerId }).select('_id');
      if (!validEmployee) {
        return res.status(400).json({ message: 'Employee not found for this account' });
      }
    }

    let companyId = req.body.company || null;
    if (companyId) {
      const validCompany = await Company.findOne({ _id: companyId, ownerId: user.ownerId }).select('_id');
      if (!validCompany) {
        return res.status(400).json({ message: 'Company not found for this account' });
      }
    }
    if (!companyId && employeeId) {
      const employeeDoc = await Employee.findOne({ _id: employeeId, ownerId: user.ownerId }).select('company');
      companyId = employeeDoc?.company || null;
    }

    if (!companyId) {
      return res.status(400).json({ message: 'A company (the employee\'s assigned site) is required' });
    }

    const { employee: _ignoredEmployee, company: _ignoredCompany, ownerId: _ignoredOwnerId, ...safeBody } = req.body;
    const record = await Attendance.create({
      ...safeBody,
      ...(employeeId ? { employee: employeeId } : {}),
      company: companyId,
      ownerId: user.ownerId,
    });
    res.status(201).json({
      message: 'Attendance record created',
      data: record,
    });
  } catch (error) {
    return serverError(res, 'Failed to create attendance');
  }
};

export const updateAttendance = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(403).json({ message: 'User not authorized' });

    const updatePayload = { ...req.body, ownerId: user.ownerId };
    // employee identifies whose attendance this record represents and
    // must never be client-reassignable on an update - same class of
    // issue as the ownerId protection just above, for the same reason:
    // a plain-object findOneAndUpdate document is implicitly $set by
    // Mongoose, so leaving this in the spread would let a client
    // reassign the record to a different employee (potentially even one
    // belonging to a different tenant, since the new value was never
    // re-validated) through a normal update request.
    delete updatePayload.employee;

    const updated = await Attendance.findOneAndUpdate({ _id: req.params.id, ownerId: user.ownerId }, updatePayload, { new: true });
    if (!updated) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }
    res.json({ message: 'Attendance updated', data: updated });
  } catch (error) {
    return serverError(res, 'Failed to update attendance');
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
    return serverError(res, 'Failed to delete attendance');
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

    // Aggregation replaces fetch-all-then-filter-in-Node: $match narrows to
    // today's records for this owner (same filter as before, still covered
    // by the {ownerId, date} compound index from the earlier indexing
    // work), $group counts by status server-side instead of hydrating
    // every record into Node to run two .filter().length passes.
    //
    // NOTE: ownerId must be explicitly cast to ObjectId here - unlike
    // .find(), .aggregate() does not auto-cast query values against the
    // schema, and req.user.ownerId is a plain string (see
    // auth.middleware.js). Missing this would silently match zero
    // documents rather than error.
    const [totalEmployees, statusCounts] = await Promise.all([
      Employee.countDocuments(employeeFilter),
      Attendance.aggregate([
        { $match: { ownerId: new mongoose.Types.ObjectId(user.ownerId), date: { $gte: start, $lte: end } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    // Same formulas as before, restated over grouped counts instead of a
    // per-record filter - verified to produce identical output values.
    const countFor = (status) => statusCounts.find((s) => s._id === status)?.count || 0;
    const present = countFor('present') + countFor('half-day');
    const leave = countFor('leave');
    const accountedFor = statusCounts.reduce((sum, s) => sum + s.count, 0);
    const absent = Math.max(totalEmployees - accountedFor, 0);

    res.json({ data: { present, absent, leave, total: totalEmployees } });
  } catch (error) {
    return serverError(res, 'Failed to fetch attendance summary');
  }
};

// Dashboard's weekly/monthly attendance chart (buildWeeklyChartData/
// buildMonthlyChartData in the frontend) only ever needs one number per
// calendar day: how many 'present' records existed that day - it never
// reads checkIn/checkOut/hoursWorked/remarks/or any other field, and
// "absent" is derived as (totalEmployees - present), not read from the
// data at all. The dashboard was previously fetching every raw attendance
// document in a 120-day window (~40k rows against the seeded 1000-employee
// dataset, ~5.5s) just to do this exact per-day count in the browser.
// This aggregates the same count server-side and returns one row per day
// - regardless of how many employees or attendance records a tenant has,
// the response here is bounded by the number of DAYS requested (a few
// dozen), not by document count.
export const getAttendanceDailyCounts = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(403).json({ message: 'User not authorized' });

    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ message: 'from and to are required' });
    }

    const rows = await Attendance.aggregate([
      {
        $match: {
          ownerId: new mongoose.Types.ObjectId(user.ownerId),
          date: { $gte: new Date(from), $lte: new Date(to) },
          status: 'present',
        },
      },
      {
        // Timezone audit finding: $dateToString with no `timezone` buckets
        // by UTC calendar day, not the business (UAE) calendar day the
        // "date" labels are meant to represent. Explicit here so this
        // grouping agrees with getUaeDateKey (businessTime.util.js), which
        // is what the frontend now uses to look up "today"'s row - see
        // dashboardDerivation.js.
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: UAE_TIMEZONE_OFFSET } },
          present: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      message: 'Attendance daily counts retrieved',
      data: rows.map((r) => ({ date: r._id, present: r.present })),
    });
  } catch (error) {
    return serverError(res, 'Failed to fetch attendance daily counts');
  }
};

// GET /api/attendance/recorded-dates?from=&to= - backs the Home dashboard's
// "Absent from last N days" alert (dashboardDerivation.js's
// getAbsentStreakDays). That calculation only ever needs, per employee,
// WHICH calendar days already have a present/on-leave record - not the
// records themselves. Previously the dashboard fetched every raw
// present/on-leave attendance document for the current month (one row per
// check-in event, every employee) just to reduce it into exactly this
// shape in the browser - measured at 1.26MB/10,010 rows for this tenant.
// This aggregates that reduction in Mongo instead: one row per
// (employee, calendar day) pair, deduplicating same-day multiple check-ins,
// bucketed by the UAE business day (UAE_TIMEZONE_OFFSET) rather than the
// raw record's own timezone-ambiguous instant.
//
// Deliberate, disclosed behavior change (not a silent side effect): the
// PREVIOUS client-side reduction (dashboardHelpers.js's plain getDateKey)
// bucketed by the VIEWER'S BROWSER-LOCAL timezone, not UAE - the same bug
// class already fixed everywhere else in this app (see
// businessTime.util.js's own header comment). A viewer outside UTC+4 could
// see a day boundary shift by hours as a result. This endpoint uses the
// same UAE-fixed-offset convention as daily-counts/getAttendanceSummary
// instead, which is correct for a UAE-based business but is a genuine
// value change for any viewer who was previously (accidentally) seeing a
// different boundary - flagged here rather than silently reverted the
// next time someone touches this file.
export const getAttendanceRecordedDates = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(403).json({ message: 'User not authorized' });

    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ message: 'from and to are required' });
    }

    const rows = await Attendance.aggregate([
      {
        $match: {
          ownerId: new mongoose.Types.ObjectId(user.ownerId),
          date: { $gte: new Date(from), $lte: new Date(to) },
          status: { $in: ['present', 'on-leave'] },
        },
      },
      {
        $group: {
          _id: '$employee',
          dateKeys: {
            $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: UAE_TIMEZONE_OFFSET } },
          },
        },
      },
    ]);

    res.json({
      message: 'Attendance recorded dates retrieved',
      data: rows.map((r) => ({ employeeId: String(r._id), dateKeys: r.dateKeys })),
    });
  } catch (error) {
    return serverError(res, 'Failed to fetch attendance recorded dates');
  }
};