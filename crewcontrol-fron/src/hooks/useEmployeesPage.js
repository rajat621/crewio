import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { employeesApi } from '../api/employees'
import { queryKeys } from '../queryKeys'
import { normalizeListResponse } from '../utils/apiResponseNormalizer'

// True server-side pagination + server-side search for the Employees
// page's main table - the previous `useEmployees()` fetched a single
// (backend-capped-at-200) page once and did all search/pagination over
// that same fixed page client-side, so records beyond it were simply
// unreachable regardless of what was searched for. This hook fetches
// exactly the requested page/search from the backend instead, so paging
// forward or searching can reach the full tenant dataset (see
// employee.controller.js's getEmployees `search` param).
export const useEmployeesPage = (page, limit, search, filters = {}, options = {}) => {
  // filters: { assignedStatus, passportStatus, emirateIdStatus } - passed
  // straight through to getEmployees so a KPI-card click filters the
  // table server-side (matching the same full-population number the KPI
  // row itself shows via /api/employees/stats), instead of filtering
  // whatever single page was already loaded client-side.
  const { assignedStatus, passportStatus, emirateIdStatus } = filters;
  // Phase 5: Employees.jsx mounts every tab's data hook unconditionally on
  // page load (Employee Detail/Assigned/Attendance/Passport/EmirateID/
  // Track Employee all fired together regardless of which tab was actually
  // open), so visiting the default tab paid for 5+ tabs' worth of queries
  // it wasn't even showing. `enabled` (default true, so any existing call
  // site that doesn't pass it keeps firing immediately) lets a caller defer
  // the query until its tab is actually selected.
  const { enabled = true } = options;
  return useQuery({
    queryKey: queryKeys.employees.list({ page, limit, search: search || '', assignedStatus: assignedStatus || '', passportStatus: passportStatus || '', emirateIdStatus: emirateIdStatus || '' }),
    queryFn: async () => {
      const { items, meta } = normalizeListResponse(
        await employeesApi.getEmployees({
          page, limit, search: search || undefined,
          assignedStatus: assignedStatus || undefined,
          passportStatus: passportStatus || undefined,
          emirateIdStatus: emirateIdStatus || undefined,
        })
      )
      return { items, total: meta?.total ?? items.length }
    },
    // Keeps the previous page's rows on screen while the next page loads
    // instead of flashing an empty table - standard for paginated tables.
    placeholderData: keepPreviousData,
    enabled,
  })
}
