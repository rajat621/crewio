import Attendance from '../models/Attendance.js';
import User from '../models/User.js';

export const getAttendance = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const user = await User.findById(userId);
    if (!user || !user.company) {
      return res.status(403).json({ message: 'No company associated with user' });
    }

    const { employee, from, to } = req.query;
    const filter = { company: user.company };

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
    const userId = req.user?.userId;
    const user = await User.findById(userId);
    if (!user || !user.company) {
      return res.status(403).json({ message: 'No company associated with user' });
    }

    const record = await Attendance.create({ ...req.body, company: user.company });
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
    const userId = req.user?.userId;
    const user = await User.findById(userId);
    if (!user || !user.company) {
      return res.status(403).json({ message: 'No company associated with user' });
    }

    const updated = await Attendance.findOneAndUpdate(
      { _id: req.params.id, company: user.company },
      { ...req.body, company: user.company },
      { new: true }
    );
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
    const userId = req.user?.userId;
    const user = await User.findById(userId);
    if (!user || !user.company) {
      return res.status(403).json({ message: 'No company associated with user' });
    }

    const deleted = await Attendance.findOneAndDelete({ _id: req.params.id, company: user.company });
    if (!deleted) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    res.json({ message: 'Attendance deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete attendance', error: error.message });
  }
};

export const getAttendanceSummary = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const user = await User.findById(userId);
    if (!user || !user.company) {
      return res.status(403).json({ message: 'No company associated with user' });
    }

    const filter = { company: user.company };
    const [present, absent, leave] = await Promise.all([
      Attendance.countDocuments({ ...filter, status: 'present' }),
      Attendance.countDocuments({ ...filter, status: 'absent' }),
      Attendance.countDocuments({ ...filter, status: 'leave' }),
    ]);

    res.json({ data: { present, absent, leave, total: present + absent + leave } });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch attendance summary', error: error.message });
  }
};
