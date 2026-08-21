// The Employee Profile page's "Employee Expenses" tab
// (crewcontrol-fron/src/components/profile/tabs/EmployeeExpensesTab.jsx)
// stores these as flat sibling keys inside Employee.expenses (a Mixed
// blob that ALSO holds the unrelated `records[]` advance/deduction ledger
// used by the global Expenses page's Labor Expense tab - the two coexist
// on one field but must never be confused). This is the authoritative
// list of category-field keys, kept in one place so the frontend tab and
// this backend total-computation can't drift apart.
export const EMPLOYEE_EXPENSE_CATEGORY_FIELDS = [
  // Recruitment & Legal
  'offerLetter',
  'entryPermit',
  'recruitment', // Tawjeeh Payment
  'emiratesId',
  'stampingFee', // Visa Stamping
  'icn', // ILOE
  'emigrationCancellation',
  'policeClearanceCertificate',
  'changeStatus',
  // Insurance & Medical
  'insurance',
  'medical', // Medical (MOH)
  'medicalInsurance',
  'workersCompensation',
  // Labor & Advance Payments
  'laborPaymentCategory2',
  'laborAdvance',
  // Employee Assets
  'laborPRE', // Labor PPE
  'laborWPS', // Labor Mattress
  'laborPayment', // Labor Utensils
  'otherExpenses', // Other equipment
];

// Sums only the named category fields - never `records[]` or any other
// key that might live on the same Mixed object.
export const sumEmployeeExpenseCategories = (expenses = {}) =>
  EMPLOYEE_EXPENSE_CATEGORY_FIELDS.reduce((sum, key) => sum + (Number(expenses?.[key]) || 0), 0);
