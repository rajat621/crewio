
import Employee from '../../models/Employee.js';
import Attendance from '../../models/Attendance.js';
import WorkSession from '../../models/WorkSession.js';
import EmployeeLocation from '../../models/EmployeeLocation.js';
import Company from '../../models/Company.js';
import { reportLifecycleEvent, reportLocationEvent } from '../../services/lifecycle.service.js';

const getDayBounds = (value = new Date()) => {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const end = new Date(value);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getTimeString = (date = new Date()) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

// Every lifecycle action that reports a location does it the same way -
// validate, persist to EmployeeLocation, update the employee's cached
// lastLocation, and fan out a (non-persisted, high-frequency) socket event.
const captureLocation = async ({ employee, ownerId, body, source }) => {
  const { lat, lng, accuracy, timestamp } = body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const resolvedTimestamp = timestamp ? new Date(timestamp) : new Date();

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
    return res.status(500).json({ message: 'Failed to fetch assignment status', error: error.message });
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
    const location = await captureLocation({ employee, ownerId, body: req.body, source: 'check_in' });

    employee.lifecycleState = 'CHECKED_IN';
    await employee.save();

    await reportLifecycleEvent({
      employee,
      ownerId,
      event: 'employee:checked_in',
      action: 'employee.checkIn',
      title: `${employee.name} checked in`,
      body: 'Employee has checked in at the site.',
      data: { location: location ? { lat: location.lat, lng: location.lng } : null },
    });

    return res.json({
      message: 'Checked in successfully',
      data: { lifecycleState: employee.lifecycleState, location },
    });
  } catch (error) {
    console.error('mobile.checkIn error', error);
    return res.status(500).json({ message: 'Failed to check in', error: error.message });
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
    const now = new Date();
    const { start, end } = getDayBounds(now);

    let record = await Attendance.findOne({ employee: employee._id, date: { $gte: start, $lte: end } });
    if (record && record.checkIn && !record.checkOut) {
      return res.status(409).json({ message: 'Work already started today', data: record });
    }

    if (record) {
      record.company = employee.company;
      record.checkIn = getTimeString(now);
      record.checkOut = undefined;
      record.status = 'present';
      record.ownerId = ownerId;
    } else {
      record = new Attendance({
        employee: employee._id,
        company: employee.company,
        date: start,
        checkIn: getTimeString(now),
        status: 'present',
        ownerId,
      });
    }

    const workSession = await WorkSession.create({
      employee: employee._id,
      startAt: now,
      ownerId,
      company: employee.company || null,
    });
    record.workSession = workSession._id;
    await record.save();

    const location = await captureLocation({ employee, ownerId, body: req.body, source: 'start_work' });

    employee.lifecycleState = 'WORKING';
    await employee.save();

    await reportLifecycleEvent({
      employee,
      ownerId,
      event: 'employee:started_work',
      action: 'employee.startWork',
      title: `${employee.name} started work`,
      body: 'Employee has started work and attendance has been recorded.',
      data: { attendanceId: String(record._id), location: location ? { lat: location.lat, lng: location.lng } : null },
    });

    return res.json({
      message: 'Work started successfully',
      data: { lifecycleState: employee.lifecycleState, attendance: record, location },
    });
  } catch (error) {
    console.error('mobile.startWork error', error);
    return res.status(500).json({ message: 'Failed to start work', error: error.message });
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
    const now = new Date();
    const { start, end } = getDayBounds(now);

    const record = await Attendance.findOne({ employee: employee._id, date: { $gte: start, $lte: end } });
    if (!record || !record.checkIn) {
      return res.status(404).json({ message: 'No attendance record found for today. Please start work first.' });
    }
    if (record.checkOut) {
      return res.status(409).json({ message: 'Already stopped work today', data: record });
    }

    record.checkOut = getTimeString(now);

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
        ws.endAt = now;
        ws.metadata = { ...(ws.metadata || {}), durationHours: hoursWorked, source: 'employee_selected' };
        await ws.save();
      }
    } else if (ws) {
      ws.endAt = now;
      const durationMs = ws.endAt.getTime() - ws.startAt.getTime();
      hoursWorked = Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100;
      ws.metadata = { ...(ws.metadata || {}), durationHours: hoursWorked, source: 'auto_calculated' };
      await ws.save();
    }
    record.hoursWorked = hoursWorked;
    await record.save();

    const location = await captureLocation({ employee, ownerId, body: req.body, source: 'stop_work' });

    employee.lifecycleState = 'CHECKED_IN';
    await employee.save();

    await reportLifecycleEvent({
      employee,
      ownerId,
      event: 'employee:stopped_work',
      action: 'employee.stopWork',
      title: `${employee.name} stopped work`,
      body: `Employee worked ${hoursWorked} hour(s) today.`,
      data: { attendanceId: String(record._id), hoursWorked, location: location ? { lat: location.lat, lng: location.lng } : null },
    });

    return res.json({
      message: 'Work stopped successfully',
      data: { lifecycleState: employee.lifecycleState, attendance: record, location },
    });
  } catch (error) {
    console.error('mobile.stopWork error', error);
    return res.status(500).json({ message: 'Failed to stop work', error: error.message });
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

    const location = await captureLocation({ employee, ownerId, body: req.body, source: 'site_finished' });

    // Per the clarified spec: the employee stays linked to the company
    // (Site Assigned re-activates the SAME company with no re-picking
    // needed) - only the assignment/lifecycle status changes.
    employee.lifecycleState = 'WAITING_FOR_COMPANY';
    employee.assignedStatus = 'site-over';
    await employee.save();

    const completedAt = new Date();
    await reportLifecycleEvent({
      employee,
      ownerId,
      event: 'employee:site_finished',
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
    return res.status(500).json({ message: 'Failed to finish site', error: error.message });
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
      action: 'employee.leaveStart',
      title: `${employee.name} started leave`,
      body: reason ? `Reason: ${reason}` : 'Employee has started leave.',
      data: { reason },
    });

    return res.json({ message: 'Leave started', data: { lifecycleState: employee.lifecycleState } });
  } catch (error) {
    console.error('mobile.startLeave error', error);
    return res.status(500).json({ message: 'Failed to start leave', error: error.message });
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
      action: 'employee.leaveEnd',
      title: `${employee.name} ended leave`,
      body: 'Employee is back from leave.',
      data: {},
    });

    return res.json({ message: 'Leave ended', data: { lifecycleState: employee.lifecycleState } });
  } catch (error) {
    console.error('mobile.endLeave error', error);
    return res.status(500).json({ message: 'Failed to end leave', error: error.message });
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