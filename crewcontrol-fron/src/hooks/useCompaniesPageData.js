import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { companiesApi } from '../api/companies'
import { queryKeys } from '../queryKeys'
import { normalizeListResponse } from '../utils/apiResponseNormalizer'
import { computeCompanyRows } from '../utils/companyDerivation'
import { useSocketBridge } from './useSocketBridge'

// Exported so useCompanyMutations.js targets the exact same cache entry
// this hook populates, instead of independently re-declaring the params -
// the same {page:1,limit:500}-style duplication bug found and fixed
// three times already in this migration effort (useEmployees.js/
// useEmployeeMutations.js, then again in Employees.jsx's recency guard).
export const COMPANIES_LIST_PARAMS = {}
export const COMPANIES_LIST_KEY = queryKeys.companies.list(COMPANIES_LIST_PARAMS)

// Phase 4: previously fetched up to 5000 full employee documents AND every
// raw attendance record in a non-minimal 120-day window (~40k rows against
// this tenant's data), then joined them in the browser to compute each
// company's totalWorkers/present/absent/onLeave. Two correctness/perf
// problems with that: (1) getEmployees silently caps its actual query at
// 200 regardless of the requested limit, so at 1000+ employees the counts
// were WRONG for companies whose employees fell outside the most-recent-200
// window, not just slow; (2) shipping tens of thousands of documents to
// the browser just to sum them. getCompanyWorkforceSummary (see
// company.controller.js) computes the exact same numbers server-side via
// aggregation over the FULL population, in one small response.
const WORKFORCE_SUMMARY_KEY = queryKeys.companies.list({ part: 'workforceSummary' });

// Same "employee:assigned/unassigned changes card stats, lifecycle
// events change the present/absent/onLeave breakdown" reasoning as the
// dashboard - assignment counts on this page are derived from the same
// attendance+employee data the dashboard's KPIs use.
const COMPANIES_SOCKET_EVENTS = [
  'employee:checked_in', 'employee:started_work', 'employee:stopped_work',
  'employee:leave_started', 'employee:leave_ended',
  'employee:assigned', 'employee:unassigned', 'employee:site_finished',
];

export const useCompaniesPageData = () => {
  useSocketBridge(COMPANIES_SOCKET_EVENTS);

  const results = useQueries({
    queries: [
      {
        queryKey: COMPANIES_LIST_KEY,
        queryFn: async () => normalizeListResponse(await companiesApi.getClientCompanies()).items,
      },
      {
        queryKey: WORKFORCE_SUMMARY_KEY,
        queryFn: async () => (await companiesApi.getCompanyWorkforceSummary())?.data?.data || {},
      },
    ],
  });

  const [companiesQ, summaryQ] = results;
  const isLoading = results.some((r) => r.isLoading);
  const isError = results.some((r) => r.isError);

  const companyRows = useMemo(() => {
    if (isLoading || isError) return [];
    return computeCompanyRows({
      companies: companiesQ.data || [],
      workforceSummary: summaryQ.data || {},
    });
  }, [isLoading, isError, companiesQ.data, summaryQ.data]);

  return { companyRows, isLoading };
};
