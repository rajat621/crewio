import Attendance from '../../models/Attendance.js';

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
    const filter = { employee: req.employee._id };

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
    return res.status(500).json({ message: 'Failed to check in', error: error.message });
  }
};

export const checkOut = async (req, res) => {
  try {
    const now = new Date();
    const { start, end } = getDayBounds(now);

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
    return res.status(500).json({ message: 'Failed to check out', error: error.message });
  }
};

export const getTodayAttendance = async (req, res) => {
  try {
    const { start, end } = getDayBounds(new Date());
    const record = await Attendance.findOne({
      employee: req.employee._id,
      date: { $gte: start, $lte: end },
    });

    return res.json({ message: 'Today attendance retrieved', data: record || null });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch today attendance', error: error.message });
  }
};

export default {
  getMyAttendance,
  checkIn,
  checkOut,
  getTodayAttendance,
};
