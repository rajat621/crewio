import EmployeeLocation from '../models/EmployeeLocation.js';
import Employee from '../models/Employee.js';
import { requestEmployeeLocationNow, reportLocationEvent } from '../services/lifecycle.service.js';

export const postEmployeeLocation = async (req, res) => {
  try {
    const emp = req.employee;
    if (!emp) return res.status(401).json({ message: 'Employee not authenticated' });
    const { lat, lng, accuracy, timestamp, event } = req.body || {};
    if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ message: 'lat and lng are required' });

    const resolvedTimestamp = timestamp ? new Date(timestamp) : new Date();

    const loc = await EmployeeLocation.create({
      employee: emp._id,
      lat,
      lng,
      accuracy: Number(accuracy || 0),
      timestamp: resolvedTimestamp,
      ownerId: emp.ownerId || null,
      company: emp.company || null,
      metadata: event ? { source: event } : {},
    });

    // Keep the employee's cached "last known location" fresh too, and push
    // a live update to the dashboard - this is what makes selecting an
    // employee on Track Employee (or an on-demand location request) work
    // regardless of their check-in status, since this endpoint is used for
    // background/periodic pings as well as on-demand responses.
    await Employee.findByIdAndUpdate(emp._id, {
      $set: { lastLocation: { lat, lng, accuracy: Number(accuracy || 0), timestamp: resolvedTimestamp, source: event || 'ping' }, lastSeen: new Date() },
    });

    reportLocationEvent({
      employee: emp,
      ownerId: emp.ownerId || null,
      lat,
      lng,
      accuracy: Number(accuracy || 0),
      timestamp: resolvedTimestamp.toISOString(),
      source: event || 'ping',
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

// GET /api/owner/locations/latest?employeeId=... - single most recent fix,
// used for map pins that don't need the full history.
export const getLatestEmployeeLocation = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });
    const { employeeId } = req.query;
    if (!employeeId) return res.status(400).json({ message: 'employeeId query required' });

    const latest = await EmployeeLocation.findOne({ employee: employeeId, ownerId: user.ownerId }).sort({ createdAt: -1 });
    return res.json({ message: 'Latest location retrieved', data: latest || null });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch latest location', error: error.message });
  }
};

// POST /api/owner/locations/request - dashboard asks a specific employee's
// connected app to push its current GPS position right now, over the
// Socket.IO channel (see socket.service.js `location:request`). The app is
// expected to respond by calling POST /api/mobile/location as normal.
export const requestCurrentLocation = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });
    const { employeeId } = req.body || {};
    if (!employeeId) return res.status(400).json({ message: 'employeeId is required' });

    const employee = await Employee.findOne({ _id: employeeId, ownerId: user.ownerId }).select('_id');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    requestEmployeeLocationNow(employee._id);
    return res.json({ message: 'Location request sent' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to request location', error: error.message });
  }
};

export default { postEmployeeLocation, getEmployeeLocations, getLatestEmployeeLocation, requestCurrentLocation };


