import api from './client'

export const companyExpensesApi = {
  listCompanyExpenses: (month) =>
    api.get('/api/company-expenses', {
      params: month ? { month } : undefined,
    }),

  createCompanyExpense: (data) =>
    api.post('/api/company-expenses', data),

  updateCompanyExpense: (id, data) =>
    api.put(`/api/company-expenses/${id}`, data),

  deleteCompanyExpense: (id) =>
    api.delete(`/api/company-expenses/${id}`),
}