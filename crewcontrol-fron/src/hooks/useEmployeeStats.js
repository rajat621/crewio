import { useQuery } from '@tanstack/react-query'
import { employeesApi } from '../api/employees'
import { queryKeys } from '../queryKeys'

// Single source of truth for every full-tenant-population employee count
// (total/assignedStatus/passportStatus/emirateIdStatus) - backed by
// GET /api/employees/stats' $facet aggregation. Every KPI row on the
// Employees page (and the dashboard) should read from this, never from
// scanning whatever page of employees happens to be loaded.
export const useEmployeeStats = () =>
  useQuery({
    queryKey: queryKeys.dashboard.summary({ part: 'employeeStats' }),
    queryFn: async () => (await employeesApi.getEmployeeStats())?.data?.data || null,
  })
