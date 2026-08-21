import { useQuery } from '@tanstack/react-query'
import { employeesApi } from '../api/employees'
import { queryKeys } from '../queryKeys'
import { useApiMutation } from './mutations/useApiMutation'

// Preserves the exact original response-shape check - this single-item
// endpoint returns `employee` before `data` (distinct from the list
// endpoint's `employees`/`data` pair), so the generic normalizer's
// data-only check isn't used here; kept as its own explicit check to
// match the original exactly.
export const useEmployee = (id) =>
  useQuery({
    queryKey: queryKeys.employees.detail(id),
    queryFn: async () => {
      const response = await employeesApi.getEmployee(id);
      return response?.data?.employee || response?.data?.data || null;
    },
    enabled: Boolean(id),
  })

export const useUpdateEmployeeMutation = (id) =>
  useApiMutation({
    mutationFn: (updatedData) => employeesApi.updateEmployee(id, updatedData),
    invalidateKeys: [queryKeys.employees.detail(id), queryKeys.employees.all],
    invalidateTiming: 'settled',
  })
