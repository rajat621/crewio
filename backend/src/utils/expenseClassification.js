// backend/src/utils/expenseClassification.js
//
// Shared classification for employee expense/advance ledger entries -
// previously duplicated (and at risk of drifting) between
// mobilePayments.controller.js and anywhere else that needs to know
// whether a record increases or decreases an employee's available
// balance. "advance" is money given TO the employee (increases what they
// can draw against); everything in DEDUCTION_TYPES reduces that same
// balance, whatever its own category (gas/food/travel/fine/penalty/etc) -
// mirrors the running-balance calculation already used by the dashboard's
// Expenses page and salary-slip generation (summarizeEmployeeExpenseRecords
// in GenerateSalarySlip.jsx).
export const DEDUCTION_TYPES = new Set([
  'deduction', 'fine', 'penalty', 'penalty amount', 'advance deduction',
  'gas deduction', 'food deduction', 'travel deduction', 'other deduction',
]);

export const isDeductionType = (type) => DEDUCTION_TYPES.has(String(type || '').trim().toLowerCase());

export const normalizeExpenseType = (type = '', note = '') => {
  const raw = String(type || note || 'other').trim().toLowerCase();
  if (!raw) return 'other';
  if (DEDUCTION_TYPES.has(raw)) return 'deduction';
  if (raw === 'gas') return 'gas';
  if (raw === 'advance') return 'advance';
  if (raw === 'food') return 'other food';
  if (raw === 'travel') return 'other travel';
  return raw;
};

/**
 * Computes an employee's current advance balance from their raw expense
 * records, using the same rule as the dashboard: total advance given minus
 * every deduction-type entry recorded against them (regardless of that
 * entry's own category).
 */
export const computeRemainingBalance = (records = []) => {
  let totalAdvanceGiven = 0;
  let totalDeducted = 0;
  for (const record of records) {
    const amount = Number(record?.amount || 0);
    const type = String(record?.type || '').trim().toLowerCase();
    if (type === 'advance') {
      totalAdvanceGiven += amount;
    } else if (DEDUCTION_TYPES.has(type)) {
      totalDeducted += amount;
    }
  }
  return Math.max(0, totalAdvanceGiven - totalDeducted);
};
