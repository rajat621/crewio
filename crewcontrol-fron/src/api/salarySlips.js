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

  // downloadSalarySlip removed (dead code cleanup) - zero usage anywhere
  // in the frontend; PDF generation happens client-side via
  // GenerateSalarySlip.jsx's generateSalarySlipPdf instead of fetching a
  // pre-rendered file from the backend.
}

