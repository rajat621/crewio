import Notification from '../models/Notification.js';
import Employee from '../models/Employee.js';

export const createNotification = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });
    const { userId, title, body, payload } = req.body || {};
    if (!userId || !title) return res.status(400).json({ message: 'userId and title required' });

    // ensure target belongs to owner
    const emp = await Employee.findOne({ _id: userId, ownerId: user.ownerId });
    if (!emp) return res.status(404).json({ message: 'Target user not found' });

    const n = await Notification.create({ user: emp._id, title, body: body || '', payload: payload || {}, ownerId: user.ownerId });
    return res.status(201).json({ message: 'Notification created', data: n });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create notification', error: error.message });
  }
}

export const listNotificationsForUser = async (req, res) => {
  try {
    // support both employee and owner fetch
    if (req.employee && req.employee._id) {
      const items = await Notification.find({ user: req.employee._id, ownerId: req.employee.ownerId }).sort({ createdAt: -1 });
      return res.json({ data: items });
    }
  const user = req.user;

if (!user || !user.ownerId) {
  return res.status(401).json({
    message: 'User not authenticated'
  });
}

const items = await Notification.find({
  ownerId: user.ownerId
}).sort({ createdAt: -1 });

return res.json({
  data: items
});
  } catch (error) {
    return res.status(500).json({ message: 'Failed to list notifications', error: error.message });
  }
}

export const markNotificationRead = async (req, res) => {
  try {
    const id = req.params.id;
    const user = req.user || {};
    if (!user.ownerId && !req.employee) return res.status(401).json({ message: 'Not authenticated' });
    const ownerId = user.ownerId || req.employee.ownerId;
    const n = await Notification.findOne({ _id: id, ownerId });
    if (!n) return res.status(404).json({ message: 'Notification not found' });
    n.read = true;
    await n.save();
    return res.json({ message: 'Marked read' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to mark read', error: error.message });
  }
}

export default { createNotification, listNotificationsForUser, markNotificationRead };
