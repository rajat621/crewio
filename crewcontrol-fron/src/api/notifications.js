import api from './client';

export const notificationsApi = {
  listMyNotifications: () => api.get('/api/notifications'),
  listOwnerNotifications: (userId) => api.get('/api/notifications/owner'),
  markRead: (id) => api.post(`/api/notifications/${id}/read`),
};

export default notificationsApi;
