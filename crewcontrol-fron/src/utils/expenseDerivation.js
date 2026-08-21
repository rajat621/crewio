// Extracted verbatim from Expenses.jsx during the React Query migration -
// zero logic changes, including the comment explaining the
// totalAdvance/deduction netting-to-zero bug fix already present in the
// original.

// The "* deduction" variants are what Gas/Food/Travel/Other are tagged with
// when a deduction of that category is added from the salary-slip
// generation screen's Add Deduction section - kept distinct from the bare
// "gas"/"food"/"travel" strings a regular Add Expense entry uses, so the
// same category can mean "added" in one flow and "deducted" in the other
// without ambiguity.
export const DEDUCTION_TYPES = new Set([
  "deduction", "fine", "penalty", "penalty amount", "advance deduction",
  "gas deduction", "food deduction", "travel deduction", "other deduction",
]);

export function formatDateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function normalizeExpenseType(type = "", note = "") {
  const raw = String(type || note || "other").trim().toLowerCase();
  if (!raw) return "other";
  if (DEDUCTION_TYPES.has(raw)) return "deduction";
  if (raw === "gas") return "gas";
  if (raw === "advance") return "advance";
  if (raw === "food") return "other food";
  if (raw === "travel") return "other travel";
  return raw;
}

export function normalizeExpenseRecords(records = []) {
  return records
    .map((record, index) => ({
      id: String(record?._id || record?.id || `${Date.now()}-${index}`),
      type: normalizeExpenseType(record?.type, record?.note),
      label: record?.note || record?.type || "Expense",
      amount: Number(record?.amount || 0),
      date: record?.date || new Date().toISOString(),
      note: record?.note || "",
      raw: record,
    }))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

export function normalizeCompanyExpenseRows(records = []) {
  return records
    .map((record) => ({
      id: String(record?._id || record?.id || ""),
      name: record?.name || "Expense",
      date: record?.date || null,
      dateLabel: formatDateLabel(record?.date),
      amount: Number(record?.amount || 0),
      raw: record,
    }))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

export function summarizeEmployeeExpenses(employee, expensePayload) {
  const records = Array.isArray(expensePayload?.records)
    ? expensePayload.records
    : Array.isArray(expensePayload)
      ? expensePayload
      : [];

  const latestTimestamp = records.reduce((max, record) => {
    const ts = new Date(record?.date || 0).getTime();
    return Number.isNaN(ts) ? max : Math.max(max, ts);
  }, 0);

  const paymentHistory = normalizeExpenseRecords(records).map((record) => ({
    ...record,
    amount: Number(record.amount || 0),
    date: formatDateLabel(record.date),
  }));

  // "Added" is every non-deduction record (advance given, gas, food,
  // travel, other) - the running total that grows every time something is
  // added via Add Expense. Deductions reduce it (see `deduction` below).
  // Previously this summed EVERY record including deductions, so a
  // deduction's own amount was added here and then subtracted again below,
  // netting to zero effect - deductions never actually reduced the total.
  const totalAdvance = paymentHistory
    .filter((record) => record.type !== "deduction")
    .reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const deduction = paymentHistory
    .filter((record) => record.type === "deduction")
    .reduce((sum, record) => sum + Number(record.amount || 0), 0);

  const breakdown = paymentHistory.reduce((acc, record) => {
    const key = record.type || "other";
    acc[key] = (acc[key] || 0) + Number(record.amount || 0);
    return acc;
  }, {});

  return {
    id: String(employee?._id || employee?.id || employee?.employeeId || ""),
    employeeId: String(employee?._id || employee?.id || employee?.employeeId || ""),
    employeeName:
      employee?.name ||
      [employee?.firstName, employee?.lastName].filter(Boolean).join(" ").trim() ||
      employee?.employeeName ||
      "Employee",
    emiratesId: employee?.emiratesId || employee?.employeeId || "",
    trade: employee?.trade || employee?.position || "—",
    totalAdvance,
    deduction,
    remainingAmount: Math.max(0, totalAdvance - deduction),
    breakdown,
    paymentHistory,
    records,
    latestTimestamp,
    rawEmployee: employee,
  };
}

export function getEmployeeSearchValue(employee = {}) {
  return `${employee?.name || ""} ${employee?.firstName || ""} ${employee?.lastName || ""} ${employee?.emiratesId || ""} ${employee?.employeeId || ""}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
