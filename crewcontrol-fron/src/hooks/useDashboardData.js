import { useMemo, useRef, useCallback } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { employeesApi } from '../api/employees'
import { attendanceApi } from '../api/attendance'
import { companiesApi } from '../api/companies'
import { invoicesApi } from '../api/invoices'
import { salarySlipsApi } from '../api/salarySlips'
import { dashboardApi } from '../api/dashboard'
import { queryKeys } from '../queryKeys'
import { normalizeListResponse } from '../utils/apiResponseNormalizer'
import { computeDashboardKpisAndChart, computeDashboardAlerts } from '../utils/dashboardDerivation'
import { getRollingDayRange, getMonthRange, getCurrentMonthValue } from '../utils/dateRanges'
import { useSocketBridge } from './useSocketBridge'
import { parseAllSalarySlipsResponse } from './useAllSalarySlips'

// Same params as the original loadDashboard's Promise.all - not changed
// here (that's a backend-pagination concern, out of scope). Note these
// differ from Employees.jsx's useEmployees (limit 500) and its
// useAttendance (month-range, not a rolling 120-day window) - genuinely
// different queries with genuinely different params, so they get their
// own distinct cache keys rather than forcing an artificial "shared
// cache entry" that would require changing one page's actual behavior to
// match the other's.
// computeDashboardAlerts (absent/on-leave/available/site-over lists) needs
// actual employee records, not just counts (KPIs/chart get those from
// /api/employees/stats instead - see kpisAndChart below). A single
// {limit:1000} fetch previously silently capped at 200 rows total
// server-side (employee.controller.js's own scale guard) - regardless of
// which assignedStatus categories those 200 happened to fall into, so at
// real tenant sizes an entire category (e.g. every on-hold employee)
// could be completely invisible to these alerts. Fetching each
// assignedStatus category separately (still capped at 200 per category,
// same backend guard - not raised) means every category gets its own
// budget instead of competing for one shared 200-row ceiling. Alerts are
// inherently bounded "flagged items" lists, not full-population
// accounting (that's what /api/employees/stats is for), so a per-category
// cap is the correct design here, not a workaround.
const DASHBOARD_ONSITE_PARAMS = { page: 1, limit: 200, assignedStatus: 'on-site' };
const DASHBOARD_ONHOLD_PARAMS = { page: 1, limit: 200, assignedStatus: 'on-hold' };
const DASHBOARD_SITEOVER_PARAMS = { page: 1, limit: 200, assignedStatus: 'site-over' };
const DASHBOARD_COMPANIES_PARAMS = { page: 1, limit: 1000 };
const DASHBOARD_INVOICES_PARAMS = { page: 1, limit: 1000 };

// Module-level constant (referentially stable, required by
// useSocketBridge) - every lifecycle event, since the dashboard's KPIs/
// alerts touch employees and attendance all at once. This is new: the
// original loadDashboard had zero socket integration and only ever
// fetched once on mount.
const DASHBOARD_SOCKET_EVENTS = [
  'employee:checked_in', 'employee:started_work', 'employee:stopped_work',
  'employee:leave_started', 'employee:leave_ended',
  'employee:assigned', 'employee:unassigned', 'employee:site_finished',
];

export const useDashboardData = () => {
  useSocketBridge(DASHBOARD_SOCKET_EVENTS);

  const { dayKey } = getRollingDayRange(120);
  // Chart needs ~5 weeks back to always cover the current month's first
  // week even when today is late in the month.
  const { from: chartFrom, to: chartTo } = getRollingDayRange(35);
  // computeDashboardAlerts' absent-streak calculation (dashboardDerivation.js's
  // getAbsentStreakDays) never looks earlier than the 1st of the current
  // calendar month by its own design - fetching a 120-day window for it
  // was already over-fetching by roughly 4x regardless of the chart fix
  // below.
  const currentMonthValue = getCurrentMonthValue();
  const { start: monthStart, end: monthEnd } = getMonthRange(currentMonthValue);

  // Critical path: ONE request instead of two (employees/stats +
  // attendance/daily-counts merged server-side - see
  // dashboard.controller.js's getDashboardSummary). Measured root cause of
  // Home's slowness: server-side durationMs for /api/employees/stats was
  // 186-837ms, but the browser's own resource-timing entry for that same
  // request reached 4642ms when fired alongside the other ~15 requests
  // below - pure connection-queueing, not backend speed. Halving the
  // critical path's own request count, AND gating every secondary query
  // behind its completion (`enabled: !summaryQuery.isLoading` below) so
  // they don't compete for the browser's limited per-origin connections
  // during the exact window the critical path needs them, is what
  // actually addresses that - no amount of backend optimization fixes
  // browser-side queueing.
  const summaryQuery = useQuery({
    // `dayKey` alone (not chartFrom/chartTo.toISOString()) - those come
    // from getRollingDayRange(35), which builds fresh Date objects (and
    // therefore a fresh millisecond-precision ISO string) on every
    // render. Including them in the key made every render count as a
    // brand new query, firing a new request in a tight loop - caught via
    // the backend request log showing /api/dashboard/summary hit every
    // ~400ms continuously instead of once per navigation. dayKey is the
    // same stable, date-only discriminator the original dailyCountsQ key
    // used.
    queryKey: queryKeys.dashboard.summary({ part: 'combined', dayKey }),
    queryFn: async () => {
      const res = await dashboardApi.getSummary({ from: chartFrom.toISOString(), to: chartTo.toISOString() });
      return res?.data?.data || null;
    },
  });

  const results = useQueries({
    queries: [
      {
        queryKey: queryKeys.employees.list(DASHBOARD_ONSITE_PARAMS),
        queryFn: async () => normalizeListResponse(await employeesApi.getEmployees(DASHBOARD_ONSITE_PARAMS)).items,
        enabled: !summaryQuery.isLoading,
      },
      {
        queryKey: queryKeys.employees.list(DASHBOARD_ONHOLD_PARAMS),
        queryFn: async () => normalizeListResponse(await employeesApi.getEmployees(DASHBOARD_ONHOLD_PARAMS)).items,
        enabled: !summaryQuery.isLoading,
      },
      {
        queryKey: queryKeys.employees.list(DASHBOARD_SITEOVER_PARAMS),
        queryFn: async () => normalizeListResponse(await employeesApi.getEmployees(DASHBOARD_SITEOVER_PARAMS)).items,
        enabled: !summaryQuery.isLoading,
      },
      {
        queryKey: queryKeys.attendance.list({ dayKey, scope: 'currentMonth' }),
        // Only the current calendar month now (was a 120-day raw-document
        // fetch, ~5.5s/~40k rows) - the chart's own data comes from the
        // dailyCounts aggregation below; this smaller, still-raw fetch
        // remains only for computeDashboardAlerts' per-employee absent-
        // streak calculation, which never reads further back than the
        // 1st of the current month anyway.
        // Was a raw present/on-leave attendance-document fetch (1.26MB/
        // 10,010 rows for this tenant) reduced into "which days does each
        // employee already have a record for" entirely in the browser.
        // getAttendanceRecordedDates does that same reduction in Mongo -
        // one {employeeId, dateKeys[]} row per employee, not per event -
        // and computeDashboardAlerts now consumes that shape directly. No
        // new waterfall: still fires in parallel with the on-site/on-hold/
        // site-over employee queries, gated only behind summaryQuery.
        queryFn: async () =>
          normalizeListResponse(
            await attendanceApi.getRecordedDates({ from: monthStart.toISOString(), to: monthEnd.toISOString() })
          ).items,
        enabled: !summaryQuery.isLoading,
      },
      {
        queryKey: queryKeys.companies.list(DASHBOARD_COMPANIES_PARAMS),
        queryFn: async () => normalizeListResponse(await companiesApi.getClientCompanies(DASHBOARD_COMPANIES_PARAMS)).items,
        enabled: !summaryQuery.isLoading,
      },
      {
        queryKey: queryKeys.invoices.list(DASHBOARD_INVOICES_PARAMS),
        queryFn: async () => normalizeListResponse(await invoicesApi.getInvoices(DASHBOARD_INVOICES_PARAMS)).items,
        enabled: !summaryQuery.isLoading,
      },
      {
        // The "Salary Slip pending" alert (dashboardDerivation.js) only
        // ever looks at slips matching the CURRENT month/year - it used to
        // fetch the tenant's entire slip history (3000+ documents,
        // populate('employee') on every one, ~3.8s measured against the
        // seeded dataset) just to filter down to a handful client-side.
        // Passing month here reuses listSalarySlips' existing server-side
        // month filter (see salarySlip.controller.js's buildMonthFilter)
        // so the DB does that filtering instead of the browser - same
        // resulting set, far smaller query/response.
        queryKey: queryKeys.salary.list({ month: currentMonthValue }),
        queryFn: async () => {
          const response = await salarySlipsApi.listSalarySlips(undefined, currentMonthValue);
          return parseAllSalarySlipsResponse(response);
        },
        enabled: !summaryQuery.isLoading,
      },
      {
        queryKey: queryKeys.dashboard.summary({ part: 'vatSummary' }),
        // Preserves the original's exact fallback behavior: a failed VAT
        // summary call never surfaces as an error, always resolves to
        // {active: false}.
        queryFn: async () => {
          try {
            const response = await companiesApi.getVatSummary();
            return response?.data || { active: false };
          } catch {
            return { active: false };
          }
        },
        enabled: !summaryQuery.isLoading,
      },
    ],
  });

  const [onSiteQ, onHoldQ, siteOverQ, attendanceQ, companiesQ, invoicesQ, salaryQ, vatQ] = results;

  // Phase 3+7 split: the 4 visible KPI tiles + attendance chart only ever
  // read summaryQuery (totalWorkers/onHoldWorkers/workersOnSite/chart
  // buckets, one merged request - see getDashboardSummary) - see
  // computeDashboardKpisAndChart's actual field usage in
  // dashboardDerivation.js. Everything else queried above (the three
  // 200-row employee fetches, the raw current-month attendance fetch,
  // companies, invoices, salary slips, VAT summary) only feeds the
  // "Smart Alerts" panel, which is visually secondary/below-the-fold -
  // and is now also gated (`enabled: !summaryQuery.isLoading` on each)
  // so it doesn't fire until the critical request has already landed,
  // instead of all ~9 requests competing for the browser's limited
  // per-origin connections in the same instant. Previously `isLoading`
  // was `results.some(...)` across all 10 queries, so the KPI row and
  // chart stayed blank until the SLOWEST query of the whole batch
  // resolved (salary-slips' full-history fetch measured at ~3.8s) even
  // though they don't use that data at all.
  const SECONDARY_QUERIES = [onSiteQ, onHoldQ, siteOverQ, attendanceQ, companiesQ, invoicesQ, salaryQ, vatQ];
  const isLoading = summaryQuery.isLoading;
  const isError = summaryQuery.isError;
  // `isPending` (not `isLoading`) - these queries start `enabled: false`
  // until summaryQuery resolves. In React Query v5, isLoading = isPending
  // && isFetching, and a disabled-but-not-yet-run query has isFetching
  // false, so isLoading would be false while it's simply waiting its turn
  // - incorrectly reporting "not loading" before it's even started, and
  // briefly rendering Smart Alerts as empty instead of showing the
  // loading skeleton. isPending stays true the whole time there's no data
  // yet, deferred-and-waiting or actively fetching alike.
  const isAlertsLoading = SECONDARY_QUERIES.some((r) => r.isPending);
  const isAlertsError = SECONDARY_QUERIES.some((r) => r.isError);

  // Merged only for computeDashboardAlerts (needs actual employee
  // records per category) and as kpisAndChart's fallback total while
  // `stats` is still loading - the real, full-population totals always
  // come from `stats`, never from summing these three arrays' lengths.
  const employeesForAlerts = useMemo(
    () => [...(onSiteQ.data || []), ...(onHoldQ.data || []), ...(siteOverQ.data || [])],
    [onSiteQ.data, onHoldQ.data, siteOverQ.data]
  );

  // Preserves the original's atomic all-or-nothing behavior: the old
  // Promise.all rejected entirely (triggering the catch block's full
  // zero-state reset) if even one of these calls failed. useQueries
  // fails each query independently, so without this check a single
  // failed query would silently compute a derived object mixing real
  // data with an empty fallback for just the failed piece - never what
  // the original did. isLoading/isError are still derived from all 6
  // queries (not split per group) - the original never had partial-
  // loading semantics, and introducing that now would be a behavior
  // change, not a performance fix.
  const ORIGINAL_ERROR_FALLBACK = {
    kpis: { totalWorkers: 0, workersOnSite: 0, onHoldWorkers: 0, revenueCount: 0 },
    chartData: { weekly: [], monthly: [] },
    alerts: {
      absentWorkers: [], onLeaveWorkers: [], availableWorkers: [], payments: [], taxPayments: [],
      documentExpiring: [], documentExpired: [], vatSummary: { active: false }, siteFinished: [],
    },
  };

  // Phase 3.1 split: two useMemos with narrower dependency arrays, traced
  // exactly from computeDashboardDerived's original single-function body
  // (see dashboardDerivation.js's own comment for the full trace).
  // kpisAndChart only ever reads employees/attendanceRecords/invoices -
  // it no longer recomputes (or hands consumers a new object/array
  // reference) when companies/salarySlips/vatSummary change, which is
  // what was causing AttendanceCard/KPIGrid/AttendanceBarChart to
  // re-render on dashboard updates unrelated to attendance or headcount.
  // alerts genuinely reads all six inputs (payments needs salarySlips,
  // taxPayments needs companies+invoices) and keeps that full dependency
  // list - it cannot be narrowed without decomposing alerts itself into
  // per-field memos, which isn't justified here.
  const kpisAndChart = useMemo(() => {
    if (isLoading || isError) return null;
    return computeDashboardKpisAndChart({
      employees: employeesForAlerts,
      dailyPresentCounts: summaryQuery.data?.dailyPresentCounts || [],
      invoices: invoicesQ.data || [],
      stats: summaryQuery.data?.employees || null,
    });
  }, [isLoading, isError, employeesForAlerts, summaryQuery.data, invoicesQ.data]);

  const alertsResult = useMemo(() => {
    if (isAlertsLoading || isAlertsError) return null;
    return computeDashboardAlerts({
      employees: employeesForAlerts,
      recordedDates: attendanceQ.data || [],
      companies: companiesQ.data || [],
      invoices: invoicesQ.data || [],
      salarySlips: salaryQ.data || [],
      vatSummary: vatQ.data || { active: false },
    });
  }, [isAlertsLoading, isAlertsError, employeesForAlerts, attendanceQ.data, companiesQ.data, invoicesQ.data, salaryQ.data, vatQ.data]);

  // Plain per-render construction, not itself memoized - Home.jsx
  // destructures derived.kpis/derived.chartData/derived.alerts into
  // local consts immediately after calling this hook, and those are the
  // references that actually reach KpiGrid/AttendanceCard/AlertBox as
  // props. Those come straight from kpisAndChart/alertsResult above
  // (already stable), so wrapping this combination in a third useMemo
  // would add nothing - Home.jsx never reads `derived` itself as a
  // single prop value.
  // alerts falls back to the same all-empty shape both on error AND while
  // still loading - Smart Alerts' own isAlertsLoading flag (returned below)
  // is what tells AlertBox to show a loading state instead of "nothing to
  // show"; this fallback is just the safe default shape either way.
  let derived = null;
  if (!isLoading) {
    const alertsReady = !isAlertsLoading && !isAlertsError;
    derived = isError
      ? ORIGINAL_ERROR_FALLBACK
      : {
          kpis: kpisAndChart.kpis,
          chartData: kpisAndChart.chartData,
          alerts: alertsReady ? alertsResult.alerts : ORIGINAL_ERROR_FALLBACK.alerts,
        };
  }

  const resultsRef = useRef(results);
  resultsRef.current = results;
  const summaryQueryRef = useRef(summaryQuery);
  summaryQueryRef.current = summaryQuery;
  const refetchAll = useCallback(
    () => Promise.all([summaryQueryRef.current.refetch(), ...resultsRef.current.map((r) => r.refetch())]),
    []
  );

  return { derived, isLoading, isError, isAlertsLoading, refetchAll };
};
