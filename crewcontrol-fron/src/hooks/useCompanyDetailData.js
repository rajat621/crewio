import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { companiesApi } from '../api/companies'
import { employeesApi } from '../api/employees'
import { attendanceApi } from '../api/attendance'
import { queryKeys } from '../queryKeys'
import { normalizeListResponse, normalizeItemResponse } from '../utils/apiResponseNormalizer'
import { computeCompanyDetail } from '../utils/companyDetailDerivation'
import { getRollingDayRange } from '../utils/dateRanges'

// Yet another distinct employees-list param shape (filtered by
// assignedCompanyId, limit 500) - genuinely different from every other
// page's employees query, gets its own key.
const assignedEmployeesParams = (companyId) => ({ assignedCompanyId: companyId, page: 1, limit: 500 })

export const useCompanyDetailData = (id) => {
  const { from, to, dayKey } = getRollingDayRange(120);

  const results = useQueries({
    queries: [
      {
        queryKey: queryKeys.companies.detail(id),
        queryFn: async () => normalizeItemResponse(await companiesApi.getCompany(id)).item,
        enabled: Boolean(id),
      },
      {
        queryKey: queryKeys.employees.list(assignedEmployeesParams(id)),
        queryFn: async () => normalizeListResponse(await employeesApi.getEmployees(assignedEmployeesParams(id))).items,
        enabled: Boolean(id),
      },
      {
        queryKey: queryKeys.attendance.list({ dayKey, rollingDays: 120, scope: 'companyDetail' }),
        queryFn: async () =>
          normalizeListResponse(await attendanceApi.getAttendance({ from: from.toISOString(), to: to.toISOString() })).items,
        enabled: Boolean(id),
      },
    ],
  });

  const [companyQ, employeesQ, attendanceQ] = results;
  const isLoading = results.some((r) => r.isLoading);

  const company = useMemo(() => {
    if (isLoading) return null;
    return computeCompanyDetail({
      rawCompany: companyQ.data || null,
      assignedEmployees: employeesQ.data || [],
      attendanceRecords: attendanceQ.data || [],
    });
  }, [isLoading, companyQ.data, employeesQ.data, attendanceQ.data]);

  return { company, isLoading };
};
