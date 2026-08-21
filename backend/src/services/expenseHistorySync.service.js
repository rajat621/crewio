import Employee from '../models/Employee.js';

// A salary slip's own deduction list (deductionsDetails, or the
// dashboard's deduction table) is the single source of truth for "what
// this slip deducted" - Expense History, Remaining Balance, and Payment
// History all need to reflect exactly that, never a stale copy from when
// the slip was first generated.
export const SOURCE_SALARY_SLIP = 'salary_slip';

/**
 * Reconciles an employee's Expense History (Employee.expenses.records)
 * with the CURRENT set of deduction entries for one salary slip.
 *
 * Every record this slip previously mirrored is removed and replaced with
 * fresh ones built from [deductionEntries] - so:
 *  - editing an amount/type updates the mirrored record (no stale copy)
 *  - removing a deduction removes its mirrored record
 *  - re-saving with identical data never creates a second copy (this is
 *    what "prevent duplicate history entries during updates" means here -
 *    replace-the-whole-set, not append)
 *  - Remaining Balance and Payment History, which are both computed FROM
 *    Employee.expenses.records, update automatically as a consequence -
 *    there's nothing else to keep in sync separately.
 *
 * Called after every create/update of a salary slip's deductions. Safe to
 * call with an empty [deductionEntries] array - that just clears this
 * slip's mirrored history (e.g. all its deductions were removed).
 */
export const syncSalarySlipExpenseRecords = async (employeeId, slipId, deductionEntries = []) => {
  if (!employeeId || !slipId) return;

  const employee = await Employee.findById(employeeId);
  if (!employee) return;

  const existingRecords = Array.isArray(employee.expenses?.records) ? employee.expenses.records : [];
  const slipIdStr = String(slipId);

  // Drop every record this slip previously mirrored - whatever's passed in
  // now is the complete, current picture, not an addition to it.
  const keptRecords = existingRecords.filter(
    (record) => !(record?.source === SOURCE_SALARY_SLIP && String(record?.sourceSlipId || '') === slipIdStr)
  );

  const freshRecords = (deductionEntries || [])
    .filter((entry) => entry?.type && Number(entry?.amount) > 0)
    .map((entry, index) => ({
      // Stable, unique per (slip, index) so re-running this with the same
      // input is idempotent rather than accumulating new ids each time.
      _id: `slip-${slipIdStr}-${index}`,
      type: String(entry.type).toLowerCase(),
      amount: Number(entry.amount),
      date: entry.date || new Date().toISOString(),
      note: entry.note || '',
      source: SOURCE_SALARY_SLIP,
      sourceSlipId: slipIdStr,
    }));

  await Employee.findByIdAndUpdate(employeeId, {
    $set: { 'expenses.records': [...keptRecords, ...freshRecords] },
  });
};
