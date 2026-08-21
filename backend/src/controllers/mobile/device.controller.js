// POST /api/mobile/device
// Body: { deviceId?: string, deviceToken?: string }
import Employee from '../../models/Employee.js';
import { sendPushToDevice, initFcm } from '../../services/fcm.service.js';

export const registerDevice = async (req, res) => {
  try {
    const { deviceId, deviceToken } = req.body || {};
    const emp = req.employee;
    if (!emp) return res.status(401).json({ message: 'Employee not authenticated' });

    if (deviceId) emp.deviceId = deviceId;
    if (deviceToken) emp.deviceToken = deviceToken;
    await emp.save();

    return res.json({ message: 'Device registered' });
  } catch (err) {
    console.error('mobile.registerDevice error', err);
    return res.status(500).json({ message: 'Failed to register device' });
  }
};

export default { registerDevice };
