import Attendance from '../models/Attendance.js';

export const getAttendance = async (req, res) => {
  try {
    const { employee, company, from, to } = req.query;
    const filter = {};

    if (employee) filter.employee = employee;
    if (company) filter.company = company;
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
    const record = await Attendance.create(req.body);
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
    const updated = await Attendance.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }
    res.json({ message: 'Attendance updated', data: updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update attendance', error: error.message });
  }
};

export const getAttendanceSummary = async (req, res) => {
  try {
    const { company } = req.query;
    const filter = company ? { company } : {};
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
