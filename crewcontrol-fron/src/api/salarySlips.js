import api from './client'

export const salarySlipsApi = {
  listSalarySlips: (employeeId, month, page, limit, search) =>
    api.get('/api/salary-slips', {
      params: {
        ...(employeeId ? { employeeId } : {}),
        ...(month ? { month } : {}),
        ...(page ? { page } : {}),
        ...(limit ? { limit } : {}),
        ...(search ? { search } : {}),
      },
    }),

  getSalarySlip: (id) =>
    api.get(`/api/salary-slips/${id}`),

  // Lightweight next-slip-number + duplicate-check, backed by indexed
  // lookups instead of fetching the tenant's entire slip history (see
  // salarySlip.controller.js's getSalarySlipGenerateInfo comment).
  getGenerateInfo: (employeeId, month, year) =>
    api.get('/api/salary-slips/generate-info', {
      params: {
        ...(employeeId ? { employeeId } : {}),
        ...(month ? { month } : {}),
        ...(year ? { year } : {}),
      },
    }),

  createSalarySlip: (data) =>
    api.post('/api/salary-slips', data),

  updateSalarySlip: (id, data) =>
    api.put(`/api/salary-slips/${id}`, data),

  // Restored (was removed as "dead code" - it wasn't: the backend route
  // it hits, GET /api/salary-slips/:id/download, is the only place that
  // reconstructs a usable slipData snapshot for a slip saved before that
  // snapshot field existed - see salarySlip.controller.js's
  // downloadSalarySlip. SalarySlipRow.jsx's client-side path has no such
  // fallback and just fails with "Full slip data not available" for any
  // pre-existing slip missing slipData; this is the fallback it now calls.
  downloadSalarySlip: (id) =>
    api.get(`/api/salary-slips/${id}/download`, { responseType: 'blob' }),
}

