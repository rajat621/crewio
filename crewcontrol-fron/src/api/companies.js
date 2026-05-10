import api from './client'

export const companiesApi = {
  getCompanies: (params) =>
    api.get('/api/companies', { params }),
  
  getCompany: (id) =>
    api.get(`/api/companies/${id}`),

  // Owner-specific
  getOwnerCompany: () => api.get('/api/companies/owner/me'),
  updateOwnerCompany: (data) => api.put('/api/companies/owner/me', data),
  
  createCompany: (data) =>
    api.post('/api/companies', {
      ...data,
      companyRole: data?.companyRole || 'client',
    }),
  
  updateCompany: (id, data) =>
    api.put(`/api/companies/${id}`, data),
  
  deleteCompany: (id) =>
    api.delete(`/api/companies/${id}`)
  ,
  // Client-specific
  getClientCompanies: (params) => api.get('/api/companies/clients', { params }),
  createClientCompany: (data) => api.post('/api/companies/clients', data),
}
