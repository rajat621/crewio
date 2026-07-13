import api from './client'

export const attendanceApi = {
  markAttendance: (data) =>
    api.post('/api/attendance', data),
  
  getAttendance: (params) =>
    api.get('/api/attendance', { params }),
  
  updateAttendance: (id, data) =>
    api.put(`/api/attendance/${id}`, data),

  deleteAttendance: (id) =>
    api.delete(`/api/attendance/${id}`),
  
  getAttendanceSummary: (params) =>
    api.get('/api/attendance/summary', { params })
}
