import { useApiMutation } from './useApiMutation'
import { expensesApi } from '../../api/expenses'
import { laborExpensesKey } from '../useLaborExpenses'

// Invalidates the labor-expenses summary for whichever user context is
// currently viewing - matches the original's own await loadExpenses()
// after every mutation (always reloaded the same page's data, not a
// targeted per-employee cache patch, since the summary recomputes
// aggregate totals across all of an employee's records).
export const useAddExpenseMutation = (user) =>
  useApiMutation({
    mutationFn: (payload) => expensesApi.addExpense(payload),
    invalidateKeys: [laborExpensesKey(user)],
    invalidateTiming: 'settled',
  })

// Backs both the edit path (replace one record within the array) and the
// delete path (replace with the array minus one record) - same as the
// original's single persistRecords() function serving both call sites.
export const useReplaceEmployeeExpensesMutation = (user) =>
  useApiMutation({
    mutationFn: ({ employeeId, records }) => expensesApi.replaceEmployeeExpenses(employeeId, { records }),
    invalidateKeys: [laborExpensesKey(user)],
    invalidateTiming: 'settled',
  })
