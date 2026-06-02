import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import { Invoice } from '../models/Invoice.js';
import User from '../models/User.js';

export const getDashboard = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const user = await User.findById(userId);
    if (!user || !user.company) {
      return res.status(403).json({ message: 'No company associated with user' });
    }

    const companyFilter = { company: user.company };
    const invoiceFilter = { createdBy: user._id };

    const [totalEmployees, totalInvoices, totalAttendance] = await Promise.all([
      Employee.countDocuments(companyFilter),
      Invoice.countDocuments(invoiceFilter),
      Attendance.countDocuments(companyFilter),
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
