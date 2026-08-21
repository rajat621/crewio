/**
 * invoiceCalc.js
 *
 * Browser mirror of ai-services/invoice_draft.py::recompute.
 *
 * This exists so totals move the instant a digit is typed, without a network
 * round trip. It is NOT the authority. Every autosave sends the raw editable
 * fields to the server, which recomputes and returns the numbers that get
 * stored and printed. If this file and the Python ever disagree, the Python
 * is right and this one is the bug.
 *
 * Keep the two in step. The rules are short on purpose:
 *
 *     row.amount  = amountLocked ? typed value : hours * rate
 *     subtotal    = sum(row.amount)
 *     deductions  = sum(deductionLine.amount)
 *     vat         = vatBase * vatRate      (vatBase per vatBasis)
 *     grossTotal  = subtotal + vat
 *     netTotal    = subtotal + vat - deductions
 */

export const VAT_BASIS_SUBTOTAL = 'subtotal';
export const VAT_BASIS_ADJUSTED = 'adjusted';

export const REVIEW_CONFIDENCE_THRESHOLD = 0.75;

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  // Accept pasted figures with thousands separators and stray currency codes,
  // which is how numbers arrive when someone copies a column out of Excel.
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : fallback;
};

/** Reasons a line deserves a second look. Mirrors _flag_row in Python. */
export const flagRow = (row) => {
  const reasons = [];
  const hours = toNumber(row.hours);
  const rate = toNumber(row.rate);
  const amount = toNumber(row.amount);

  if (toNumber(row.confidence, 1) < REVIEW_CONFIDENCE_THRESHOLD) reasons.push('low_confidence');
  if (rate <= 0) reasons.push('missing_rate');
  if (hours <= 0) reasons.push('missing_hours');
  if (hours > 0 && rate > 0) {
    const expected = r2(hours * rate);
    if (expected > 0 && Math.abs(amount - expected) / expected > 0.01) {
      reasons.push('amount_mismatch');
    }
  }
  if (!String(row.trade || '').trim()) reasons.push('missing_trade');

  return reasons;
};

export const REVIEW_REASON_LABELS = {
  low_confidence: 'The extractor was unsure about this line',
  missing_rate: 'No rate found',
  missing_hours: 'No hours found',
  amount_mismatch: 'Amount does not match hours x rate',
  missing_trade: 'No trade or description',
};

/** Recompute a whole draft. Returns a new object; does not mutate the input. */
export const recompute = (draft) => {
  if (!draft) return draft;

  let vatRate = toNumber(draft.vat_rate, 0.05);
  if (vatRate > 1) vatRate = vatRate / 100;
  vatRate = Math.max(0, Math.min(vatRate, 1));

  const vatBasis =
    draft.vat_basis === VAT_BASIS_ADJUSTED ? VAT_BASIS_ADJUSTED : VAT_BASIS_SUBTOTAL;

  const rows = (draft.rows || []).map((row) => {
    if (row.removed) return row;
    const hours = r2(toNumber(row.hours));
    const rate = Math.round(toNumber(row.rate) * 10000) / 10000;
    const amount = row.amount_locked ? r2(toNumber(row.amount)) : r2(hours * rate);
    const next = { ...row, hours, rate, amount };
    const reasons = flagRow(next);
    return { ...next, review_reasons: reasons, needs_review: reasons.length > 0 };
  });

  const deductionLines = (draft.deduction_lines || []).map((line) => ({
    ...line,
    amount: r2(toNumber(line.amount)),
  }));

  const subtotal = r2(
    rows.filter((r) => !r.removed).reduce((sum, r) => sum + toNumber(r.amount), 0)
  );
  const deductions = r2(
    deductionLines.filter((d) => !d.removed).reduce((sum, d) => sum + toNumber(d.amount), 0)
  );

  const adjustedSubtotal = r2(subtotal - deductions);
  const vatBase = vatBasis === VAT_BASIS_SUBTOTAL ? subtotal : adjustedSubtotal;
  const vat = r2(vatBase * vatRate);
  const deductionVat = r2(deductions * vatRate);

  const totals = {
    subtotal,
    deductions,
    deduction_vat: deductionVat,
    adjusted_subtotal: adjustedSubtotal,
    vat_rate: vatRate,
    vat_basis: vatBasis,
    vat,
    gross_total: r2(subtotal + vat),
    net_total: r2(subtotal + vat - deductions),
    line_count: rows.filter((r) => !r.removed).length,
  };

  return {
    ...draft,
    vat_rate: vatRate,
    vat_basis: vatBasis,
    rows,
    deduction_lines: deductionLines,
    totals,
    blocking_issues: validateDraft({ ...draft, rows, totals }),
  };
};

/** Reasons the Approve button stays disabled. Mirrors validate_draft in Python. */
export const validateDraft = (draft) => {
  const issues = [];
  const rows = (draft.rows || []).filter((r) => !r.removed);
  const totals = draft.totals || {};

  if (rows.length === 0) issues.push('Invoice has no line items.');
  if (rows.some((r) => !String(r.trade || '').trim())) {
    issues.push('Every line needs a trade or description.');
  }
  if (toNumber(totals.subtotal) <= 0) issues.push('Subtotal must be greater than zero.');
  if (toNumber(totals.net_total) < 0) issues.push('Net total is negative - check the deductions.');
  if (toNumber(totals.deductions) > toNumber(totals.subtotal)) {
    issues.push('Deductions exceed the subtotal.');
  }

  return issues;
};

/** Which fields the user has changed, for the edited-cell markers. */
export const buildEditedMap = (draft) => {
  const originals = new Map(
    (draft?.ai_original?.rows || []).map((row) => [row.row_id, row])
  );
  const edited = new Set();

  for (const row of draft?.rows || []) {
    const before = originals.get(row.row_id);
    if (!before) continue;
    for (const field of ['trade', 'project_id', 'description', 'hours', 'rate', 'amount']) {
      const a = before[field];
      const b = row[field];
      const numeric = typeof a === 'number' || typeof b === 'number';
      const changed = numeric
        ? Math.abs(toNumber(a) - toNumber(b)) > 0.005
        : String(a ?? '') !== String(b ?? '');
      if (changed) edited.add(`${row.row_id}:${field}`);
    }
  }

  return edited;
};

export const formatMoney = (value, currency = 'AED') =>
  `${currency} ${toNumber(value).toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const formatNumber = (value, dp = 2) =>
  toNumber(value).toLocaleString('en-AE', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });