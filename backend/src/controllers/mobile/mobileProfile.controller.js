import Employee from '../../models/Employee.js';

const ALLOWED_PROFILE_UPDATE_FIELDS = ['avatar', 'mobile', 'mobileNumber', 'countryCode', 'address', 'city'];

// Same normalized shape as mobileAuth's buildUserPayload, so the Flutter
// UserModel (which has required, non-nullable `name`/`employeeId` fields)
// never breaks regardless of what's actually set on the Employee document.
const buildUserPayload = (employee) => ({
  _id: String(employee._id),
  employeeId: employee.employeeId || employee.appUserId || String(employee._id),
  email: employee.email || null,
  name: employee.name || [employee.firstName, employee.lastName].filter(Boolean).join(' ') || 'Employee',
  phone: employee.mobile || employee.mobileNumber || null,
  status: employee.status || 'active',
  createdAt: employee.createdAt ? new Date(employee.createdAt).toISOString() : null,
  lastSeen: employee.lastSeen ? new Date(employee.lastSeen).toISOString() : null,
  lastLocation: employee.lastLocation || null,
  // Accepted by updateMyProfile below but previously never actually
  // returned here, so a saved profile photo would never show back up
  // after the app restarted or the profile was refetched.
  avatar: employee.avatar || null,
});

export const getMyProfile = async (req, res) => {
  try {
    const employee = await Employee.findById(req.employee._id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    return res.json({ message: 'Profile retrieved', data: buildUserPayload(employee) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch profile', error: error.message });
  }
};

export const updateMyProfile = async (req, res) => {
  try {
    const updates = {};
    for (const field of ALLOWED_PROFILE_UPDATE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided for update' });
    }

    const employee = await Employee.findByIdAndUpdate(
      req.employee._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    return res.json({ message: 'Profile updated', data: buildUserPayload(employee) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update profile', error: error.message });
  }
};

export default {
  getMyProfile,
  updateMyProfile,
};