import api from './client'

export const dashboardApi = {
  getStats: (params) =>
    api.get('/api/dashboard/stats', { params })
}
