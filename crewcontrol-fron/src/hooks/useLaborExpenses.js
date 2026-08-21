import { useQuery } from '@tanstack/react-query'
import { employeesApi } from '../api/employees'
import { expensesApi } from '../api/expenses'
import { summarizeEmployeeExpenses } from '../utils/expenseDerivation'

// Was previously fanning out one /api/expenses?employeeId=X call per
// employee via Promise.allSettled (comment here used to claim "not
// consolidated into a single backend call that doesn't exist" - that's
// wrong: expense.controller.js's getExpenses already returns every
// employee's records in one response, cached 20s server-side, whenever
// employeeId is omitted). At real tenant sizes (this was found against a
// 1000-employee seeded dataset) that fan-out meant ~1000 concurrent
// requests on every Expenses page load - a genuine N+1, not a stylistic
// preference - and the page rendered "No Expense Added" despite real
// records existing, because so many of those requests were still in
// flight when the aggregate list first settled. Now makes exactly one
// call and groups the flat {employeeId, employeeName, ...record} array
// it returns back into per-employee rows client-side.
export const laborExpensesKey = (user, page, limit, search) =>
  ['laborExpenses', 'summary', { role: user?.role, employeeId: user?.employeeId, page, limit, search }]

// page/limit/search are real server-side pagination (see
// expense.controller.js's getExpenses) - the owner branch used to fetch
// EVERY employee's ENTIRE expense history in one response just to group it
// by employee client-side (unbounded, grows without limit as advances/
// deductions accumulate - measured 1.45MB/6,509 records at this tenant's
// size). The backend now sorts/pages by employee (most-recently-active
// first, matching this page's own row grain) and returns each row's
// display fields (trade/emiratesId/employeeCode) already embedded, so
// building `rows` here no longer needs the full employee list at all - this
// query and useEmployees() (used separately by Expenses.jsx for the
// Add-Expense employee picker, which must be able to find an employee who
// has ZERO expense records yet) now run genuinely in parallel instead of
// one waiting on the other.
export const useLaborExpenses = (user, { page = 1, limit = 20, search = '' } = {}) => {
  const isEmployee = user?.role === 'employee' && Boolean(user?.employeeId);

  const query = useQuery({
    queryKey: laborExpensesKey(user, page, limit, search),
    queryFn: async () => {
      if (isEmployee) {
        const [selfResponse, expenseResponse] = await Promise.all([
          employeesApi.getEmployee(user.employeeId),
          expensesApi.getExpenses(user.employeeId),
        ]);
        const selfEmployee = selfResponse?.data?.data || selfResponse?.data?.employee || selfResponse?.data;
        const employeeList = selfEmployee ? [selfEmployee] : [];
        const payload = expenseResponse?.data?.expenses || expenseResponse?.data?.data || expenseResponse?.data;
        const row = selfEmployee ? summarizeEmployeeExpenses(selfEmployee, payload) : null;
        const rows = row && row.paymentHistory.length ? [row] : [];
        return { rows, employees: employeeList, total: rows.length };
      }

      const expenseResponse = await expensesApi.getExpenses(undefined, page, limit, search);
      const flatRecords = expenseResponse?.data?.expenses?.records
        || expenseResponse?.data?.data?.records
        || expenseResponse?.data?.records
        || [];
      const total = expenseResponse?.data?.total ?? 0;

      const recordsByEmployeeId = new Map();
      const employeeMetaById = new Map();
      flatRecords.forEach((record) => {
        const key = String(record?.employeeId || '');
        if (!key) return;
        if (!recordsByEmployeeId.has(key)) recordsByEmployeeId.set(key, []);
        recordsByEmployeeId.get(key).push(record);
        if (!employeeMetaById.has(key)) {
          employeeMetaById.set(key, {
            _id: key,
            name: record.employeeName,
            trade: record.trade,
            emiratesId: record.emiratesId,
            employeeId: record.employeeCode,
          });
        }
      });

      const nextRows = [];
      recordsByEmployeeId.forEach((records, employeeIdKey) => {
        const employee = employeeMetaById.get(employeeIdKey);
        const row = summarizeEmployeeExpenses(employee, { records });
        if (row.paymentHistory.length) nextRows.push(row);
      });

      nextRows.sort((a, b) => Number(b.latestTimestamp || 0) - Number(a.latestTimestamp || 0));

      return { rows: nextRows, total };
    },
    placeholderData: (prev) => prev,
  });

  return query;
};
