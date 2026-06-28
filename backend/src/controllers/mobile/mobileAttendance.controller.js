<<<<<<< HEAD
﻿import Attendance from '../../models/Attendance.js';
import WorkSession from '../../models/WorkSession.js';
=======
import Attendance from '../../models/Attendance.js';
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

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

export const getMyAttendance = async (req, res) => {
  try {
    const { from, to } = req.query;
<<<<<<< HEAD
    const ownerId = req.employee.ownerId || null;
    const filter = { employee: req.employee._id, ownerId };
=======
    const filter = { employee: req.employee._id };
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

    if (from || to) {
      filter.date = {};
      if (from) {
        const fromDate = new Date(from);
        fromDate.setHours(0, 0, 0, 0);
        filter.date.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.date.$lte = toDate;
      }
    }

    const items = await Attendance.find(filter).sort({ date: -1 });
    return res.json({ message: 'Attendance retrieved', data: items });
  } catch (error) {
<<<<<<< HEAD
    console.error('mobile.getMyAttendance error', error);
=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    return res.status(500).json({ message: 'Failed to fetch attendance', error: error.message });
  }
};

export const checkIn = async (req, res) => {
  try {
    if (!req.employee.company) {
      return res.status(400).json({ message: 'Employee is not assigned to a company' });
    }

    const now = new Date();
    const { start, end } = getDayBounds(now);
<<<<<<< HEAD
    const ownerId = req.employee.ownerId || null;

    let record = await Attendance.findOne({ employee: req.employee._id, date: { $gte: start, $lte: end } });
    if (record) {
      record.company = req.employee.company;
      record.checkIn = getTimeString(now);
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
      // link to attendance record
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
=======

    const record = await Attendance.findOneAndUpdate(
      {
        employee: req.employee._id,
        date: { $gte: start, $lte: end },
      },
      {
        $set: {
          company: req.employee.company,
          checkIn: getTimeString(now),
          status: 'present',
        },
        $setOnInsert: {
          employee: req.employee._id,
          date: start,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.json({ message: 'Checked in successfully', data: record });
  } catch (error) {
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    return res.status(500).json({ message: 'Failed to check in', error: error.message });
  }
};

export const checkOut = async (req, res) => {
  try {
    const now = new Date();
    const { start, end } = getDayBounds(now);

<<<<<<< HEAD
    const ownerId = req.employee.ownerId || null;
    let record = await Attendance.findOne({ employee: req.employee._id, date: { $gte: start, $lte: end } });
    if (!record) {
      return res.status(404).json({ message: 'No attendance record found for today. Please check in first.' });
    }
    record.checkOut = getTimeString(now);
    // compute hoursWorked from the WorkSession if present
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
=======
    const record = await Attendance.findOneAndUpdate(
      {
        employee: req.employee._id,
        date: { $gte: start, $lte: end },
      },
      {
        $set: {
          checkOut: getTimeString(now),
        },
      },
      { new: true }
    );

    if (!record) {
      return res.status(404).json({ message: 'No attendance record found for today. Please check in first.' });
    }

    return res.json({ message: 'Checked out successfully', data: record });
  } catch (error) {
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    return res.status(500).json({ message: 'Failed to check out', error: error.message });
  }
};

export const getTodayAttendance = async (req, res) => {
  try {
    const { start, end } = getDayBounds(new Date());
<<<<<<< HEAD
    const ownerId = req.employee.ownerId || null;
    const record = await Attendance.findOne({
      employee: req.employee._id,
      ownerId,
=======
    const record = await Attendance.findOne({
      employee: req.employee._id,
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
      date: { $gte: start, $lte: end },
    });

    return res.json({ message: 'Today attendance retrieved', data: record || null });
  } catch (error) {
<<<<<<< HEAD
    console.error('mobile.getTodayAttendance error', error);
=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    return res.status(500).json({ message: 'Failed to fetch today attendance', error: error.message });
  }
};

export default {
  getMyAttendance,
  checkIn,
  checkOut,
  getTodayAttendance,
};
