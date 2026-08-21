import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { salarySlipsApi } from '../api/salarySlips'
import { queryKeys } from '../queryKeys'
import { normalizeSlipRows } from '../utils/salarySlipDerivation'

// Was previously fanning out one /api/salary-slips?employeeId=X request
// per employee via Promise.allSettled for the owner path - the comment
// here used to call this out as "the original's own N+1 pattern... kept
// exactly as it was, not fixed." At real tenant sizes (measured against a
// 1000-employee seeded dataset) that's ~1000 concurrent requests, each
// costing ~3s, and the page rendered "0-0 of 0" despite thousands of real
// slips existing - the same class of bug already found and fixed on the
// Expenses page's useLaborExpenses.js. salarySlip.controller.js's
// listSalarySlips already returns every slip for the owner in one
// populate('employee') response (cached 20s) whenever employeeId is
// omitted, so there's no need to resolve the employee list first or fan
// out per employee at all.
// page/limit/search are opt-in server-side pagination (see
// salarySlip.controller.js's listSalarySlips) - previously this always
// fetched every slip the owner has ever generated (3000+ at this tenant's
// scale) and paginated/searched over that full array client-side.
// keepPreviousData avoids a flash-to-empty when changing page/search while
// the next page's request is still in flight.
export const useSalarySlips = (selectedMonth, user, page = 1, limit = 10, search = '') => {
  const isEmployee = user?.role === 'employee';

  return useQuery({
    queryKey: queryKeys.salary.list({ month: selectedMonth, role: user?.role, page, limit, search }),
    queryFn: async () => {
      const response = await salarySlipsApi.listSalarySlips(undefined, selectedMonth, page, limit, search);
      const items = Array.isArray(response?.data?.salarySlips)
        ? response.data.salarySlips
        : Array.isArray(response?.data?.data)
          ? response.data.data
          : [];
      // normalizeSlipRows only ever reads employee display fields (name/
      // trade/rate) through its employeesById map, not from slip.employee
      // directly - that was fine for the old per-employee fan-out (the
      // employee doc was fetched as a separate request), but the
      // aggregate response's slip.employee IS already the populated
      // employee doc (see listSalarySlips' populate('employee')), so it
      // needs to be indexed into that same map rather than discarded, or
      // every slip without a slipData snapshot renders "Employee"/"—".
      const employeesById = new Map();
      items.forEach((slip) => {
        const id = String(slip?.employee?._id || '');
        if (id && slip.employee && typeof slip.employee === 'object') {
          employeesById.set(id, slip.employee);
        }
      });
      const rows = normalizeSlipRows(items, employeesById, isEmployee ? user : null);
      return { rows, total: response?.data?.total ?? rows.length };
    },
    placeholderData: keepPreviousData,
  });
};
