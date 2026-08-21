import { sendPushToDevice, initFcm } from '../services/fcm.service.js';

export const sendTestPush = async (req, res) => {
  try {
    const { deviceToken, title, body, data } = req.body || {};
    if (!deviceToken) return res.status(400).json({ message: 'deviceToken is required' });

    const client = initFcm();
    if (!client) return res.status(500).json({ message: 'FCM not configured on server' });

    const resp = await sendPushToDevice(deviceToken, { title, body, data });
    if (!resp) return res.status(500).json({ message: 'Failed to send push' });
    return res.json({ message: 'Push queued', id: resp });
  } catch (err) {
    console.error('test.sendTestPush error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export default { sendTestPush };
