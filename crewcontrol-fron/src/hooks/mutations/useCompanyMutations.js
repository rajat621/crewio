import { useApiMutation } from './useApiMutation'
import { companiesApi } from '../../api/companies'
import { COMPANIES_LIST_KEY } from '../useCompaniesPageData'

// Reproduces Company.jsx's original handleDeactivateCompany exactly: it
// already had a hand-rolled optimistic flip + rollback-on-failure before
// this migration - same behavior, now via useApiMutation instead of
// manual setCompanyRows calls. Status toggling is a simple reversible
// field flip (not a multi-step state machine transition like employee
// assignment), so it's a safe optimistic candidate.
export const useToggleCompanyStatusMutation = () =>
  useApiMutation({
    mutationFn: ({ companyId, apiStatus }) => companiesApi.updateCompany(companyId, { status: apiStatus }),
    invalidateKeys: [COMPANIES_LIST_KEY],
    invalidateTiming: 'settled',
    optimisticUpdate: (queryClient, { companyId, nextStatus }) => {
      const previous = queryClient.getQueryData(COMPANIES_LIST_KEY)
      if (!Array.isArray(previous)) return undefined
      queryClient.setQueryData(
        COMPANIES_LIST_KEY,
        previous.map((row) => (row.id === companyId ? { ...row, status: nextStatus } : row))
      )
      return previous
    },
    rollback: (queryClient, previous) => {
      if (previous !== undefined) queryClient.setQueryData(COMPANIES_LIST_KEY, previous)
    },
  })
