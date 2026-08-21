import api from './client'

export const companiesApi = {
  getCompanies: (params) =>
    api.get('/api/companies', { params }),
  
  getCompany: (id) =>
    api.get(`/api/companies/${id}`),

  // Owner-specific. `includeAssets` opts into the legacy full shape
  // (logo/stamp/signature/invoiceTemplate base64 inline) - only
  // CompanyProfile/OnboardingCompanyProfile, which genuinely display and
  // let the user edit all 4, should ever pass it. Every other caller gets
  // lightweight metadata + hasLogo/hasStamp/hasSignature/
  // hasInvoiceTemplate booleans (see company.controller.js's
  // getOwnerCompany).
  getOwnerCompany: (includeAssets = false) =>
    api.get('/api/companies/owner/me', { params: includeAssets ? { includeAssets: 'true' } : undefined }),
  updateOwnerCompany: (data) => api.put('/api/companies/owner/me', data),

  // On-demand binary fetch for one asset field - field is one of
  // 'logo' | 'stamp' | 'signature' | 'invoiceTemplate'. Returns the raw
  // image/PDF bytes (Content-Type set by the server from the stored data
  // URI), not JSON - callers that need it as base64 (e.g. embedding into a
  // client-generated PDF) should fetch as a blob and re-encode via
  // FileReader, same pattern already used for invoice-draft source PDFs.
  getOwnerCompanyAsset: (field) =>
    api.get(`/api/companies/owner/assets/${field}`, { responseType: 'blob' }),

  getVatSummary: () => api.get('/api/companies/owner/vat-summary'),
  markVatPaid: () => api.post('/api/companies/owner/vat-mark-paid'),
  
  createCompany: (data) =>
    api.post('/api/companies', {
      ...data,
      companyRole: data?.companyRole || 'client',
    }),
  
  updateCompany: (id, data) =>
    api.put(`/api/companies/${id}`, data),

  // deleteCompany/createClientCompany removed (dead code cleanup) - zero
  // usage anywhere in the frontend. createCompany (above) is the function
  // actually used for company creation.
  // Client-specific
  getClientCompanies: (params) => api.get('/api/companies/clients', { params }),

  // Per-company {totalWorkers, present, absent, onLeave}, computed
  // server-side (see company.controller.js's getCompanyWorkforceSummary) -
  // replaces fetching every employee + raw attendance record just to join
  // them client-side.
  getCompanyWorkforceSummary: () => api.get('/api/companies/workforce-summary'),
}
