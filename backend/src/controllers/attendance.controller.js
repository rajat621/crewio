import Attendance from '../models/Attendance.js';

export const getAttendance = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(403).json({ message: 'User not authorized' });

    const { employee, from, to } = req.query;
    const filter = { ownerId: user.ownerId };
    if (user.companyId) filter.company = user.companyId;

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
    const currentUser = req.currentUser;
    if (!currentUser || !currentUser.company) {
      return res.status(403).json({ message: 'No company associated with user' });
    }

    const user = req.user;
    if (!user || !user.ownerId) return res.status(403).json({ message: 'User not authorized' });

    const record = await Attendance.create({ ...req.body, company: user.companyId || req.body.company, ownerId: user.ownerId });
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

export const getAttendanceSummary = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(403).json({ message: 'User not authorized' });

    const filter = { ownerId: user.ownerId };
    if (user.companyId) filter.company = user.companyId;
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
