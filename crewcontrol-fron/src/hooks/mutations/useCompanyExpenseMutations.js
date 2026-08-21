import { useApiMutation } from './useApiMutation'
import { companyExpensesApi } from '../../api/companyExpenses'
import { queryKeys } from '../../queryKeys'

// month isn't part of the mutation payload, so invalidate the whole
// companyExpenses resource (all months) rather than guessing which
// month-scoped list key is currently active - matches the original's
// own behavior of reloading whichever month was selected via
// loadCompanyExpenses() after every mutation.
const COMPANY_EXPENSES_ALL = queryKeys.companyExpenses.all

export const useCreateCompanyExpenseMutation = () =>
  useApiMutation({
    mutationFn: (payload) => companyExpensesApi.createCompanyExpense(payload),
    invalidateKeys: [COMPANY_EXPENSES_ALL],
    invalidateTiming: 'settled',
  })

export const useUpdateCompanyExpenseMutation = () =>
  useApiMutation({
    mutationFn: ({ id, payload }) => companyExpensesApi.updateCompanyExpense(id, payload),
    invalidateKeys: [COMPANY_EXPENSES_ALL],
    invalidateTiming: 'settled',
  })

export const useDeleteCompanyExpenseMutation = () =>
  useApiMutation({
    mutationFn: (id) => companyExpensesApi.deleteCompanyExpense(id),
    invalidateKeys: [COMPANY_EXPENSES_ALL],
    invalidateTiming: 'settled',
  })
