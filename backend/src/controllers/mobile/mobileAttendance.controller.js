import Attendance from '../../models/Attendance.js';
import WorkSession from '../../models/WorkSession.js';
import { serverError } from '../../utils/apiResponse.js';
import { getUaeDayBounds } from '../../utils/businessTime.util.js';

// Timezone audit finding: this is what decides which calendar day a
// mobile check-in/check-out gets attributed to - it was computing "today"
// against the Node PROCESS's local timezone (`new Date();
// setHours(0,0,0,0)`), not the business's (UAE). An employee checking in
// late at night could have their shift silently attributed to the wrong
// calendar day depending on server deployment timezone, with no visible
// error. Delegates to businessTime.util.js's fixed-UTC+4-offset
// calculation instead, so this is correct regardless of server TZ.
const getDayBounds = (value = new Date()) => getUaeDayBounds(value);

const getTimeString = (date = new Date()) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const getMyAttendance = async (req, res) => {
  try {
    const { from, to } = req.query;
    const ownerId = req.employee.ownerId || null;
    const filter = { employee: req.employee._id, ownerId };

    if (from || to) {
      filter.date = {};
      if (from) {
        filter.date.$gte = getUaeDayBounds(new Date(from)).start;
      }
      if (to) {
        filter.date.$lte = getUaeDayBounds(new Date(to)).end;
      }
    }

    const items = await Attendance.find(filter).sort({ date: -1 });
    return res.json({ message: 'Attendance retrieved', data: items });
  } catch (error) {
    console.error('mobile.getMyAttendance error', error);
    return serverError(res, 'Failed to fetch attendance');
  }
};

// NOTE: superseded by controllers/mobile/mobileLifecycle.controller.js
// (checkIn/startWork/stopWork), which correctly defers Attendance creation
// to Start Work per the lifecycle spec. Kept here, unrouted, for reference.
export const checkIn = async (req, res) => {
  try {
    if (!req.employee.company) {
      return res.status(400).json({ message: 'Employee is not assigned to a company' });
    }

    const now = new Date();
    const { start, end } = getDayBounds(now);
    const ownerId = req.employee.ownerId || null;

    let record = await Attendance.findOne({ employee: req.employee._id, date: { $gte: start, $lte: end } });
    if (record && record.checkIn && !record.checkOut) {
      return res.status(409).json({ message: 'Already checked in today', data: record });
    }

    if (record) {
      record.company = req.employee.company;
      record.checkIn = getTimeString(now);
      record.checkOut = undefined;
      record.status = 'present';
      record.ownerId = ownerId;
      await record.save();
    } else {
      record = await Attendance.create({
        employee: req.employee._id,
        company: req.employee.company,
        date: start,
        checkIn: getTimeString(now),
        status: 'present',
        ownerId,
      });
    }

    // Create a WorkSession for this check-in
    try {
      const ws = await WorkSession.create({
        employee: req.employee._id,
        startAt: now,
        ownerId,
        company: req.employee.company || null,
      });
      if (record && ws && ws._id) {
        record.workSession = ws._id;
        await record.save();
      }
    } catch (wsErr) {
      console.error('Failed to create WorkSession on check-in', wsErr.message);
    }

    return res.json({ message: 'Checked in successfully', data: record });
  } catch (error) {
    console.error('mobile.checkIn error', error);
    return serverError(res, 'Failed to check in');
  }
};

export const checkOut = async (req, res) => {
  try {
    const now = new Date();
    const { start, end } = getDayBounds(now);

    const ownerId = req.employee.ownerId || null;
    let record = await Attendance.findOne({ employee: req.employee._id, date: { $gte: start, $lte: end } });
    if (!record || !record.checkIn) {
      return res.status(404).json({ message: 'No attendance record found for today. Please check in first.' });
    }
    if (record.checkOut) {
      return res.status(409).json({ message: 'Already checked out today', data: record });
    }
    record.checkOut = getTimeString(now);
    try {
      const ws = await WorkSession.findOne({ employee: req.employee._id, endAt: null }).sort({ startAt: -1 });
      if (ws) {
        ws.endAt = now;
        const durationMs = ws.endAt.getTime() - ws.startAt.getTime();
        const hours = Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100;
        ws.metadata = ws.metadata || {};
        ws.metadata.durationHours = hours;
        await ws.save();
        record.hoursWorked = hours;
      }
    } catch (wsErr) {
      console.error('Failed to finalize WorkSession on check-out', wsErr.message);
    }

    await record.save();
    return res.json({ message: 'Checked out successfully', data: record });
  } catch (error) {
    console.error('mobile.checkOut error', error);
    return serverError(res, 'Failed to check out');
  }
};

export const getTodayAttendance = async (req, res) => {
  try {
    const { start, end } = getDayBounds(new Date());
    const ownerId = req.employee.ownerId || null;
    const record = await Attendance.findOne({
      employee: req.employee._id,
      ownerId,
      date: { $gte: start, $lte: end },
    });

    return res.json({ message: 'Today attendance retrieved', data: record || null });
  } catch (error) {
    console.error('mobile.getTodayAttendance error', error);
    return serverError(res, 'Failed to fetch today attendance');
  }
};

// GET /api/mobile/attendance/summary?month=7&year=2026
// Powers both the home page stat cards and the calendar screen's per-day markers.
export const getMonthlySummary = async (req, res) => {
  try {
    const now = new Date();
    const month = Number(req.query.month || now.getMonth() + 1); // 1-12
    const year = Number(req.query.year || now.getFullYear());
    const ownerId = req.employee.ownerId || null;

    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const records = await Attendance.find({
      employee: req.employee._id,
      ownerId,
      date: { $gte: start, $lte: end },
    }).sort({ date: 1 });

    let daysPresent = 0;
    let totalHours = 0;
    const days = records.map((r) => {
      if (r.status === 'present' || r.checkIn) daysPresent += 1;
      totalHours += Number(r.hoursWorked || 0);
      return {
        date: r.date,
        status: r.status,
        checkIn: r.checkIn || null,
        checkOut: r.checkOut || null,
        hoursWorked: r.hoursWorked || 0,
      };
    });

    return res.json({
      message: 'Monthly summary retrieved',
      data: {
        month,
        year,
        daysPresent,
        totalHours: Math.round(totalHours * 100) / 100,
        days,
      },
    });
  } catch (error) {
    console.error('mobile.getMonthlySummary error', error);
    return serverError(res, 'Failed to fetch monthly summary');
  }
};

export default {
  getMyAttendance,
  checkIn,
  checkOut,
  getTodayAttendance,
  getMonthlySummary,
};
