import { useApiMutation } from './useApiMutation'
import { companiesApi } from '../../api/companies'
import { employeesApi } from '../../api/employees'
import { queryKeys } from '../../queryKeys'

export const useUpdateCompanyDetailMutation = (id) =>
  useApiMutation({
    mutationFn: (payload) => companiesApi.updateCompany(id, payload),
    // Phase 3.10: queryKeys.companies.all ([resource]) is a prefix of
    // queryKeys.companies.detail(id) ([resource,'detail',id]) - the
    // detail key was redundant here (already fully covered by .all),
    // making every firing of this mutation do one unnecessary
    // invalidateQueries call for zero additional invalidation coverage.
    invalidateKeys: [queryKeys.companies.all],
    invalidateTiming: 'settled',
  })

// Distinct from useEmployeeMutations.js's useUnassignEmployeeMutation -
// that one is scoped to Employees.jsx's own {page:1,limit:500} list key.
// This page's employees query is scoped by assignedCompanyId instead, so
// it needs its own invalidation target rather than reusing (and silently
// not refreshing) the other page's mutation.
export const useRemoveWorkerFromCompanyMutation = (companyId) =>
  useApiMutation({
    mutationFn: (employeeId) => employeesApi.unassignEmployee(employeeId),
    invalidateKeys: [queryKeys.employees.all, queryKeys.companies.detail(companyId)],
    invalidateTiming: 'settled',
  })
