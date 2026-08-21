import { useQuery } from '@tanstack/react-query'
import { salarySlipsApi } from '../api/salarySlips'
import { queryKeys } from '../queryKeys'

// Preserves the original's exact response-shape check (response.data.salarySlip)
// and the "slip not found" -> thrown Error, surfaced via query.error.
export const useSalarySlipForEdit = (editId, { enabled = true } = {}) =>
  useQuery({
    queryKey: queryKeys.salary.detail(editId),
    queryFn: async () => {
      const response = await salarySlipsApi.getSalarySlip(editId);
      const slip = response?.data?.salarySlip;
      if (!slip) throw new Error('Salary slip not found');
      return slip;
    },
    enabled: enabled && Boolean(editId),
  })
