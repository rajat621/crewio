import api from './client';

export const notificationsApi = {
  // listMyNotifications removed (dead code cleanup) - zero usage
  // anywhere in the frontend; this web dashboard is owner/admin-facing,
  // the employee-self notification view lives in the separate mobile app.
  listOwnerNotifications: (userId) => api.get('/api/notifications/owner'),
  markRead: (id) => api.post(`/api/notifications/${id}/read`),
  deleteAllOwnerNotifications: () => api.delete('/api/notifications/owner'),
  // Added during the Notifications React Query migration - the backend
  // endpoint already existed (routes/notification.routes.js) but had no
  // frontend caller: markAllAsRead previously looped markRead() once per
  // unread notification instead of using this dedicated bulk endpoint.
  //
  // NOTE: a dedicated GET /api/notifications/owner/count endpoint also
  // exists server-side but isn't wrapped here - the migrated
  // useUnreadNotifications derives the badge count from the same cached
  // list query useNotifications() already populates (verified equivalent:
  // both use the identical {ownerId, category:'checkin'} filter, count
  // endpoint adds read:false, list is filtered by !n.read client-side -
  // same result), which costs zero extra network round-trips instead of
  // one. Not adding an unused wrapper for it.
  markAllOwnerNotificationsRead: () => api.post('/api/notifications/owner/read-all'),
};

export default notificationsApi;
