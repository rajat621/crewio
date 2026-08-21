import Notification from '../models/Notification.js';
import Employee from '../models/Employee.js';
import { success, created, badRequest, unauthorized, forbidden, notFound, serverError } from '../utils/apiResponse.js';
import { obsLog } from '../middleware/requestContext.middleware.js';

export const createNotification = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return unauthorized(res, 'User not authenticated');
    const { userId, title, body, payload } = req.body || {};
    if (!userId || !title) return badRequest(res, 'userId and title required');

    // ensure target belongs to owner
    // .select('_id') - only emp._id is used below (verified: no other
    // reference to `emp` in this function).
    const emp = await Employee.findOne({ _id: userId, ownerId: user.ownerId }).select('_id');
    if (!emp) return notFound(res, 'Target user not found');

    const n = await Notification.create({ user: emp._id, title, body: body || '', payload: payload || {}, ownerId: user.ownerId });
    return created(res, { data: n, message: 'Notification created' });
  } catch (error) {
    obsLog('notification_create_error', { message: error.message });
    return serverError(res, 'Failed to create notification');
  }
}

// Clamp/validate page & limit query params so a bad value (missing,
// negative, non-numeric, or absurdly large) can't be used to skip
// pagination entirely or hammer the DB with a huge $skip/$limit.
const parsePagination = (req) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

export const listNotificationsForUser = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req);

    // support both employee and owner fetch
    const query = (req.employee && req.employee._id)
      ? { user: req.employee._id, ownerId: req.employee.ownerId }
      : null;

    if (query) {
      // .lean() - result goes straight to res.json(), never mutated;
      // Notification has no virtuals/instance methods/middleware (verified
      // against models/Notification.js).
      const [items, total] = await Promise.all([
        Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Notification.countDocuments(query),
      ]);
      const hasMore = skip + items.length < total;
      // Legacy top-level page/limit/total/hasMore kept exactly as before -
      // confirmed Flutter's notification_service.dart reads `hasMore` at
      // the top level, so moving it under meta-only would have silently
      // broken that. meta is added alongside, not instead of.
      return res.status(200).json({
        success: true,
        message: 'Notifications retrieved',
        data: items,
        page,
        limit,
        total,
        hasMore,
        meta: { page, limit, total, hasMore },
      });
    }

    const user = req.user;
    if (!user || !user.ownerId) {
      return unauthorized(res, 'User not authenticated');
    }

    const ownerQuery = { ownerId: user.ownerId, category: 'checkin' };
    const [items, total] = await Promise.all([
      Notification.find(ownerQuery).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments(ownerQuery),
    ]);
    const hasMore = skip + items.length < total;

    return res.status(200).json({
      success: true,
      message: 'Notifications retrieved',
      data: items,
      page,
      limit,
      total,
      hasMore,
      meta: { page, limit, total, hasMore },
    });
  } catch (error) {
    obsLog('notification_list_error', { message: error.message });
    return serverError(res, 'Failed to list notifications');
  }
}

// GET /api/notifications/count - unread badge count for the Bell icon.
// Supports both the employee (mobile) and owner (dashboard) callers, same
// scoping rules as listNotificationsForUser above.
export const getUnreadCount = async (req, res) => {
  try {
    const query = (req.employee && req.employee._id)
      ? { user: req.employee._id, ownerId: req.employee.ownerId, read: false }
      : null;

    if (query) {
      const count = await Notification.countDocuments(query);
      return res.status(200).json({ success: true, message: 'Unread count retrieved', unreadCount: count, data: { unreadCount: count } });
    }

    const user = req.user;
    if (!user || !user.ownerId) {
      return unauthorized(res, 'User not authenticated');
    }

    const count = await Notification.countDocuments({ ownerId: user.ownerId, category: 'checkin', read: false });
    return res.status(200).json({ success: true, message: 'Unread count retrieved', unreadCount: count, data: { unreadCount: count } });
  } catch (error) {
    obsLog('notification_unread_count_error', { message: error.message });
    return serverError(res, 'Failed to get unread count');
  }
}

// POST /api/notifications/mark-all-read
export const markAllNotificationsRead = async (req, res) => {
  try {
    if (req.employee && req.employee._id) {
      await Notification.updateMany(
        { user: req.employee._id, ownerId: req.employee.ownerId, read: false },
        { $set: { read: true } }
      );
      return success(res, { message: 'All notifications marked read' });
    }

    const user = req.user;
    if (!user || !user.ownerId) {
      return unauthorized(res, 'User not authenticated');
    }

    await Notification.updateMany(
      { ownerId: user.ownerId, read: false },
      { $set: { read: true } }
    );
    return success(res, { message: 'All notifications marked read' });
  } catch (error) {
    obsLog('notification_mark_all_read_error', { message: error.message });
    return serverError(res, 'Failed to mark all read');
  }
}

export const markNotificationRead = async (req, res) => {
  try {
    const id = req.params.id;
    const user = req.user || {};
    if (!user.ownerId && !req.employee) return unauthorized(res, 'Not authenticated');
    const ownerId = user.ownerId || req.employee.ownerId;
    const n = await Notification.findOne({ _id: id, ownerId });
    if (!n) return notFound(res, 'Notification not found');

    // If the caller is an employee, they may only mark their own notifications read.
    if (req.employee && String(n.user) !== String(req.employee._id)) {
      return forbidden(res, 'Forbidden');
    }

    n.read = true;
    await n.save();
    return success(res, { message: 'Marked read' });
  } catch (error) {
    obsLog('notification_mark_read_error', { message: error.message });
    return serverError(res, 'Failed to mark read');
  }
}

export async function deleteAllNotifications(req, res) {
  try {
    const user = req.user;
    if (!user || !user.ownerId) {
      return unauthorized(res, 'User not authenticated');
    }
    await Notification.deleteMany({ ownerId: user.ownerId });
    return success(res, { message: 'All notifications deleted' });
  } catch (error) {
    obsLog('notification_delete_all_error', { message: error.message });
    return serverError(res, 'Failed to delete notifications');
  }
}

export default {
  createNotification,
  listNotificationsForUser,
  markNotificationRead,
  deleteAllNotifications,
  getUnreadCount,
  markAllNotificationsRead,
};
