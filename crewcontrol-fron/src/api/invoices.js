import api from './client'

export const invoicesApi = {
  getNextInvoiceNumber: () =>
    api.get('/api/invoices/next-number'),

  uploadTimesheet: (file) => {
    const formData = new FormData()
    formData.append('file', file)

    return api.post('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  },

  getInvoices: (params) =>
    api.get('/api/invoices', { params }),
  
  getInvoice: (id) =>
    api.get(`/api/invoices/${id}`),
  
  generateInvoiceRecord: (data) =>
    api.post('/api/invoices/generate', data, { timeout: 120000 }),

  generateInvoice: (data) =>
    api.post('/api/invoices', data),
  
  updateInvoice: (id, data) =>
    api.put(`/api/invoices/${id}`, data),
  
  downloadInvoice: (id) =>
    api.get(`/api/invoices/${id}/download`, {
      responseType: 'blob'
    })
  ,
  deleteInvoice: (id) => api.delete(`/api/invoices/${id}`)
}
