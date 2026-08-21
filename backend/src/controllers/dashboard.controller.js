import mongoose from 'mongoose';
import Employee from '../models/Employee.js';
import { serverError } from '../utils/apiResponse.js';
import Attendance from '../models/Attendance.js';
import { Invoice } from '../models/Invoice.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import CompanyExpense from '../models/CompanyExpense.js';
import SalarySlip from '../models/SalarySlip.js';
import { cacheGetOrSet } from '../utils/cache.util.js';
import { UAE_TIMEZONE_OFFSET } from '../utils/businessTime.util.js';
import { employeeCachePrefix } from './employee.controller.js';

export const getDashboard = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const user = await User.findById(userId);
    if (!user || !user.company) {
      return res.status(403).json({ message: 'No company associated with user' });
    }

    const companyFilter = { company: user.company };
    const invoiceFilter = { createdBy: user._id };

    const [totalEmployees, totalInvoices, totalAttendance] = await Promise.all([
      Employee.countDocuments(companyFilter),
      Invoice.countDocuments(invoiceFilter),
      Attendance.countDocuments(companyFilter),
    ]);

    res.json({
      message: 'Dashboard data',
      data: {
        totalEmployees,
        totalInvoices,
        totalAttendance,
      },
    });
  } catch (error) {
    return serverError(res, 'Failed to fetch dashboard');
  }
};

export const getStats = getDashboard;

// GET /api/dashboard/summary - Home's KPI row + attendance chart in ONE
// round trip instead of two (employees/stats + attendance/daily-counts).
//
// Home previously fired ~16 concurrent requests on mount. The critical
// path (KPI tiles + chart) was already narrowed to just 2 of those
// (useDashboardData.js's isLoadingCritical), but all 16 still competed for
// the browser's limited per-origin connections at the same instant -
// measured via performance.getEntriesByType('resource'): server-side
// durationMs for /api/employees/stats was 186-837ms, but the browser's own
// resource-timing entry for that same request reached 4642ms during the
// full burst, purely from connection queueing, not backend slowness.
// Merging the two critical-path requests into one halves how many
// connections the critical path needs, so it's less likely to be starved
// behind the 8 secondary (alerts-only) requests firing in the same burst.
//
// Deliberately NOT a "return everything Home might ever want" endpoint -
// only the exact fields kpisAndChart reads (see dashboardDerivation.js):
// total/onHold (KPI tiles) and one {date,present} row per day (chart +
// today's on-site count). Alerts' 8 other queries stay separate and
// secondary, unchanged.
export const getDashboardSummary = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ message: 'from and to are required' });
    }

    // Cache key uses only the DAY portion of from/to, not the full
    // millisecond-precision ISO string the frontend sends (a fresh
    // Date().toISOString() computed at request time - so it's a different
    // string on literally every request, even for the exact same UI
    // window). That made this endpoint's cache key unique per-request,
    // i.e. a guaranteed 100% miss rate - measured live: two Home loads
    // ~1 minute apart (well inside the 30s TTL for identical data) showed
    // near-identical ~510ms durations both times, proving the cache was
    // never actually being hit. The aggregation below groups attendance by
    // calendar day regardless, so day-granularity is exactly the
    // precision this result already has.
    const cacheKey = `${employeeCachePrefix(user.ownerId)}dashboard-summary:${String(from).slice(0, 10)}:${String(to).slice(0, 10)}`;
    const summary = await cacheGetOrSet(cacheKey, 30, async () => {
      const ownerId = new mongoose.Types.ObjectId(user.ownerId);

      const [statsResult, dailyCountsRows] = await Promise.all([
        Employee.aggregate([
          { $match: { ownerId } },
          {
            $facet: {
              total: [{ $count: 'count' }],
              byAssignedStatus: [{ $group: { _id: '$assignedStatus', count: { $sum: 1 } } }],
            },
          },
        ]),
        Attendance.aggregate([
          { $match: { ownerId, date: { $gte: new Date(from), $lte: new Date(to) }, status: 'present' } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: UAE_TIMEZONE_OFFSET } }, present: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
      ]);

      const [result] = statsResult;
      const toCountMap = (rows) => rows.reduce((acc, row) => { acc[row._id || 'unknown'] = row.count; return acc; }, {});
      const assignedStatus = toCountMap(result.byAssignedStatus);

      return {
        employees: {
          total: result.total[0]?.count || 0,
          onSite: assignedStatus['on-site'] || 0,
          onHold: assignedStatus['on-hold'] || 0,
          siteOver: assignedStatus['site-over'] || 0,
        },
        dailyPresentCounts: dailyCountsRows.map((r) => ({ date: r._id, present: r.present })),
      };
    });

    res.json({ message: 'Dashboard summary retrieved', data: summary });
  } catch (error) {
    return serverError(res, 'Failed to fetch dashboard summary');
  }
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FINANCE_PERIODS = new Set(['monthly', 'yearly', 'lastMonth', 'lastYear']);
const PAID_SLIP_STATUSES = ['generated', 'sent'];

// Exact, documented range per filter option - server-authoritative so the
// frontend never has to reimplement (or drift from) these boundaries:
//   monthly    -> [1st of the current calendar month, 1st of next month)
//   yearly     -> [Jan 1 of the current calendar year, Jan 1 of next year)
//   lastMonth  -> [1st of the previous calendar month, 1st of this month)
//   lastYear   -> [Jan 1 of the previous calendar year, Jan 1 of this year)
// `granularity` drives the trend chart's bucket size ('day' inside a single
// month, 'month' across a full year).
const getFinancePeriodRange = (periodKey, now = new Date()) => {
  const period = FINANCE_PERIODS.has(periodKey) ? periodKey : 'monthly';
  const y = now.getFullYear();
  const m = now.getMonth();

  if (period === 'yearly') {
    return { period, granularity: 'month', start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1), label: String(y) };
  }
  if (period === 'lastYear') {
    return { period, granularity: 'month', start: new Date(y - 1, 0, 1), end: new Date(y, 0, 1), label: String(y - 1) };
  }
  if (period === 'lastMonth') {
    const start = new Date(y, m - 1, 1);
    return { period, granularity: 'day', start, end: new Date(y, m, 1), label: `${MONTH_LABELS[start.getMonth()]} ${start.getFullYear()}` };
  }
  const start = new Date(y, m, 1);
  return { period, granularity: 'day', start, end: new Date(y, m + 1, 1), label: `${MONTH_LABELS[start.getMonth()]} ${start.getFullYear()}` };
};

// Builds the SalarySlip month/year match for a period range - SalarySlip
// stores `month` as a full month NAME string (e.g. "August", matched
// case-insensitively - see salarySlip.controller.js's escapeRegExp/$regex
// usage) and `year` as a Number, not a Date field, so it can't share the
// Invoice/CompanyExpense $gte/$lt date-range match below.
const getSalarySlipPeriodMatch = ({ start, end }) => {
  const months = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor < end) {
    months.push({ year: cursor.getFullYear(), month: MONTH_NAMES[cursor.getMonth()] });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return { $or: months.map((mo) => ({ year: mo.year, month: { $regex: `^${mo.month}$`, $options: 'i' } })) };
};

// GET /api/dashboard/finance-summary?period=monthly|yearly|lastMonth|lastYear
//
// Two independently-scoped halves:
//
// 1. PERIOD-FILTERED (refetched/relabeled per `period`): `totals` (revenue/
//    expenses/VAT/net profit), `trend` (the chart), and `companies`'
//    invoiceAmount - all sourced from Invoice/CompanyExpense/SalarySlip
//    documents dated inside the selected range.
// 2. ALL-TIME, filter-independent: `moneyMade` and `investmentSummary`.
//    "Money made" is a lifetime per-employee performance rollup, not a
//    monthly figure - changing the graph's date range shouldn't make an
//    employee's ROI jump around, so these intentionally ignore `period`.
//
// Every number is traced to real, employee/invoice/expense-linked data:
//  - totalRevenue = SUM(Invoice.subtotal) - the pre-VAT invoiced amount,
//    not Invoice.total.
//  - vatCollected = SUM(Invoice.vatAmount).
//  - totalExpenses = vatCollected + SUM(CompanyExpense.amount) +
//    SUM(SalarySlip.netSalary) + SUM(every Employee.expenses.records[]
//    amount, all types) - VAT is counted as an expense because it's money
//    owed onward to the tax authority, not retained revenue.
//  - totalInvestment (per employee, Money Made) = Employee.
//    totalInvestmentAmount - a cached total (NOT Employee.expenses.
//    records[], NOT the static employee.salary field), recomputed
//    server-side whenever the Employee Profile page's "Employee Expenses"
//    tab is saved (see employee.controller.js's updateEmployee and utils/
//    employeeExpenseFields.js). Same value shown on that page's own
//    "Total Investment" KPI card.
//  - revenueGenerated (per employee) = Employee.totalEarnedAmount - a
//    running lifetime total incremented via $inc at salary-slip create/
//    update/add-deduction time (see salarySlip.controller.js), NOT a live
//    SUM(SalarySlip.netSalary) aggregation - both survive a future purge
//    of the underlying Invoice/SalarySlip/expense documents, and match
//    the Employee Profile page's own "Total Earned" KPI card exactly.
//  - roi = revenueGenerated / totalInvestment * 100.
//  - investmentSummary is the Money Made table's own column sums, so it
//    always reconciles with what's on screen: totalLaborInvestment =
//    SUM(totalInvestment), recoveredInvestment = SUM(revenueGenerated),
//    netProfit = recoveredInvestment - totalLaborInvestment.
export const getFinanceSummary = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    const ownerId = new mongoose.Types.ObjectId(user.ownerId);
    const range = getFinancePeriodRange(req.query.period);
    // Cache key includes the period so Tenant A's Monthly view can never
    // serve Tenant B's data (ownerId-scoped via employeeCachePrefix) and so
    // switching filters never serves a stale, differently-scoped result.
    const cacheKey = `${employeeCachePrefix(user.ownerId)}finance-summary:${range.period}`;

    const summary = await cacheGetOrSet(cacheKey, 30, async () => {
      const slipPeriodMatch = getSalarySlipPeriodMatch(range);

      // Atlas M0 (shared/free tier, confirmed - see PERFORMANCE.md) has a
      // hard concurrent-operation ceiling, not a per-query cost problem
      // (every query shape here is already IXSCAN-only, verified via
      // explain() against production). On a tier like that, the number of
      // Mongo round trips per request matters as much as each one's own
      // cost. Invoice and CompanyExpense were each queried multiple times
      // with the EXACT SAME $match - merged into one $facet per collection
      // so the index scan happens once and all three (Invoice) / two
      // (CompanyExpense) aggregations share it, instead of each repeating
      // the same IXSCAN independently. Cuts this endpoint's Mongo round
      // trips from 9 to 6 with byte-identical results.
      const dateFormat = range.granularity === 'day' ? '%Y-%m-%d' : '%Y-%m';
      const [
        invoiceFacet,
        expenseFacet,
        salaryPeriodAgg,
        companies,
        employees,
        employeeExpensePeriodAgg,
      ] = await Promise.all([
        Invoice.aggregate([
          { $match: { ownerId, invoiceDate: { $gte: range.start, $lt: range.end } } },
          {
            $facet: {
              buckets: [
                { $group: { _id: { $dateToString: { format: dateFormat, date: '$invoiceDate' } }, revenue: { $sum: '$total' } } },
              ],
              byCompany: [
                { $group: { _id: '$company', invoiceTotal: { $sum: '$total' } } },
              ],
              totals: [
                { $group: { _id: null, subtotal: { $sum: '$subtotal' }, vat: { $sum: '$vatAmount' } } },
              ],
            },
          },
        ]),
        CompanyExpense.aggregate([
          { $match: { ownerId, date: { $gte: range.start, $lt: range.end } } },
          {
            $facet: {
              buckets: [
                { $group: { _id: { $dateToString: { format: dateFormat, date: '$date' } }, expense: { $sum: '$amount' } } },
              ],
              total: [
                { $group: { _id: null, total: { $sum: '$amount' } } },
              ],
            },
          },
        ]),
        // Salaries actually paid out (slip netSalary) inside the selected
        // period - part of the period-filtered "Total Expenses" KPI, using
        // the real Employee -> SalarySlip relationship instead of a static
        // salary field.
        SalarySlip.aggregate([
          { $match: { ownerId, status: { $in: PAID_SLIP_STATUSES }, ...slipPeriodMatch } },
          { $group: { _id: null, total: { $sum: '$netSalary' } } },
        ]),
        Company.find({ ownerId, companyRole: 'client' }).select('name status').lean(),
        // totalInvestmentAmount/totalEarnedAmount are the cached/running
        // totals Money Made reads (see the function-level comment) - NOT
        // `expenses` (the records[] ledger), which is deliberately never
        // selected here. Measured: this Employee.find (1002 docs, this
        // tenant's real seed data) transferred 1.17MB when `expenses` was
        // included, 85% of it (988KB) being that one field alone, and cost
        // 336-787ms wall-clock against Atlas versus ~30-40ms for every
        // other query in this Promise.all - by far the single largest
        // contributor to this endpoint's total latency. The period-
        // filtered records[] sum below now happens entirely server-side
        // via aggregation instead.
        Employee.find({ ownerId }).select('employeeId name company totalInvestmentAmount totalEarnedAmount').lean(),
        // Employee.expenses.records[].amount summed server-side for the
        // period-filtered "Total Expenses" KPI - $convert (not $toDate)
        // so a record with a missing/malformed `date` string is excluded
        // (onError/onNull -> null, filtered out by the $match below)
        // rather than throwing and failing the whole aggregation, matching
        // the previous JS-side `isNaN` skip behavior exactly (verified
        // against live data: identical sum to the old per-record JS loop,
        // ~4x faster - 133ms vs 547ms for this tenant's 6,509 records).
        Employee.aggregate([
          { $match: { ownerId } },
          { $unwind: { path: '$expenses.records', preserveNullAndEmptyArrays: false } },
          {
            $addFields: {
              _recordDate: { $convert: { input: '$expenses.records.date', to: 'date', onError: null, onNull: null } },
            },
          },
          { $match: { _recordDate: { $gte: range.start, $lt: range.end } } },
          { $group: { _id: null, total: { $sum: '$expenses.records.amount' } } },
        ]),
      ]);

      const invoiceBuckets = invoiceFacet[0]?.buckets || [];
      const invoiceTotalsByCompany = invoiceFacet[0]?.byCompany || [];
      const invoiceTotalsAgg = invoiceFacet[0]?.totals || [];
      const expenseBuckets = expenseFacet[0]?.buckets || [];
      const expenseTotalAgg = expenseFacet[0]?.total || [];

      const revenueByBucket = new Map(invoiceBuckets.map((r) => [r._id, r.revenue || 0]));
      const expenseByBucket = new Map(expenseBuckets.map((r) => [r._id, r.expense || 0]));

      const trend = [];
      if (range.granularity === 'month') {
        const cursor = new Date(range.start);
        while (cursor < range.end) {
          const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
          const revenue = revenueByBucket.get(key) || 0;
          const expense = expenseByBucket.get(key) || 0;
          trend.push({ label: MONTH_LABELS[cursor.getMonth()], totalIncome: revenue, netProfit: revenue - expense });
          cursor.setMonth(cursor.getMonth() + 1);
        }
      } else {
        // Week-wise buckets for a single-month view (Monthly/Last Month) -
        // the underlying revenueByBucket/expenseByBucket maps are still
        // keyed per calendar day (see the Invoice/CompanyExpense
        // aggregations above), so each week here is just the sum of its
        // (up to 7) daily buckets rather than a separate aggregation.
        // Fixed 7-day windows from the 1st of the month ("Week 1" = days
        // 1-7, "Week 2" = 8-14, ...) - simple and matches how the rest of
        // the app already buckets by calendar position, not ISO weeks.
        const totalDays = Math.round((range.end - range.start) / 86400000);
        const weekCount = Math.ceil(totalDays / 7);
        for (let w = 0; w < weekCount; w += 1) {
          const weekStart = new Date(range.start);
          weekStart.setDate(weekStart.getDate() + w * 7);
          let revenue = 0;
          let expense = 0;
          for (let d = 0; d < 7; d += 1) {
            const day = new Date(weekStart);
            day.setDate(day.getDate() + d);
            if (day >= range.end) break;
            const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
            revenue += revenueByBucket.get(key) || 0;
            expense += expenseByBucket.get(key) || 0;
          }
          trend.push({ label: `Week ${w + 1}`, totalIncome: revenue, netProfit: revenue - expense });
        }
      }

      // Total Revenue = Invoice.subtotal (pre-VAT invoiced amount), not
      // Invoice.total - VAT collected is tracked separately (below) and is
      // itself counted as part of Total Expenses (it's money owed onward
      // to the tax authority, not retained revenue).
      const totalRevenue = invoiceTotalsAgg[0]?.subtotal || 0;
      const vatCollected = invoiceTotalsAgg[0]?.vat || 0;
      const companyExpenseTotal = expenseTotalAgg[0]?.total || 0;
      const salaryPaidTotal = salaryPeriodAgg[0]?.total || 0;
      // Every record in an employee's Expenses-tab ledger (advances,
      // deductions, gas/food/travel/other) dated inside the selected
      // period - real money moving through the business on behalf of
      // employees, same Employee.expenses.records source Money Made's
      // per-employee Total Investment reads from (all-time, below). Summed
      // server-side (see employeeExpensePeriodAgg above), not by pulling
      // every employee's full records[] array into Node.
      const employeeExpensePeriodTotal = employeeExpensePeriodAgg[0]?.total || 0;
      // Total Expenses = VAT collected (owed onward) + company-level
      // expenses + salaries paid out + every employee expense record -
      // all four scoped to the selected period.
      const totalExpenses = vatCollected + companyExpenseTotal + salaryPaidTotal + employeeExpensePeriodTotal;
      const netProfit = totalRevenue - totalExpenses;

      const invoiceTotalByCompanyId = new Map(
        invoiceTotalsByCompany.map((r) => [String(r._id), r.invoiceTotal || 0])
      );

      const workersByCompanyId = new Map();
      employees.forEach((e) => {
        if (!e.company) return;
        const key = String(e.company);
        workersByCompanyId.set(key, (workersByCompanyId.get(key) || 0) + 1);
      });

      const companyRows = companies
        .map((c) => {
          const id = String(c._id);
          return {
            id,
            name: c.name || 'Unnamed',
            workers: workersByCompanyId.get(id) || 0,
            invoiceAmount: invoiceTotalByCompanyId.get(id) || 0,
            status: c.status || 'active',
          };
        })
        .sort((a, b) => b.invoiceAmount - a.invoiceAmount)
        .slice(0, 8);

      // totalInvestmentAmount/totalEarnedAmount are the Employee Profile
      // page's own "Total Investment"/"Total Earned" KPI cards (Employee
      // Expenses tab totals and lifetime salary-slip total, respectively)
      // - cached fields on the Employee document, not summed here, so
      // Money Made always agrees with what that page shows and survives
      // any future purge of the underlying Invoice/SalarySlip/expense
      // records (see the function-level comment and Employee.js).
      const moneyMade = employees.slice(0, 20).map((e) => {
        const totalInvestment = Number(e.totalInvestmentAmount) || 0;
        const revenueGenerated = Number(e.totalEarnedAmount) || 0;
        const roi = totalInvestment > 0 ? Math.round((revenueGenerated / totalInvestment) * 100) : 0;
        return {
          id: String(e._id),
          employeeId: e.employeeId || '-',
          name: e.name || '-',
          totalInvestment,
          revenueGenerated,
          roi,
        };
      });

      const totalLaborInvestment = moneyMade.reduce((sum, r) => sum + r.totalInvestment, 0);
      const recoveredInvestment = moneyMade.reduce((sum, r) => sum + r.revenueGenerated, 0);

      return {
        period: { key: range.period, label: range.label, start: range.start, end: range.end },
        totals: {
          totalRevenue,
          totalExpenses,
          vatCollected,
          netProfit,
        },
        trend,
        companies: companyRows,
        moneyMade,
        investmentSummary: {
          totalLaborInvestment,
          recoveredInvestment,
          netProfit: recoveredInvestment - totalLaborInvestment,
        },
      };
    });

    res.json({ message: 'Finance summary retrieved', data: summary });
  } catch (error) {
    return serverError(res, 'Failed to fetch finance summary');
  }
};


