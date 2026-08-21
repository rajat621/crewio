import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    read: { type: Boolean, default: false },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    // Only 'checkin' notifications are ever shown on the dashboard bell
    // (see notification.controller.js's owner-scoped queries) - every
    // other notification (salary slip generated, status change, chat
    // message) is employee/mobile-only. Left null on any notification
    // created before this field existed, which is exactly what keeps
    // legacy stray dashboard notifications from those events out of the
    // bell without needing a manual cleanup pass.
    category: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

const Notification = mongoose.model('Notification', notificationSchema);

// Two compound indexes, one per caller - the employee/mobile side always
// filters {user, ownerId} together (notification.controller.js's
// listNotificationsForUser/getUnreadCount/markAllNotificationsRead), and
// the owner/dashboard side always filters {ownerId} with {category}
// alongside it for the bell-specific queries. Neither caller shares a
// common leading-equality prefix with the other (user vs ownerId), so one
// shared compound index can't cover both list-and-sort patterns without a
// blocking in-memory sort on one side - hence two indexes, not one.
notificationSchema.index({ user: 1, ownerId: 1, createdAt: -1 });
notificationSchema.index({ ownerId: 1, category: 1, createdAt: -1 });

// NOTE (cleanup candidate, not done here): the three single-field indexes
// above (user, ownerId, category) each look fully covered by a prefix of
// one of the two compound indexes now that those exist - no query in
// notification.controller.js filters any of those three fields without
// also filtering its compound-index partner field(s). Left in place
// deliberately rather than dropped in this same commit; verify with a real
// explain() per field before removing any of them.

export default Notification;


