import { useQuery } from '@tanstack/react-query'
import { employeesApi } from '../api/employees'
import { queryKeys } from '../queryKeys'
import { normalizeListResponse } from '../utils/apiResponseNormalizer'

// Exported (not just a local literal) so useEmployeeMutations.js's cache
// patching targets the exact same query key this hook populates, instead
// of independently re-declaring {page:1,limit:500} in two places that
// could silently drift out of sync - found during infrastructure audit.
export const EMPLOYEES_LIST_PARAMS = { page: 1, limit: 500 }

// Wraps the employee list fetch used by Employees.jsx today. Same params
// (not changed here; that's a backend-pagination concern, out of scope for
// this frontend-only batch). Response parsing now goes through the shared
// normalizeListResponse (apiResponseNormalizer.js) instead of duplicating
// its dual-shape parsing inline - this hook was written before the
// normalizer existed and never updated to use it; audit found it as a
// live duplicated-logic issue, fixed here. Output is unchanged: still a
// plain array, verified against normalizeListResponse's extractList
// checking response.data.employees before the generic response.data.data
// fallback, matching this hook's original field-check order (confirmed
// against backend/src/controllers/employee.controller.js: `data` and
// `employees` are literally the same array reference server-side, so the
// two orders are equivalent today regardless - checked, not assumed).
export const useEmployees = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.employees.list(EMPLOYEES_LIST_PARAMS),
    queryFn: async () => {
      const response = await employeesApi.getEmployees(EMPLOYEES_LIST_PARAMS)
      return normalizeListResponse(response).items
    },
    enabled,
  })
}
