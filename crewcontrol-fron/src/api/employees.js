import api from './client'

export const employeesApi = {
  getEmployees: (params) =>
    api.get('/api/employees', { params }),
  
  getEmployee: (id) =>
    api.get(`/api/employees/${id}`),
  
  createEmployee: (data) =>
    api.post('/api/employees', data),
  
  updateEmployee: (id, data) =>
    api.put(`/api/employees/${id}`, data),
  
  deleteEmployee: (id) =>
    api.delete(`/api/employees/${id}`),
  
  assignEmployee: (id, companyId) =>
    api.post(`/api/employees/${id}/assign`, { companyId }),

  unassignEmployee: (id) =>
    api.post(`/api/employees/${id}/unassign`),

  // Direct "Site Assigned" action - no popup, reuses the employee's
  // existing company (see backend reactivateEmployee).
  reactivateEmployee: (id) =>
    api.post(`/api/employees/${id}/reactivate`),
  
  getEmployeeAttendance: (id, params) =>
    api.get(`/api/employees/${id}/attendance`, { params }),

  // Real-time location (backed by EmployeeLocation + Socket.IO, see
  // backend/src/controllers/location.controller.js)
  getLatestLocation: (employeeId) =>
    api.get('/api/owner/locations/latest', { params: { employeeId } }),

  getLocationHistory: (employeeId, limit) =>
    api.get('/api/owner/locations', { params: { employeeId, limit } }),

  requestCurrentLocation: (employeeId) =>
    api.post('/api/owner/locations/request', { employeeId })
}
