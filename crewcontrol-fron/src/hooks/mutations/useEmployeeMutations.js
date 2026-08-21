import { useApiMutation } from './useApiMutation'
import { employeesApi } from '../../api/employees'
import { queryKeys } from '../../queryKeys'
import { EMPLOYEES_LIST_PARAMS } from '../useEmployees'

// The one query key useEmployees.js actually populates today - targeting
// this exact key (not a wildcard/predicate) per Step 5's "invalidate only
// the necessary queries." Imported from useEmployees.js rather than
// re-declaring the {page:1,limit:500} literal here - audit found the
// duplicate literal as a live risk (already wired into Employees.jsx):
// if the two files' literals ever drifted, this hook's optimistic
// patching and invalidation would silently target a stale/nonexistent
// cache key with no error.
const EMPLOYEES_LIST_KEY = queryKeys.employees.list(EMPLOYEES_LIST_PARAMS)

// Broad invalidation targets added alongside the exact key above: React
// Query's invalidateQueries prefix-matches, so `employees.lists()`
// (['employees','list']) also catches every paginated/filtered/searched
// employees.list(...) variant now in use (Employees.jsx's per-tab server
// pagination, useEmployeesPage) - without this, assigning/unassigning/
// reactivating an employee would only refresh the one legacy
// {page:1,limit:500} view and leave every other tab's table and the
// employeeStats KPI numbers stale until their TTL expired.
const EMPLOYEES_ALL_LISTS_KEY = queryKeys.employees.lists()
const EMPLOYEE_STATS_KEY = queryKeys.dashboard.summary({ part: 'employeeStats' })
const BROAD_INVALIDATE_KEYS = [EMPLOYEES_LIST_KEY, EMPLOYEES_ALL_LISTS_KEY, EMPLOYEE_STATS_KEY]

// Patches one employee's cached row in place, returning the previous full
// list for rollback. No-op (returns undefined) if the list isn't cached
// yet - callers already guard on employeeId, but this is defensive too.
const patchEmployee = (queryClient, employeeId, patch) => {
  const previous = queryClient.getQueryData(EMPLOYEES_LIST_KEY)
  if (!Array.isArray(previous)) return undefined

  queryClient.setQueryData(
    EMPLOYEES_LIST_KEY,
    previous.map((emp) => (String(emp?._id) === String(employeeId) ? { ...emp, ...patch } : emp))
  )
  return previous
}

const rollbackEmployees = (queryClient, previous) => {
  if (previous !== undefined) queryClient.setQueryData(EMPLOYEES_LIST_KEY, previous)
}

// --- Unassign ---------------------------------------------------------
// Backend sets exactly {company: null, lifecycleState: 'WAITING_FOR_COMPANY',
// assignedStatus: 'on-hold'} (verified against
// backend/src/controllers/employee.controller.js's unassignEmployee - a
// fixed literal, not computed, which is what makes this safe to predict
// optimistically). invalidateTiming: 'success' matches the original
// handler exactly - it had no catch block, so a failed request never
// reached its refetch call; only a successful one did.
export const useUnassignEmployeeMutation = () =>
  useApiMutation({
    mutationFn: (employeeId) => employeesApi.unassignEmployee(employeeId),
    invalidateKeys: BROAD_INVALIDATE_KEYS,
    invalidateTiming: 'success',
    optimisticUpdate: (queryClient, employeeId) =>
      patchEmployee(queryClient, employeeId, { company: null, lifecycleState: 'WAITING_FOR_COMPANY', assignedStatus: 'on-hold' }),
    rollback: rollbackEmployees,
  })

// --- Reactivate ---------------------------------------------------------
// Backend sets exactly {assignedStatus: 'on-site', lifecycleState: 'ASSIGNED'}
// (verified against reactivateEmployee) - deterministic. Preserves the
// original handler's exact behavior: errors are swallowed (only
// console.error'd, never surfaced to the user) and a refetch always
// happens regardless of outcome (invalidateTiming: 'settled').
export const useReactivateEmployeeMutation = () =>
  useApiMutation({
    mutationFn: (employeeId) => employeesApi.reactivateEmployee(employeeId),
    invalidateKeys: BROAD_INVALIDATE_KEYS,
    invalidateTiming: 'settled',
    optimisticUpdate: (queryClient, employeeId) =>
      patchEmployee(queryClient, employeeId, { assignedStatus: 'on-site', lifecycleState: 'ASSIGNED' }),
    rollback: rollbackEmployees,
    onError: (error) => {
      // Matches the original handler's exact console.error call and
      // message shape - errors were never surfaced to the user before,
      // preserved here rather than newly adding visible error UI.
      console.error('Failed to reactivate employee:', error.message)
    },
  })

// --- Assign ---------------------------------------------------------
// Backend sets exactly {company: companyId, lifecycleState: 'ASSIGNED',
// assignedStatus: 'on-site'} (verified against assignEmployeeToCompany) -
// deterministic. invalidateTiming: 'success' matches the original (no
// catch block - a failed request never reached handleCloseAssignDialog()
// or the refetch). The dialog-close side effect stays in Employees.jsx's
// onSuccess callback, not in this hook, since it's page-specific UI state.
export const useAssignEmployeeMutation = () =>
  useApiMutation({
    mutationFn: ({ employeeId, companyId }) => employeesApi.assignEmployee(employeeId, companyId),
    invalidateKeys: BROAD_INVALIDATE_KEYS,
    invalidateTiming: 'success',
    optimisticUpdate: (queryClient, { employeeId, companyId }) =>
      patchEmployee(queryClient, employeeId, { company: companyId, lifecycleState: 'ASSIGNED', assignedStatus: 'on-site' }),
    rollback: rollbackEmployees,
  })
