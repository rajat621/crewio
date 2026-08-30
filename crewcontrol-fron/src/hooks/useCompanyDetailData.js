import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { companiesApi } from '../api/companies'
import { employeesApi } from '../api/employees'
import { attendanceApi } from '../api/attendance'
import { queryKeys } from '../queryKeys'
import { normalizeListResponse, normalizeItemResponse } from '../utils/apiResponseNormalizer'
import { computeCompanyDetail } from '../utils/companyDetailDerivation'

// Yet another distinct employees-list param shape (filtered by
// assignedCompanyId, limit 500) - genuinely different from every other
// page's employees query, gets its own key.
const assignedEmployeesParams = (companyId) => ({ assignedCompanyId: companyId, page: 1, limit: 500 })

export const useCompanyDetailData = (id) => {
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
        // Today's present/absent/leave for this one company, pre-aggregated
        // server-side (see attendance.controller.js's getAttendanceSummary)
        // instead of fetching every raw attendance record in a 120-day
        // window and picking each employee's most recent one in the
        // browser - that old approach was both the staleness bug (showing
        // a status from days ago when nothing newer had been recorded) and
        // this page's main slow-load cause (pulling the tenant's entire
        // attendance history just to compute three numbers).
        queryKey: queryKeys.attendance.summary({ company: id }),
        queryFn: async () => (await attendanceApi.getSummary({ company: id })).data?.data || null,
        enabled: Boolean(id),
      },
    ],
  });

  const [companyQ, employeesQ, attendanceSummaryQ] = results;
  const isLoading = results.some((r) => r.isLoading);

  const company = useMemo(() => {
    if (isLoading) return null;
    return computeCompanyDetail({
      rawCompany: companyQ.data || null,
      assignedEmployees: employeesQ.data || [],
      attendanceSummary: attendanceSummaryQ.data || null,
    });
  }, [isLoading, companyQ.data, employeesQ.data, attendanceSummaryQ.data]);

  return { company, isLoading };
};
