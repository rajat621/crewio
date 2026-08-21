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

  // getInvoice/generateInvoice/updateInvoice removed (dead code cleanup)
  // - zero usage anywhere in the frontend. generateDraft/
  // generateInvoiceRecord (below) are the invoice creation flow actually
  // used (GenerateTaxInvoice.jsx).

  generateInvoiceRecord: (data) => {
    const timeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS || 300000);
    return api.post('/api/invoices/generate', data, { timeout: timeoutMs });
  },

  
  generateDraft: (data) =>
    api.post("/api/invoices/drafts", data),

  getDraft: (draftId) =>
    api.get(`/api/invoices/drafts/${draftId}`),

  downloadInvoice: (id) =>
    api.get(`/api/invoices/${id}/download`, {
      responseType: 'blob'
    })
  ,
  deleteInvoice: (id) => api.delete(`/api/invoices/${id}`)
}

// Async AI job endpoints
export const aiJobsApi = {
  createJob: (data) => {
    const timeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS || 300000);
    return api.post('/api/ai/jobs', data, { timeout: timeoutMs });
  },
  getJobStatus: (jobId) => api.get(`/api/ai/jobs/${jobId}`),
  getJobResult: (jobId) => api.get(`/api/ai/jobs/${jobId}/result`),
};

export default invoicesApi;