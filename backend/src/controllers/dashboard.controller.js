import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import { Invoice } from '../models/Invoice.js';

export const getDashboard = async (req, res) => {
  try {
    const [totalEmployees, totalInvoices, totalAttendance] = await Promise.all([
      Employee.countDocuments({}),
      Invoice.countDocuments({}),
      Attendance.countDocuments({}),
    ]);

    res.json({
      message: 'Dashboard data',
      data: {
        totalEmployees,
        totalInvoices,
        totalAttendance,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch dashboard', error: error.message });
  }
};

export const getStats = getDashboard;
