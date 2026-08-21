import { useApiMutation } from './useApiMutation'
import { employeesApi } from '../../api/employees'
import { queryKeys } from '../../queryKeys'

// Not optimistic - creating an employee (required docs, server-assigned
// _id/credentials) has no meaningful optimistic representation, same
// reasoning OPTIMISTIC_UPDATES.md applies to invoice/salary-slip
// generation. Invalidates the employees resource broadly so any already-
// mounted employees list (Employees.jsx, the dashboard, etc.) picks up
// the new hire.
export const useCreateEmployeeMutation = () =>
  useApiMutation({
    mutationFn: (payload) => employeesApi.createEmployee(payload),
    invalidateKeys: [queryKeys.employees.all],
    invalidateTiming: 'success',
  })
