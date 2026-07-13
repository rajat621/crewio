// import SalarySlip from '../../models/SalarySlip.js';
// import Employee from '../../models/Employee.js';

// // Kept in sync with crewcontrol-front/src/pages/Expenses.jsx and
// // components/expenses/ExpenseDetailPanel.jsx - these are the exact same
// // category rules the dashboard's Expense module uses, so the mobile app
// // shows identical numbers for the identical underlying
// // Employee.expenses.records data (both read/write the same store via
// // expense.controller.js).
// const DEDUCTION_TYPES = new Set(['deduction', 'fine', 'penalty', 'penalty amount', 'advance deduction']);
// const TYPE_LABEL_MAP = { gas: 'Gas', advance: 'Advance', 'other food': 'Other (Food)', 'other travel': 'Other (Travel)' };

// const normalizeExpenseType = (type = '', note = '') => {
//   const raw = String(type || note || 'other').trim().toLowerCase();
//   if (!raw) return 'other';
//   if (DEDUCTION_TYPES.has(raw)) return 'deduction';
//   if (raw === 'gas') return 'gas';
//   if (raw === 'advance') return 'advance';
//   if (raw === 'food') return 'other food';
//   if (raw === 'travel') return 'other travel';
//   return raw;
// };

// /**
//  * GET /api/mobile/salary/history
//  * Powers the payment module's salary history + downloadable slip list.
//  */
// export const getSalaryHistory = async (req, res) => {
//   try {
//     const ownerId = req.employee.ownerId || null;
//     const slips = await SalarySlip.find({ employee: req.employee._id, ownerId })
//       .sort({ year: -1, month: -1 })
//       .select('-slipData');

//     return res.json({
//       message: 'Salary history retrieved',
//       data: slips.map((s) => ({
//         _id: s._id,
//         month: s.month,
//         year: s.year,
//         baseSalary: s.baseSalary,
//         allowances: s.allowances,
//         deductions: s.deductions,
//         netSalary: s.netSalary,
//         status: s.status,
//         slipNumber: s.slipNumber,
//         // Existing slip PDF download endpoint is reused as-is (see
//         // salarySlip.routes.js) - the app just needs the id to build the URL.
//         downloadPath: `/api/salary-slips/${s._id}/download`,
//         createdAt: s.createdAt,
//       })),
//     });
//   } catch (error) {
//     return res.status(500).json({ message: 'Failed to fetch salary history', error: error.message });
//   }
// };

// /**
//  * GET /api/mobile/salary/net-history
//  * Net payment history (post-deductions) - same records, net-focused shape,
//  * kept as a separate endpoint since the calendar/payment screens consume it
//  * differently from the raw salary breakdown above.
//  */
// export const getNetPaymentHistory = async (req, res) => {
//   try {
//     const ownerId = req.employee.ownerId || null;
//     const slips = await SalarySlip.find({ employee: req.employee._id, ownerId })
//       .sort({ year: -1, month: -1 })
//       .select('month year netSalary status createdAt');

//     return res.json({
//       message: 'Net payment history retrieved',
//       data: slips.map((s) => ({
//         month: s.month,
//         year: s.year,
//         netSalary: s.netSalary,
//         status: s.status,
//         paidAt: s.createdAt,
//       })),
//     });
//   } catch (error) {
//     return res.status(500).json({ message: 'Failed to fetch net payment history', error: error.message });
//   }
// };

// /**
//  * GET /api/mobile/advances/history
//  * Advances are recorded as entries inside Employee.expenses.records (the
//  * same store the dashboard's expense module already writes to via
//  * expense.controller.js) filtered to type === 'advance'.
//  */
// export const getAdvanceHistory = async (req, res) => {
//   try {
//     const employee = await Employee.findById(req.employee._id).select('expenses');
//     const records = employee?.expenses?.records || [];
//     const advances = records.filter((r) => String(r.type || '').toLowerCase() === 'advance');

//     return res.json({ message: 'Advance history retrieved', data: advances });
//   } catch (error) {
//     return res.status(500).json({ message: 'Failed to fetch advance history', error: error.message });
//   }
// };

// /**
//  * GET /api/mobile/deductions/history
//  * Deductions come from two places that both need to be surfaced: itemized
//  * deductions attached to each generated SalarySlip, and any expense-module
//  * records explicitly typed as a deduction.
//  */
// export const getDeductionHistory = async (req, res) => {
//   try {
//     const ownerId = req.employee.ownerId || null;

//     const slips = await SalarySlip.find({ employee: req.employee._id, ownerId })
//       .sort({ year: -1, month: -1 })
//       .select('month year deductionsDetails deductions');

//     const fromSlips = slips.flatMap((s) =>
//       (s.deductionsDetails || []).map((d) => ({
//         source: 'salary_slip',
//         month: s.month,
//         year: s.year,
//         type: d.type,
//         amount: d.amount,
//         note: d.note,
//         createdAt: d.createdAt,
//       }))
//     );

//     const employee = await Employee.findById(req.employee._id).select('expenses');
//     const records = employee?.expenses?.records || [];
//     const fromExpenses = records
//       .filter((r) => String(r.type || '').toLowerCase() === 'deduction')
//       .map((r) => ({ source: 'expense_module', ...(r.toObject ? r.toObject() : r) }));

//     return res.json({
//       message: 'Deduction history retrieved',
//       data: [...fromSlips, ...fromExpenses],
//     });
//   } catch (error) {
//     return res.status(500).json({ message: 'Failed to fetch deduction history', error: error.message });
//   }
// };

// /**
//  * GET /api/mobile/expenses/summary
//  * Powers the mobile "View Advance" screen with the *exact* same numbers and
//  * history shown on the dashboard's Expense page for this employee - both
//  * read straight from Employee.expenses.records, so any change made there
//  * (add/edit/delete an expense entry) is reflected here immediately on the
//  * next load/pull-to-refresh, with no separate mobile-only data store.
//  */
// export const getMyExpenseSummary = async (req, res) => {
//   try {
//     const employee = await Employee.findById(req.employee._id).select('expenses');
//     const rawRecords = employee?.expenses?.records || [];

//     const history = rawRecords
//       .map((r) => {
//         const type = normalizeExpenseType(r.type, r.note);
//         return {
//           id: r._id ? String(r._id) : null,
//           type,
//           label: r.note || r.type || 'Expense',
//           amount: Number(r.amount || 0),
//           date: r.date || r.createdAt || new Date(),
//           isDeduction: type === 'deduction',
//         };
//       })
//       .sort((a, b) => new Date(b.date) - new Date(a.date));

//     const totalAdvance = history.reduce((sum, r) => sum + r.amount, 0);
//     const deduction = history.filter((r) => r.isDeduction).reduce((sum, r) => sum + r.amount, 0);
//     const remainingAmount = totalAdvance - deduction;

//     // Category breakdown - deductions excluded (they reduce the balance,
//     // they aren't a spend category), 'other' entries expanded by their
//     // free-text note so custom categories the office added still show up
//     // individually, exactly like the dashboard panel.
//     const breakdown = {};
//     for (const r of history) {
//       if (r.isDeduction) continue;
//       if (r.type === 'other') {
//         const note = r.label && !['other', 'expense'].includes(r.label.toLowerCase()) ? r.label : null;
//         const key = note ? `Other (${note})` : 'Other';
//         breakdown[key] = (breakdown[key] || 0) + r.amount;
//       } else {
//         const label = TYPE_LABEL_MAP[r.type] || (r.type.charAt(0).toUpperCase() + r.type.slice(1));
//         breakdown[label] = (breakdown[label] || 0) + r.amount;
//       }
//     }

//     return res.json({
//       message: 'Expense summary retrieved',
//       data: { totalAdvance, deduction, remainingAmount, breakdown, paymentHistory: history },
//     });
//   } catch (error) {
//     return res.status(500).json({ message: 'Failed to fetch expense summary', error: error.message });
//   }
// };

// export default {
//   getSalaryHistory,
//   getNetPaymentHistory,
//   getAdvanceHistory,
//   getDeductionHistory,
//   getMyExpenseSummary,
// };
import SalarySlip from '../../models/SalarySlip.js';
import Employee from '../../models/Employee.js';

// Kept in sync with crewcontrol-front/src/pages/Expenses.jsx and
// components/expenses/ExpenseDetailPanel.jsx - these are the exact same
// category rules the dashboard's Expense module uses, so the mobile app
// shows identical numbers for the identical underlying
// Employee.expenses.records data (both read/write the same store via
// expense.controller.js).
//
// The "* deduction" variants (gas/food/travel/other deduction) are what a
// deduction added from the salary-slip generation screen is tagged with -
// distinct from the bare "gas"/"food"/"travel" strings the regular Add
// Expense flow uses for the same categories, so a Gas *deduction* entered
// while generating a slip is never confused with a Gas *expense* added
// separately: same category, opposite effect on the running balance.
const DEDUCTION_TYPES = new Set([
  'deduction', 'fine', 'penalty', 'penalty amount', 'advance deduction',
  'gas deduction', 'food deduction', 'travel deduction', 'other deduction',
]);
const TYPE_LABEL_MAP = { gas: 'Gas', advance: 'Advance', 'other food': 'Other (Food)', 'other travel': 'Other (Travel)' };

const normalizeExpenseType = (type = '', note = '') => {
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
 * GET /api/mobile/salary/history
 * Powers the payment module's salary history + downloadable slip list.
 */
export const getSalaryHistory = async (req, res) => {
  try {
    const ownerId = req.employee.ownerId || null;
    const slips = await SalarySlip.find({ employee: req.employee._id, ownerId })
      .sort({ year: -1, month: -1 })
      .select('-slipData');

    return res.json({
      message: 'Salary history retrieved',
      data: slips.map((s) => ({
        _id: s._id,
        month: s.month,
        year: s.year,
        baseSalary: s.baseSalary,
        allowances: s.allowances,
        deductions: s.deductions,
        netSalary: s.netSalary,
        status: s.status,
        slipNumber: s.slipNumber,
        // Existing slip PDF download endpoint is reused as-is (see
        // salarySlip.routes.js) - the app just needs the id to build the URL.
        downloadPath: `/api/salary-slips/${s._id}/download`,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch salary history', error: error.message });
  }
};

/**
 * GET /api/mobile/salary/net-history
 * Net payment history (post-deductions) - same records, net-focused shape,
 * kept as a separate endpoint since the calendar/payment screens consume it
 * differently from the raw salary breakdown above.
 */
export const getNetPaymentHistory = async (req, res) => {
  try {
    const ownerId = req.employee.ownerId || null;
    const slips = await SalarySlip.find({ employee: req.employee._id, ownerId })
      .sort({ year: -1, month: -1 })
      .select('month year netSalary status createdAt');

    return res.json({
      message: 'Net payment history retrieved',
      data: slips.map((s) => ({
        month: s.month,
        year: s.year,
        netSalary: s.netSalary,
        status: s.status,
        paidAt: s.createdAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch net payment history', error: error.message });
  }
};

/**
 * GET /api/mobile/advances/history
 * Advances are recorded as entries inside Employee.expenses.records (the
 * same store the dashboard's expense module already writes to via
 * expense.controller.js) filtered to type === 'advance'.
 */
export const getAdvanceHistory = async (req, res) => {
  try {
    const employee = await Employee.findById(req.employee._id).select('expenses');
    const records = employee?.expenses?.records || [];
    const advances = records.filter((r) => String(r.type || '').toLowerCase() === 'advance');

    return res.json({ message: 'Advance history retrieved', data: advances });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch advance history', error: error.message });
  }
};

/**
 * GET /api/mobile/deductions/history
 * Deductions come from two places that both need to be surfaced: itemized
 * deductions attached to each generated SalarySlip, and any expense-module
 * records explicitly typed as a deduction.
 */
export const getDeductionHistory = async (req, res) => {
  try {
    const ownerId = req.employee.ownerId || null;

    const slips = await SalarySlip.find({ employee: req.employee._id, ownerId })
      .sort({ year: -1, month: -1 })
      .select('month year deductionsDetails deductions');

    const fromSlips = slips.flatMap((s) =>
      (s.deductionsDetails || []).map((d) => ({
        source: 'salary_slip',
        month: s.month,
        year: s.year,
        type: d.type,
        amount: d.amount,
        note: d.note,
        createdAt: d.createdAt,
      }))
    );

    const employee = await Employee.findById(req.employee._id).select('expenses');
    const records = employee?.expenses?.records || [];
    const fromExpenses = records
      .filter((r) => String(r.type || '').toLowerCase() === 'deduction')
      .map((r) => ({ source: 'expense_module', ...(r.toObject ? r.toObject() : r) }));

    return res.json({
      message: 'Deduction history retrieved',
      data: [...fromSlips, ...fromExpenses],
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch deduction history', error: error.message });
  }
};

/**
 * GET /api/mobile/expenses/summary
 * Powers the mobile "View Advance" screen with the *exact* same numbers and
 * history shown on the dashboard's Expense page for this employee - both
 * read straight from Employee.expenses.records, so any change made there
 * (add/edit/delete an expense entry) is reflected here immediately on the
 * next load/pull-to-refresh, with no separate mobile-only data store.
 */
export const getMyExpenseSummary = async (req, res) => {
  try {
    const employee = await Employee.findById(req.employee._id).select('expenses');
    const rawRecords = employee?.expenses?.records || [];

    const history = rawRecords
      .map((r) => {
        const type = normalizeExpenseType(r.type, r.note);
        return {
          id: r._id ? String(r._id) : null,
          type,
          label: r.note || r.type || 'Expense',
          amount: Number(r.amount || 0),
          date: r.date || r.createdAt || new Date(),
          isDeduction: type === 'deduction',
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // "Added" is every non-deduction entry (advance given, gas, food,
    // travel, other) - this is the running balance that grows every time
    // something is added via Add Expense. Deductions (from either the
    // Expense module directly, or mirrored in from salary-slip generation)
    // reduce it. Previously this summed EVERY record regardless of type,
    // which meant a deduction's own amount got added here and then
    // subtracted again below, netting to zero effect - deductions never
    // actually reduced the balance.
    const totalAdvance = history.filter((r) => !r.isDeduction).reduce((sum, r) => sum + r.amount, 0);
    const deduction = history.filter((r) => r.isDeduction).reduce((sum, r) => sum + r.amount, 0);
    const remainingAmount = totalAdvance - deduction;

    // Category breakdown - deductions excluded (they reduce the balance,
    // they aren't a spend category), 'other' entries expanded by their
    // free-text note so custom categories the office added still show up
    // individually, exactly like the dashboard panel.
    const breakdown = {};
    for (const r of history) {
      if (r.isDeduction) continue;
      if (r.type === 'other') {
        const note = r.label && !['other', 'expense'].includes(r.label.toLowerCase()) ? r.label : null;
        const key = note ? `Other (${note})` : 'Other';
        breakdown[key] = (breakdown[key] || 0) + r.amount;
      } else {
        const label = TYPE_LABEL_MAP[r.type] || (r.type.charAt(0).toUpperCase() + r.type.slice(1));
        breakdown[label] = (breakdown[label] || 0) + r.amount;
      }
    }

    return res.json({
      message: 'Expense summary retrieved',
      data: { totalAdvance, deduction, remainingAmount, breakdown, paymentHistory: history },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch expense summary', error: error.message });
  }
};

export default {
  getSalaryHistory,
  getNetPaymentHistory,
  getAdvanceHistory,
  getDeductionHistory,
  getMyExpenseSummary,
};