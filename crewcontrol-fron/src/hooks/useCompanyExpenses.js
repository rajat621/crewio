import { useQuery } from '@tanstack/react-query'
import { companyExpensesApi } from '../api/companyExpenses'
import { queryKeys } from '../queryKeys'
import { normalizeCompanyExpenseRows } from '../utils/expenseDerivation'

// companyExpensesApi.listCompanyExpenses returns {expenses: [...]} - not
// employees/data/companies, so extractList's generic checks don't match
// it; kept as an explicit check here rather than forcing the normalizer
// to know about every possible field name.
export const useCompanyExpenses = (month) =>
  useQuery({
    queryKey: queryKeys.companyExpenses.list({ month }),
    queryFn: async () => {
      const response = await companyExpensesApi.listCompanyExpenses(month);
      const records = Array.isArray(response?.data?.expenses)
        ? response.data.expenses
        : Array.isArray(response?.data?.data)
          ? response.data.data
          : [];
      return normalizeCompanyExpenseRows(records);
    },
  })
