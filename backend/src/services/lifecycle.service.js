import Notification from '../models/Notification.js';
import { createAuditLog } from './audit.service.js';
import { emitToOwner, emitToEmployee } from './socket.service.js';
import { sendPushToEmployee } from './push.service.js';

/**
 * Fan out a single employee lifecycle event to every downstream consumer:
 *  - Dashboard real-time event (Socket.IO, room `owner:<ownerId>`)
 *  - Persisted dashboard Notification (so it also shows up if the office
 *    wasn't connected at the time)
 *  - Mobile push notification (FCM) when the event is meant for the employee
 *  - Audit log entry
 *
 * Kept as one function so every mobile lifecycle endpoint (check-in, start
 * work, stop work, site finished, leave start/end, assignment) reports
 * consistently instead of each controller re-implementing this fan-out.
 */
export const reportLifecycleEvent = async ({
  employee,
  ownerId,
  event, // e.g. 'employee:checked_in'
  action, // audit log action string, e.g. 'employee.checkIn'
  title,
  body,
  data = {},
  notifyEmployeePush = false,
  pushTitle,
  pushBody,
}) => {
  const resolvedOwnerId = ownerId || employee?.ownerId || employee?.owner || null;

  const eventPayload = {
    employeeId: String(employee._id),
    employeeName: employee.name,
    lifecycleState: employee.lifecycleState,
    companyId: employee.company ? String(employee.company) : null,
    at: new Date().toISOString(),
    ...data,
  };

  // 1. Real-time dashboard event
  try {
    emitToOwner(resolvedOwnerId, event, eventPayload);
  } catch (err) {
    console.error('[lifecycle] socket emit failed', err.message);
  }

  // 2. Persisted dashboard notification (owner-facing "user" field here is
  // historically the target account the notification is shown under - we
  // reuse the employee's ownerId owner-user record as the recipient since
  // that's how notification.controller.js already scopes queries).
  if (resolvedOwnerId && title) {
    try {
      await Notification.create({
        user: resolvedOwnerId,
        title,
        body: body || '',
        payload: eventPayload,
        ownerId: resolvedOwnerId,
      });
    } catch (err) {
      console.error('[lifecycle] failed to persist dashboard notification', err.message);
    }
  }

  // 3. Push notification to the employee's device (e.g. "You have been
  // assigned to Site X" or leave/attendance confirmations), plus a
  // persisted Notification under the EMPLOYEE's own id so it also shows up
  // in their in-app Notifications list (notification_page.dart ->
  // GET /api/notifications), not just as a transient push. Previously only
  // the owner's dashboard copy (step 2 above) was persisted - the
  // employee's own history was push-only and vanished if they missed it.
  if (notifyEmployeePush) {
    try {
      await sendPushToEmployee(employee, {
        title: pushTitle || title,
        body: pushBody || body,
        data: eventPayload,
      });
    } catch (err) {
      console.error('[lifecycle] push notification failed', err.message);
    }

    try {
      await Notification.create({
        user: employee._id,
        title: pushTitle || title,
        body: pushBody || body || '',
        payload: eventPayload,
        ownerId: resolvedOwnerId,
      });
    } catch (err) {
      console.error('[lifecycle] failed to persist employee notification', err.message);
    }
  }

  // 4. Audit trail
  try {
    await createAuditLog({
      action,
      entity: 'Employee',
      entityId: employee._id,
      ownerId: resolvedOwnerId,
      company: employee.company || null,
      changes: data,
    });
  } catch (err) {
    console.error('[lifecycle] audit log failed', err.message);
  }
};

/** Also push a live location event to the dashboard (separate from the persisted-notification path above, since locations fire far too often to notify on). */
export const reportLocationEvent = ({ employee, ownerId, lat, lng, accuracy, timestamp, source }) => {
  const resolvedOwnerId = ownerId || employee?.ownerId || employee?.owner || null;
  emitToOwner(resolvedOwnerId, 'employee:location_update', {
    employeeId: String(employee._id),
    employeeName: employee.name,
    lat,
    lng,
    accuracy,
    timestamp,
    source, // 'check_in' | 'start_work' | 'stop_work' | 'site_finished' | 'background'
  });
};

/** Ask a specific employee's connected device to push its current location right now. */
export const requestEmployeeLocationNow = (employeeId) => {
  emitToEmployee(employeeId, 'location:requested', { requestedAt: new Date().toISOString() });
};

export default { reportLifecycleEvent, reportLocationEvent, requestEmployeeLocationNow };