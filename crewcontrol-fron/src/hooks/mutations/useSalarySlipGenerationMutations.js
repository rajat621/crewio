import { useApiMutation } from './useApiMutation'
import { salarySlipsApi } from '../../api/salarySlips'
import { queryKeys } from '../../queryKeys'

// Not optimistic - payroll data, explicitly on OPTIMISTIC_UPDATES.md's
// unsafe list ("Salary processing"). Mirrors the caller's own
// isEditMode ? update : create branch - one hook, not two, since that's
// how handleGenerate actually uses it (a single conceptual "save").
export const useSaveSalarySlipMutation = () =>
  useApiMutation({
    mutationFn: ({ isEditMode, editId, payload }) =>
      isEditMode ? salarySlipsApi.updateSalarySlip(editId, payload) : salarySlipsApi.createSalarySlip(payload),
    invalidateKeys: [queryKeys.salary.all],
    invalidateTiming: 'settled',
  })
