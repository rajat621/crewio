import api from './client'
import { employeesApi } from './employees'

export const expensesApi = {
  getExpenses: (employeeId, page, limit, search) =>
    api.get('/api/expenses', {
      params: employeeId
        ? { employeeId }
        : {
            ...(page ? { page } : {}),
            ...(limit ? { limit } : {}),
            ...(search ? { search } : {}),
          },
    }),
  addExpense: (data) => api.post('/api/expenses', data),
  replaceEmployeeExpenses: (employeeId, expenses) =>
    employeesApi.updateEmployee(employeeId, { expenses }),
  // removeEmployeeExpenses removed (dead code cleanup) - zero usage
  // anywhere in the frontend; replaceEmployeeExpenses (used by
  // Expenses.jsx's delete-record flow) already covers clearing all
  // records if ever called with an empty array.
}
