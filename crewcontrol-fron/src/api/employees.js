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
  
  getEmployeeAttendance: (id, params) =>
    api.get(`/api/employees/${id}/attendance`, { params })
}
