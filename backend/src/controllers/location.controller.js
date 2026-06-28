import EmployeeLocation from '../models/EmployeeLocation.js';
import Employee from '../models/Employee.js';

export const postEmployeeLocation = async (req, res) => {
  try {
    const emp = req.employee;
    if (!emp) return res.status(401).json({ message: 'Employee not authenticated' });
    const { lat, lng, accuracy, timestamp } = req.body || {};
    if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ message: 'lat and lng are required' });

    const loc = await EmployeeLocation.create({
      employee: emp._id,
      lat,
      lng,
      accuracy: Number(accuracy || 0),
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      ownerId: emp.ownerId || null,
      company: emp.company || null,
    });

    return res.json({ message: 'Location recorded', data: loc });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to record location', error: error.message });
  }
};

export const getEmployeeLocations = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });
    const employeeId = req.query.employeeId;
    const limit = Number(req.query.limit || 50);
    if (!employeeId) return res.status(400).json({ message: 'employeeId query required' });

    const items = await EmployeeLocation.find({ employee: employeeId, ownerId: user.ownerId }).sort({ createdAt: -1 }).limit(limit);
    return res.json({ message: 'Locations retrieved', data: items });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch locations', error: error.message });
  }
};

export default { postEmployeeLocation, getEmployeeLocations };
