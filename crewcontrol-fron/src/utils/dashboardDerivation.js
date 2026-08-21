// Extracted verbatim from Home.jsx's loadDashboard (React Query migration) -
// pure functions, zero logic changes to the computations themselves.
//
// Phase 3.1 update: split from a single computeDashboardDerived({...6
// inputs}) into two functions along the dependency boundary traced from
// the original code - kpis/chartData only ever read employees/
// attendanceRecords/invoices; alerts genuinely reads all six (payments
// needs salarySlips, taxPayments needs companies+invoices, vatSummary
// passes straight through). No intermediate computation crosses that
// boundary (onSiteEmployees/onLeaveEmployees/availableEmployees/
// siteOverEmployees all feed only alerts fields), so splitting required
// no duplicated logic. This lets useDashboardData.js memoize each half on
// its own narrower dependency array, instead of one array of six.
// `now` is accepted as a parameter rather than computed independently in
// each function, so both halves see the identical instant - matching the
// original single-function version's timing exactly rather than
// introducing a theoretical (if practically unobservable) drift.
import {
  DAY_MS,
  getStartOfDay,
  getUaeDateKey,
  buildWeeklyChartDataFromCounts,
  buildMonthlyChartDataFromCounts,
  daysUntil,
  getEmployeeDisplayName,
  isExpiringSoon,
  isExpired,
} from './dashboardHelpers.js';

export const computeDashboardKpisAndChart = ({ employees, dailyPresentCounts = [], invoices, stats, now = new Date() }) => {
      // Workers On-Site = today's present count, read directly off the
      // backend's pre-aggregated daily counts (GET /api/attendance/
      // daily-counts - one {date, present} row per day, already ownerId-
      // scoped and summed server-side) rather than scanning raw
      // attendance documents in the browser. Today's bucket may not
      // exist yet if nobody has checked in today, hence the `|| 0`.
      // getUaeDateKey (not getDateKey/browser-local) - the backend now
      // buckets these rows by the fixed UAE business day, so the lookup
      // key must be computed the same way or a viewer outside UTC+4 could
      // look up the wrong day (see businessTime.util.js on the backend).
      const todayKey = getUaeDateKey(now);
      const workersOnSite = dailyPresentCounts.find((row) => row.date === todayKey)?.present || 0;

  const kpis = {
    // stats comes from GET /api/employees/stats - a single aggregation
    // over the tenant's FULL employee population, not the paginated/
    // capped employees list. totalWorkers/onHoldWorkers must never be
    // derived by counting/filtering `employees` (that array is at most
    // one page) - falls back to the old employees.length/company-null
    // computation only if the stats call hasn't resolved yet, so the KPI
    // shows *something* correct-shaped during the brief loading window
    // rather than a hard crash.
    totalWorkers: stats?.total ?? employees.total ?? employees.length,
    workersOnSite,
    // onHold is the canonical assignedStatus === 'on-hold' count (site
    // assignment state, set explicitly by unassignEmployee/
    // assignEmployee - see employee.controller.js), not an ad-hoc
    // "company field is null" check computed differently across the
    // codebase.
    onHoldWorkers: stats?.onHold ?? 0,
    revenueCount: invoices.length,
  };

  // totalEmployees drives the chart's absent-count math
  // (totalEmployees - present) - must be the real tenant total, not a
  // capped page length, or "absent" undercounts by the same margin.
  const totalEmployeeCount = stats?.total ?? employees.total ?? employees.length;
  const chartData = {
    weekly: buildWeeklyChartDataFromCounts(dailyPresentCounts, totalEmployeeCount),
    monthly: buildMonthlyChartDataFromCounts(dailyPresentCounts, totalEmployeeCount),
    hasEmployees: totalEmployeeCount > 0,
  };

  return { kpis, chartData };
};

export const computeDashboardAlerts = ({
  employees,
  recordedDates,
  companies,
  invoices,
  salarySlips,
  vatSummary,
  now = new Date(),
}) => {
      // Per-employee set of UAE-calendar-day keys that already have a
      // present/on-leave record - already reduced server-side (see
      // attendance.controller.js's getAttendanceRecordedDates) instead of
      // scanning every raw attendance document here. A day with no entry
      // at all is what counts as absent throughout this app, not an
      // explicit 'absent' status record (almost never actually created
      // day-to-day).
      const recordedDatesByEmployee = new Map(
        (recordedDates || []).map((row) => [String(row.employeeId), new Set(row.dateKeys || [])])
      );

      // How many consecutive days (ending today), *within the current
      // UAE calendar month*, an on-site employee has had no attendance
      // record - matches "Absent from last N day" in the Smart Alerts
      // design. Stops at the 1st of the current month rather than walking
      // back indefinitely - a streak that started last month must not
      // keep inflating this count forever; it resets to 0 on the 1st of
      // every new month regardless of how long the employee has actually
      // been absent. Uses getUaeDateKey (UAE-fixed offset, matching the
      // server's own bucketing above) rather than the browser's local
      // timezone - previously this used the viewer's own local calendar
      // day, which could disagree with the UAE business day the
      // underlying attendance records are actually keyed by.
      const todayUaeKey = getUaeDateKey(now);
      const [todayYear, todayMonth, todayDay] = todayUaeKey.split("-").map(Number);
      const getAbsentStreakDays = (employeeId) => {
        const recordedDateSet = recordedDatesByEmployee.get(employeeId);
        let streak = 0;
        for (let dayNum = todayDay; dayNum >= 1; dayNum -= 1) {
          const key = `${todayYear}-${String(todayMonth).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
          if (recordedDateSet && recordedDateSet.has(key)) break;
          streak += 1;
        }
        return streak;
      };

      const onSiteEmployees = employees.filter((employee) => employee?.assignedStatus === "on-site");
      const onLeaveEmployees = employees.filter(
        (employee) => employee?.lifecycleState === "ON_LEAVE" || employee?.currentLeave?.isOnLeave
      );
      const availableEmployees = employees.filter((employee) => employee?.assignedStatus === "on-hold");
      const siteOverEmployees = employees.filter((employee) => employee?.assignedStatus === "site-over");

      // Only actively-deployed, not-currently-on-leave employees can
      // meaningfully be "absent today" - someone on hold or between
      // sites isn't expected to check in anywhere.
      const onLeaveIds = new Set(onLeaveEmployees.map((e) => String(e?._id || "")));
      const absentWorkers = onSiteEmployees
        .filter((employee) => !onLeaveIds.has(String(employee?._id || "")))
        .map((employee) => {
          const employeeId = String(employee?._id || "");
          const streak = getAbsentStreakDays(employeeId);
          if (streak <= 0) return null;
          return {
            employeeId,
            name: getEmployeeDisplayName(employee),
            meta: `Absent from last ${streak} day${streak === 1 ? "" : "s"}`,
          };
        })
        .filter(Boolean);

      const onLeaveWorkers = onLeaveEmployees.map((employee) => {
        const startedAt = employee?.currentLeave?.startedAt;
        const days = startedAt ? Math.max(1, Math.ceil((today - getStartOfDay(startedAt)) / DAY_MS)) : null;
        return {
          employeeId: employee?._id,
          name: getEmployeeDisplayName(employee),
          meta: days ? `On Leave from last ${days} day${days === 1 ? "" : "s"}` : "On Leave",
        };
      });

      const availableWorkers = availableEmployees.map((employee) => ({
        employeeId: employee?._id,
        name: getEmployeeDisplayName(employee),
      }));

      const siteFinished = siteOverEmployees.map((employee) => ({
        employeeId: employee?._id,
        name: getEmployeeDisplayName(employee),
      }));

      // Salary Slip alert: on-site employees who don't yet have a slip
      // generated for the current month/year. salarySlips is now passed
      // in pre-parsed (see the hook's queryFn) rather than re-extracted
      // from a raw response here.
      const currentMonthLabel = now.toLocaleDateString("en-GB", { month: "long" });
      const currentYear = now.getFullYear();
      const hasSlipThisMonth = new Set(
        salarySlips
          .filter((slip) => Number(slip?.year) === currentYear && String(slip?.month || "").toLowerCase() === currentMonthLabel.toLowerCase())
          .map((slip) => String(slip?.employee?._id || slip?.employee || ""))
      );
      const payments = onSiteEmployees
        .filter((employee) => !hasSlipThisMonth.has(String(employee?._id || "")))
        .map((employee) => ({
          employeeId: employee?._id,
          name: getEmployeeDisplayName(employee),
          meta: `${currentMonthLabel} salary slip pending`,
        }));

      const companyNameById = new Map(
        companies.map((company) => [String(company?._id || ""), company?.name || "Unknown company"])
      );

      const taxPayments = invoices
        .map((invoice) => {
          if (!invoice?.dueDate) return null;
          const remainingDays = daysUntil(invoice.dueDate);
          if (remainingDays < 0 || remainingDays > 5) return null;

          return {
            name:
              companyNameById.get(String(invoice?.company || invoice?.companyId || "")) ||
              invoice?.clientName ||
              "Unknown company",
            meta: `${remainingDays} day${remainingDays === 1 ? "" : "s"} remaining to pay tax`,
          };
        })
        .filter(Boolean);

      const buildEmployeeDocs = (employee) => [
        {
          label: "passport",
          expiry: employee?.passportExpiry,
          status: employee?.passportStatus,
        },
        {
          label: "Emirates ID",
          expiry: employee?.emiratesIdExpiry || employee?.emirateIdExpiry,
          status: employee?.emirateIdStatus || employee?.emiratesIdStatus,
        },
      ];

      const documentExpiring = employees
        .flatMap((employee) => {
          const fullName = getEmployeeDisplayName(employee);
          const docs = buildEmployeeDocs(employee);

          return docs
            .map((doc) => {
              if (!isExpiringSoon(doc.expiry, doc.status)) return null;
              return {
                employeeId: employee?._id || employee?.employeeId,
                name: `${fullName}'s ${doc.label} is expiring soon`,
                meta: doc.expiry
                  ? `Expiring on ${new Date(doc.expiry).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
                  : "Expiring soon",
              };
            })
            .filter(Boolean);
        });

      const documentExpired = employees
        .flatMap((employee) => {
          const fullName = getEmployeeDisplayName(employee);
          const docs = buildEmployeeDocs(employee);

          return docs
            .map((doc) => {
              if (!isExpired(doc.expiry, doc.status)) return null;
              return {
                employeeId: employee?._id || employee?.employeeId,
                name: `${fullName}'s ${doc.label} has expired`,
                meta: doc.expiry
                  ? `Expired on ${new Date(doc.expiry).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
                  : "Expired",
              };
            })
            .filter(Boolean);
        });

  const alerts = {
    absentWorkers,
    onLeaveWorkers,
    availableWorkers,
    payments,
    taxPayments,
    documentExpiring,
    documentExpired,
    siteFinished,
    vatSummary,
  };

  return { alerts };
};

// Preserved for any other caller that still wants the combined shape in
// one call (none currently exist in the app - useDashboardData.js now
// calls the two functions above directly with separately-scoped
// useMemos - but keeping this avoids forcing every future caller to know
// about the split).
export const computeDashboardDerived = (input) => {
  const now = input.now || new Date();
  const { kpis, chartData } = computeDashboardKpisAndChart({ ...input, now });
  const { alerts } = computeDashboardAlerts({ ...input, now });
  return { kpis, chartData, alerts };
};
