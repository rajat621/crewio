import api from './client'
import { employeesApi } from './employees'

export const expensesApi = {
  getExpenses: (employeeId) =>
    api.get('/api/expenses', {
      params: employeeId ? { employeeId } : undefined,
    }),
  addExpense: (data) => api.post('/api/expenses', data),
  replaceEmployeeExpenses: (employeeId, expenses) =>
    employeesApi.updateEmployee(employeeId, { expenses }),
  removeEmployeeExpenses: (employeeId) =>
    employeesApi.updateEmployee(employeeId, { expenses: { records: [] } }),
}
