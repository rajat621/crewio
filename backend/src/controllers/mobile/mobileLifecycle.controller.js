
import Employee from '../../models/Employee.js';
import Attendance from '../../models/Attendance.js';
import WorkSession from '../../models/WorkSession.js';
import EmployeeLocation from '../../models/EmployeeLocation.js';
import Company from '../../models/Company.js';
import { serverError } from '../../utils/apiResponse.js';
import { reportLifecycleEvent, reportLocationEvent } from '../../services/lifecycle.service.js';
// Was a locally-defined, server-local-timezone getDayBounds/getTimeString
// (new Date().setHours(0,0,0,0) / date.getHours()) - a real bug: during
// the ~4-hour window each day where UAE's calendar day has already
// advanced but the server-process's own timezone (commonly UTC in
// containers) hasn't, a mobile check-in/check-out would be filed under
// the WRONG business day and displayed with the WRONG time-of-day.
// Verified via direct execution: 00:30 UAE (20:30 UTC previous day) must
// resolve to the NEW UAE day - the old local helpers would get that wrong
// on a UTC-timezone server. Now uses the same UAE-explicit utility the
// dashboard/attendance/web-check-in paths already use.
import { getUaeDayBounds, getUaeTimeString } from '../../utils/businessTime.util.js';
const getDayBounds = (value = new Date()) => getUaeDayBounds(value);
const getTimeString = (date = new Date()) => getUaeTimeString(date);

// How far the mobile app's AttendanceOfflineQueue is trusted to replay a
// queued action after the fact - long enough to cover a full shift with no
// signal, short enough that a wrong/manipulated device clock can't
// backdate attendance by days.
const MAX_PAST_HOURS = 24;
const MAX_FUTURE_MINUTES = 5;

/**
 * Trusts the mobile app's client-reported event timestamp (`body.timestamp`)
 * for lifecycle actions that may have been queued while the device was
 * offline - the whole point of that queue is that "when this arrived at the
 * server" and "when the employee actually checked in/out" can legitimately
 * be hours apart. Falls back to the server's own clock if the timestamp is
 * missing, unparsable, or outside a sane window.
 */
const resolveEventTimestamp = (body) => {
  const raw = body?.timestamp;
  if (!raw) return { timestamp: new Date(), trusted: false };

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { timestamp: new Date(), trusted: false };

  const diffMs = Date.now() - parsed.getTime();
  const maxPastMs = MAX_PAST_HOURS * 60 * 60 * 1000;
  const maxFutureMs = MAX_FUTURE_MINUTES * 60 * 1000;

  if (diffMs > maxPastMs || diffMs < -maxFutureMs) {
    console.warn(`[lifecycle] rejected out-of-range client timestamp (${raw}) - using server time instead`);
    return { timestamp: new Date(), trusted: false };
  }

  return { timestamp: parsed, trusted: true };
};

// Every lifecycle action that reports a location does it the same way -
// validate, persist to EmployeeLocation, update the employee's cached
// lastLocation, and fan out a (non-persisted, high-frequency) socket event.
const captureLocation = async ({ employee, ownerId, body, source, eventTimestamp }) => {
  const { lat, lng, accuracy } = body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const resolvedTimestamp = eventTimestamp || new Date();

  const loc = await EmployeeLocation.create({
    employee: employee._id,
    lat,
    lng,
    accuracy: Number(accuracy || 0),
    timestamp: resolvedTimestamp,
    ownerId,
    company: employee.company || null,
    metadata: { source },
  });

  employee.lastLocation = { lat, lng, accuracy: Number(accuracy || 0), timestamp: resolvedTimestamp, source };
  employee.lastSeen = new Date();

  reportLocationEvent({
    employee,
    ownerId,
    lat,
    lng,
    accuracy: Number(accuracy || 0),
    timestamp: resolvedTimestamp.toISOString(),
    source,
  });

  return loc;
};

/**
 * GET /api/mobile/assignment-status
 * Powers the home screen: "Waiting for Site" vs Check In / Site Finished /
 * Take Leave actions.
 */
/**
 * If an employee is sitting in CHECKED_IN/WORKING from a PREVIOUS day (e.g.
 * they never pressed Stop Work/Site Finished before closing the app), reset
 * them back to ASSIGNED so today starts fresh with Check In available
 * again - lifecycleState has no built-in day boundary otherwise, but
 * Attendance records are per-day, so we use "is there a checked-in
 * Attendance record for today" as the source of truth.
 */
const reconcileDailyLifecycleState = async (employee) => {
  if (!['CHECKED_IN', 'WORKING'].includes(employee.lifecycleState)) return employee;

  const { start, end } = getDayBounds(new Date());
  const todayRecord = await Attendance.findOne({
    employee: employee._id,
    date: { $gte: start, $lte: end },
    checkIn: { $exists: true, $ne: null },
  });

  if (!todayRecord) {
    employee.lifecycleState = employee.assignedStatus === 'on-site' ? 'ASSIGNED' : 'WAITING_FOR_COMPANY';
    await employee.save();
  }
  return employee;
};

export const getAssignmentStatus = async (req, res) => {
  try {
    let employee = await Employee.findById(req.employee._id).populate('company', 'name address city');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    employee = await reconcileDailyLifecycleState(employee);

    return res.json({
      message: 'Assignment status retrieved',
      data: {
        lifecycleState: employee.lifecycleState,
        assignedStatus: employee.assignedStatus,
        isAssigned: employee.assignedStatus === 'on-site',
        company: employee.company || null,
        isOnLeave: Boolean(employee.currentLeave?.isOnLeave),
        leave: employee.currentLeave?.isOnLeave
          ? { startedAt: employee.currentLeave.startedAt, reason: employee.currentLeave.reason }
          : null,
      },
    });
  } catch (error) {
    return serverError(res, 'Failed to fetch assignment status');
  }
};

/**
 * POST /api/mobile/attendance/check-in
 * Sends a dashboard notification and stores the employee's location.
 * Deliberately does NOT create an Attendance record - that only happens on
 * Start Work.
 */
export const checkIn = async (req, res) => {
  try {
    let employee = req.employee;
    if (employee.assignedStatus !== 'on-site') {
      return res.status(400).json({ message: 'You are not assigned to a company yet.' });
    }
    if (employee.currentLeave?.isOnLeave) {
      return res.status(409).json({ message: 'You are currently on leave. End leave before checking in.' });
    }
    employee = await reconcileDailyLifecycleState(employee);
    if (['CHECKED_IN', 'WORKING'].includes(employee.lifecycleState)) {
      return res.status(409).json({ message: 'You are already checked in.' });
    }

    const ownerId = employee.ownerId || employee.owner || null;
    const { timestamp: eventTime } = resolveEventTimestamp(req.body);
    const location = await captureLocation({ employee, ownerId, body: req.body, source: 'check_in', eventTimestamp: eventTime });

    employee.lifecycleState = 'CHECKED_IN';
    await employee.save();

    await reportLifecycleEvent({
      employee,
      ownerId,
      event: 'employee:checked_in',
      action: 'employee.checkIn',
      title: `${employee.name} checked in`,
      body: 'Employee has checked in at the site.',
      data: { timestamp: eventTime.toISOString(), location: location ? { lat: location.lat, lng: location.lng } : null },
    });

    return res.json({
      message: 'Checked in successfully',
      data: { lifecycleState: employee.lifecycleState, location },
    });
  } catch (error) {
    console.error('mobile.checkIn error', error);
    return serverError(res, 'Failed to check in');
  }
};

/**
 * POST /api/mobile/attendance/start-work
 * This is where the Attendance record is actually created (per spec: not on
 * Check In). Also starts a WorkSession, exactly as the previous checkIn flow
 * used to.
 */
export const startWork = async (req, res) => {
  try {
    const employee = req.employee;
    if (employee.currentLeave?.isOnLeave) {
      return res.status(409).json({ message: 'You are currently on leave.' });
    }
    if (!['CHECKED_IN', 'ASSIGNED'].includes(employee.lifecycleState)) {
      if (employee.lifecycleState === 'WORKING') {
        return res.status(409).json({ message: 'You are already working.' });
      }
      return res.status(400).json({ message: 'You must check in before starting work.' });
    }

    const ownerId = employee.ownerId || employee.owner || null;
    const { timestamp: eventTime } = resolveEventTimestamp(req.body);
    const { start, end } = getDayBounds(eventTime);

    let record = await Attendance.findOne({ employee: employee._id, date: { $gte: start, $lte: end } });
    if (record && record.checkIn && !record.checkOut) {
      return res.status(409).json({ message: 'Work already started today', data: record });
    }

    if (record) {
      record.company = employee.company;
      record.checkIn = getTimeString(eventTime);
      record.checkOut = undefined;
      record.status = 'present';
      record.ownerId = ownerId;
    } else {
      record = new Attendance({
        employee: employee._id,
        company: employee.company,
        date: start,
        checkIn: getTimeString(eventTime),
        status: 'present',
        ownerId,
      });
    }

    const workSession = await WorkSession.create({
      employee: employee._id,
      startAt: eventTime,
      ownerId,
      company: employee.company || null,
    });
    record.workSession = workSession._id;
    await record.save();

    const location = await captureLocation({ employee, ownerId, body: req.body, source: 'start_work', eventTimestamp: eventTime });

    employee.lifecycleState = 'WORKING';
    await employee.save();

    await reportLifecycleEvent({
      employee,
      ownerId,
      event: 'employee:started_work',
      notifyDashboard: false, // dashboard bell is check-in only
      action: 'employee.startWork',
      title: `${employee.name} started work`,
      body: 'Employee has started work and attendance has been recorded.',
      data: { timestamp: eventTime.toISOString(), attendanceId: String(record._id), location: location ? { lat: location.lat, lng: location.lng } : null },
    });

    return res.json({
      message: 'Work started successfully',
      data: { lifecycleState: employee.lifecycleState, attendance: record, location },
    });
  } catch (error) {
    console.error('mobile.startWork error', error);
    return serverError(res, 'Failed to start work');
  }
};

/**
 * POST /api/mobile/attendance/stop-work
 * Stores checkout time, calculates total worked hours on both the
 * Attendance record and its WorkSession.
 */
export const stopWork = async (req, res) => {
  try {
    const employee = req.employee;
    if (employee.lifecycleState !== 'WORKING') {
      return res.status(400).json({ message: 'You are not currently working.' });
    }

    const ownerId = employee.ownerId || employee.owner || null;
    const { timestamp: eventTime } = resolveEventTimestamp(req.body);
    const { start, end } = getDayBounds(eventTime);

    const record = await Attendance.findOne({ employee: employee._id, date: { $gte: start, $lte: end } });
    if (!record || !record.checkIn) {
      return res.status(404).json({ message: 'No attendance record found for today. Please start work first.' });
    }
    if (record.checkOut) {
      return res.status(409).json({ message: 'Already stopped work today', data: record });
    }

    record.checkOut = getTimeString(eventTime);

    // The employee picks their worked hours from a popup on Stop Work -
    // that manually-selected value is authoritative when provided (this is
    // what should show in the "Total Hours Worked" KPI), not the raw
    // start-to-stop timestamp diff, which can differ from what actually
    // happened (breaks, early starts left running, etc).
    const manualHours = Number(req.body?.hoursWorked);
    let hoursWorked = record.hoursWorked || 0;
    const ws = await WorkSession.findOne({ employee: employee._id, endAt: null }).sort({ startAt: -1 });

    if (Number.isFinite(manualHours) && manualHours >= 0) {
      hoursWorked = Math.round(manualHours * 100) / 100;
      if (ws) {
        ws.endAt = eventTime;
        ws.metadata = { ...(ws.metadata || {}), durationHours: hoursWorked, source: 'employee_selected' };
        await ws.save();
      }
    } else if (ws) {
      ws.endAt = eventTime;
      const durationMs = ws.endAt.getTime() - ws.startAt.getTime();
      hoursWorked = Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100;
      ws.metadata = { ...(ws.metadata || {}), durationHours: hoursWorked, source: 'auto_calculated' };
      await ws.save();
    }
    record.hoursWorked = hoursWorked;
    await record.save();

    const location = await captureLocation({ employee, ownerId, body: req.body, source: 'stop_work', eventTimestamp: eventTime });

    employee.lifecycleState = 'CHECKED_IN';
    await employee.save();

    await reportLifecycleEvent({
      employee,
      ownerId,
      event: 'employee:stopped_work',
      notifyDashboard: false, // dashboard bell is check-in only
      action: 'employee.stopWork',
      title: `${employee.name} stopped work`,
      body: `Employee worked ${hoursWorked} hour(s) today.`,
      data: { timestamp: eventTime.toISOString(), attendanceId: String(record._id), hoursWorked, location: location ? { lat: location.lat, lng: location.lng } : null },
    });

    return res.json({
      message: 'Work stopped successfully',
      data: { lifecycleState: employee.lifecycleState, attendance: record, location },
    });
  } catch (error) {
    console.error('mobile.stopWork error', error);
    return serverError(res, 'Failed to stop work');
  }
};

/**
 * POST /api/mobile/site-finished
 * Removes the employee from their active company assignment and returns
 * them to WAITING_FOR_COMPANY.
 */
export const siteFinished = async (req, res) => {
  try {
    const employee = req.employee;
    if (employee.assignedStatus !== 'on-site') {
      return res.status(400).json({ message: 'You are not currently assigned to a company.' });
    }
    if (employee.lifecycleState === 'WORKING') {
      return res.status(409).json({ message: 'Please stop work before finishing the site.' });
    }
    if (employee.currentLeave?.isOnLeave) {
      return res.status(409).json({ message: 'Please end your leave before finishing the site.' });
    }

    const ownerId = employee.ownerId || employee.owner || null;
    const previousCompanyId = employee.company;
    const previousCompany = await Company.findById(previousCompanyId).select('name').lean();
    const companyName = previousCompany?.name || 'their site';

    const { timestamp: eventTime } = resolveEventTimestamp(req.body);
    const location = await captureLocation({ employee, ownerId, body: req.body, source: 'site_finished', eventTimestamp: eventTime });

    // Per the clarified spec: the employee stays linked to the company
    // (Site Assigned re-activates the SAME company with no re-picking
    // needed) - only the assignment/lifecycle status changes.
    employee.lifecycleState = 'WAITING_FOR_COMPANY';
    employee.assignedStatus = 'site-over';
    await employee.save();

    const completedAt = eventTime;
    await reportLifecycleEvent({
      employee,
      ownerId,
      event: 'employee:site_finished',
      notifyDashboard: false, // dashboard bell is check-in only
      action: 'employee.siteFinished',
      title: `${employee.name} has completed the assigned site and is waiting for a new site assignment.`,
      body: `Completed ${companyName} at ${completedAt.toLocaleString()}`,
      data: {
        employeeName: employee.name,
        employeeId: employee.employeeId || String(employee._id),
        company: companyName,
        previousCompanyId: String(previousCompanyId),
        timestamp: completedAt.toISOString(),
        notificationType: 'SITE_COMPLETED',
        location: location ? { lat: location.lat, lng: location.lng } : null,
      },
    });

    return res.json({
      message: 'Site marked as finished',
      data: { lifecycleState: employee.lifecycleState, assignedStatus: employee.assignedStatus },
    });
  } catch (error) {
    console.error('mobile.siteFinished error', error);
    return serverError(res, 'Failed to finish site');
  }
};

/**
 * POST /api/mobile/leave/start
 * Leave starts immediately when pressed and remains active until End Leave.
 */
export const startLeave = async (req, res) => {
  try {
    const employee = req.employee;
    if (employee.currentLeave?.isOnLeave) {
      return res.status(409).json({ message: 'You are already on leave.' });
    }
    if (employee.lifecycleState === 'WORKING') {
      return res.status(409).json({ message: 'Please stop work before taking leave.' });
    }

    const ownerId = employee.ownerId || employee.owner || null;
    const reason = String(req.body?.reason || '').slice(0, 500);

    employee.preLeaveState = employee.lifecycleState;
    employee.currentLeave = { isOnLeave: true, startedAt: new Date(), reason };
    employee.lifecycleState = 'ON_LEAVE';
    await employee.save();

    // Mark today's attendance as 'leave' so it shows correctly on the calendar.
    try {
      const { start, end } = getDayBounds(new Date());
      await Attendance.findOneAndUpdate(
        { employee: employee._id, date: { $gte: start, $lte: end } },
        {
          $setOnInsert: { employee: employee._id, company: employee.company, date: start, ownerId },
          $set: { status: 'leave', remarks: reason || 'On leave' },
        },
        { upsert: true, new: true }
      );
    } catch (attErr) {
      console.error('Failed to mark attendance as leave', attErr.message);
    }

    await reportLifecycleEvent({
      employee,
      ownerId,
      event: 'employee:leave_started',
      notifyDashboard: false, // dashboard bell is check-in only
      action: 'employee.leaveStart',
      title: `${employee.name} started leave`,
      body: reason ? `Reason: ${reason}` : 'Employee has started leave.',
      data: { reason },
    });

    return res.json({ message: 'Leave started', data: { lifecycleState: employee.lifecycleState } });
  } catch (error) {
    console.error('mobile.startLeave error', error);
    return serverError(res, 'Failed to start leave');
  }
};

/**
 * POST /api/mobile/leave/end
 * Restores the state the employee was in before Take Leave was pressed.
 */
export const endLeave = async (req, res) => {
  try {
    const employee = req.employee;
    if (!employee.currentLeave?.isOnLeave) {
      return res.status(409).json({ message: 'You are not currently on leave.' });
    }

    const ownerId = employee.ownerId || employee.owner || null;

    // If the employee's assignment was removed while they were on leave, or
    // they have no assignment at all, fall back to WAITING_FOR_COMPANY
    // rather than restoring a stale ASSIGNED/CHECKED_IN state.
    let restoredState = employee.preLeaveState || 'WAITING_FOR_COMPANY';
    if (employee.assignedStatus !== 'on-site') restoredState = 'WAITING_FOR_COMPANY';
    // Never resume directly into WORKING - the employee must press Start
    // Work again after returning, since their prior WorkSession was already
    // closed out (or never properly stopped) before leave began.
    if (restoredState === 'WORKING') restoredState = 'CHECKED_IN';

    employee.lifecycleState = restoredState;
    employee.preLeaveState = null;
    employee.currentLeave = { isOnLeave: false, startedAt: null, reason: '' };
    await employee.save();

    await reportLifecycleEvent({
      employee,
      ownerId,
      event: 'employee:leave_ended',
      notifyDashboard: false, // dashboard bell is check-in only
      action: 'employee.leaveEnd',
      title: `${employee.name} ended leave`,
      body: 'Employee is back from leave.',
      data: {},
    });

    return res.json({ message: 'Leave ended', data: { lifecycleState: employee.lifecycleState } });
  } catch (error) {
    console.error('mobile.endLeave error', error);
    return serverError(res, 'Failed to end leave');
  }
};

export default {
  getAssignmentStatus,
  checkIn,
  startWork,
  stopWork,
  siteFinished,
  startLeave,
  endLeave,
};