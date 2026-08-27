import { Invoice } from '../models/Invoice.js';
import { serverError } from '../utils/apiResponse.js';
import { cacheGetOrSet, cacheInvalidate } from '../utils/cache.util.js';
import { employeeCachePrefix } from './employee.controller.js';
import Company from '../models/Company.js';
import User from '../models/User.js';
import AttendanceImport from '../models/AttendanceImport.js';
import { extractDocument } from '../services/extraction.service.js';
import { renderInvoicePdf } from '../services/invoiceRenderer.service.js';
import { validateExtractionQuality, getGatingAction } from '../services/confidenceGating.service.js';
import { generateInvoiceNumber, getNextInvoiceNumber } from '../services/invoiceNumber.service.js';
import path from 'path';
import { randomUUID, createHmac } from 'crypto';
import { env } from '../config/env.js';
import { fileURLToPath } from 'url';
import FileRecord from '../models/FileRecord.js';
import AuditLog from '../models/AuditLog.js';
import {
  saveLocalFile,
  objectExists,
  streamObject,
  downloadToTempFile,
  reserveTempFilePath,
  cleanupTempFile,
  driverFromStoredPath,
} from '../services/storage.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');
const storageRoot = path.join(backendRoot, 'src', 'storage');

// Resolve a FileRecord (or a bare stored path/key string) to the
// { driver, key } pair storage.service.js needs. This is the ONLY place in
// this controller that decides how a persisted path maps to a storage
// object - business logic below never touches fs or an R2 client directly.
const resolveStorageRef = (fileRecordOrPath) => {
  if (fileRecordOrPath && typeof fileRecordOrPath === 'object') {
    const driver = fileRecordOrPath.storageDriver || driverFromStoredPath(fileRecordOrPath.path);
    const key = fileRecordOrPath.storageKey || fileRecordOrPath.path;
    return { driver, key };
  }
  const driver = driverFromStoredPath(fileRecordOrPath);
  return { driver, key: fileRecordOrPath };
};

// Legacy helper retained ONLY for the company branding fields
// (invoiceTemplate / signature / stamp), which are stored as inline base64
// data URIs on the Company document, not as FileRecord-backed storage
// objects - toAbsoluteStoragePath() is a no-op for those (it returns the
// data: URI untouched) and only resolves a real path for old, pre-data-URI
// seed records that still point at a local file.
const toAbsoluteStoragePath = (inputPath) => {
  if (!inputPath || typeof inputPath !== 'string') {
    return inputPath;
  }

  const normalized = inputPath.trim();

  if (normalized.startsWith('data:')) {
    return normalized;
  }

  if (normalized.startsWith('/')) {
    return path.join(storageRoot, normalized.replace(/^\//, ''));
  }

  if (path.isAbsolute(normalized)) {
    return normalized;
  }

  if (normalized.startsWith('./src/storage/') || normalized.startsWith('src/storage/')) {
    const rel = normalized.replace(/^\.\//, '').replace(/^src\/storage\//, '');
    return path.join(storageRoot, rel);
  }

  return path.resolve(backendRoot, normalized);
};

const logEvent = (event, fields = {}) => {
  console.log(JSON.stringify({ event, ...fields }));
};

const financialSnapshot = (financials = {}) => ({
  total_deduction: Number(financials?.total_deduction || 0),
  total_vat: Number(financials?.total_vat || 0),
  net_payable: Number(financials?.net_payable || 0),
  adjusted_subtotal: Number(financials?.adjusted_subtotal || 0),
});

const INVALID_ROW_MARKERS = [
  'OFFICE',
  'TRN',
  'EMAIL',
  'PHONE',
  'P.O. BOX',
  'PO BOX',
  'INVOICE',
  'SUB-CONTRACTOR',
  'SUB CONTRACTOR',
  'PRINT DATE',
  'PREPARATION DATE',
  'PAGE',
  'APPROVED BY',
  'CHECKED BY',
  'TOTAL DEDUCTION',
  'GROSS TOTAL',
  'NET AMOUNT PAYABLE',
];

const PROJECT_CODE_REGEX = /\bP\d{2,8}[A-Z0-9-]*\b/i;
const TRADE_ALIAS_MAP = {
  STEELFIXER: 'STEEL FIXER',
  TILEMASON: 'TILE MASON',
  MASON: 'MASON',
  CARPENTER: 'CARPENTER',
  HELPER: 'HELPER',
  FINISHINGCARPENTER: 'FINISHING CARPENTER',
  SHUTTERINGCARPENTER: 'CARPENTER',
};

const normalizeTradeLabel = (value) => {
  const text = String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  if (!text) return '';

  const compact = text.replace(/\s+/g, '');
  return TRADE_ALIAS_MAP[compact] || TRADE_ALIAS_MAP[text] || text;
};

const isInvoiceFooterRow = (value) => {
  const label = normalizeTradeLabel(value);
  if (!label) return true;
  const compact = label.replace(/\s+/g, '');
  return ['TOTAL', 'SUBTOTAL', 'GROSSTOTAL', 'NETTOTAL', 'NETAMOUNTPAYABLE', 'VAT', 'VATAMOUNT', 'DEDUCTION', 'TOTALDEDUCTION'].includes(compact);
};

const normalizeInvoiceRows = (rows = []) => {
  return rows
    .map((row) => {
      const quantity = Number(row.quantity ?? row.qty ?? row.hours ?? row.total_hours ?? 0) || 0;
      const rate = Number(row.rate ?? row.unit_price ?? 0) || 0;
      const amount = Number(row.amount ?? row.total ?? 0) || 0;
      const description = normalizeTradeLabel(row.description || row.trade || row.service || row.name || '');
      const rowKind = String(row.row_kind || row.rowKind || row.kind || '').trim().toLowerCase();
      const identifier = String(
        row.identifier ||
          row.employee_id ||
          row.emp_id ||
          row.employee_code ||
          row.worker_id ||
          row.labour_id ||
          row.id_no ||
          row.id ||
          row.code ||
          ''
      ).trim();
      const project = String(row.project || row.project_no || row.project_id || '').trim();

      return {
        description,
        quantity,
        rate,
        amount,
        project,
        identifier,
        row_kind: rowKind,
      };
    })
    .filter((row) => row.description && !isInvoiceFooterRow(row.description))
    .filter((row) => row.amount > 0 || row.quantity > 0);
};

const normalizeRejectedRows = (rows = []) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      raw_row: row?.raw_row ?? row,
      rejection_reason: String(row?.rejection_reason || 'failed_row_validation'),
      source_page: Number(row?.source_page || 1),
      extraction_method: String(row?.extraction_method || 'unknown'),
    }))
    .filter((row) => Boolean(row.raw_row));
};

const groupInvoiceRowsForRenderer = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const normalizedRows = rows.map((row) => ({
    ...row,
    description: normalizeTradeLabel(row?.description || row?.trade || row?.service || row?.name || ''),
    row_kind: String(row?.row_kind || row?.rowKind || row?.kind || '').trim().toLowerCase(),
  }));

  const billingRows = normalizedRows.filter((row) => row.row_kind === 'billing_summary');
  if (billingRows.length) {
    return dedupeExactRows(billingRows);
  }

  const tradeRows = normalizedRows.filter((row) => row.row_kind === 'trade_summary');
  if (tradeRows.length) {
    return dedupeExactRows(tradeRows);
  }

  const employeeRows = normalizedRows.filter((row) => row.row_kind === 'employee' || !row.row_kind);
  const groups = new Map();
  const order = [];

  for (const row of employeeRows) {
    const description = row.description;
    if (!description) continue;
    if (isInvoiceFooterRow(description)) continue;

    const project = String(row?.project || row?.project_id || '').trim();
    const rateKey = Number(row?.rate || 0).toFixed(4);
    const key = `${description}||${project}||${rateKey}`;
    const quantity = Number(row?.quantity ?? row?.qty ?? row?.hours ?? row?.total_hours ?? 0) || 0;
    const rate = Number(row?.rate ?? row?.unit_price ?? 0) || 0;
    const amount = Number(row?.amount ?? row?.total ?? 0) || 0;
    const identifier = String(
      row?.employee_id || row?.emp_id || row?.employee_code || row?.worker_id || row?.labour_id || row?.id_no || row?.id || row?.code || ''
    ).trim();

    if (!groups.has(key)) {
      groups.set(key, {
        description,
        quantity: 0,
        rate: 0,
        amount: 0,
        project,
        identifier: project,
        row_kind: 'employee',
        source_employee_ids: [],
      });
      order.push(key);
    }

    const group = groups.get(key);
    group.quantity += quantity;
    group.amount += amount;
    if (group.quantity > 0 && rate > 0) {
      group.rate = group.amount / group.quantity;
    } else if (group.rate <= 0 && rate > 0) {
      group.rate = rate;
    }
    if (!group.project && project) {
      group.project = project;
      group.identifier = project;
    }
    if (identifier && identifier !== group.project && !group.source_employee_ids.includes(identifier)) {
      group.source_employee_ids.push(identifier);
    }
  }

  return order.map((key) => {
    const group = groups.get(key);
    return {
      ...group,
      quantity: Number(group.quantity.toFixed(2)),
      rate: Number(group.rate.toFixed(4)),
      amount: Number(group.amount.toFixed(2)),
    };
  });
};

const dedupeExactRows = (rows = []) => {
  const seen = new Map();
  const order = [];

  for (const row of rows) {
    const key = [
      row.row_kind || '',
      row.description || '',
      row.project || '',
      Number(row.quantity || 0).toFixed(2),
      Number(row.rate || 0).toFixed(4),
      Number(row.amount || 0).toFixed(2),
    ].join('||');
    if (!seen.has(key)) {
      seen.set(key, {
        ...row,
        quantity: Number(row.quantity || 0),
        rate: Number(row.rate || 0),
        amount: Number(row.amount || 0),
      });
      order.push(key);
    }
  }

  return order.map((key) => seen.get(key));
};

const computeTotals = ({ items, explicitSubtotal, taxRate }) => {
  const subtotal = Number.isFinite(Number(explicitSubtotal))
    ? Number(explicitSubtotal)
    : items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const vatAmount = subtotal * Number(taxRate || 0);
  const total = subtotal + vatAmount;
  return { subtotal, vatAmount, total };
};

const parseOptionalBoolean = (value, defaultValue = true) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'true') return true;
    if (lowered === 'false') return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return defaultValue;
};

const buildInvoicePayload = (body) => {
  const taxRateInput = body.vatRate ?? body.tax ?? 0;
  const taxRate = Number(taxRateInput) > 1 ? Number(taxRateInput) / 100 : Number(taxRateInput);

  return {
    ...body,
    invoiceNumber: body.invoiceNumber,
    includeSignature: parseOptionalBoolean(body.includeSignature ?? body.include_signature, true),
    includeStamp: parseOptionalBoolean(body.includeStamp ?? body.include_stamp, true),
    includeTemplate: parseOptionalBoolean(body.includeTemplate ?? body.include_template, true),
    clientName: body.clientName || body.client?.name || 'Unknown Client',
    company: body.company || body.companyId || body.clientCompanyId,
    tax: Number.isFinite(taxRate) ? taxRate : 0,
    source_timesheet_pdf: body.source_timesheet_pdf || body.timesheetPath || '',
  };
};

export const getNextInvoiceNumberPreview = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    const ownerId = req.user?.ownerId;
    // Must pass the SAME ownerId that createInvoice's generateInvoiceNumber
    // call uses (see below) - otherwise this reads a completely different
    // counter document (scoped to ownerId: null) than the one actual
    // invoice creation increments, and the preview can drift from reality
    // (e.g. always showing "INV-000001" even after real invoices exist).
    const invoiceNumber = await getNextInvoiceNumber(userId, ownerId);
    return res.json({ data: { invoiceNumber } });
  } catch (error) {
    return serverError(res, 'Failed to get next invoice number');
  }
};

// Exported so invoiceDraft.controller.js's approveInvoiceDraft can reuse the
// exact same renderer payload shape - the reviewed-draft flow renders
// through the same Node-side renderInvoicePdf as this file's own
// createInvoice, instead of a second, separately-maintained construction.
export const buildRendererPayload = ({ invoice, ownerCompany, clientCompany, items, totals, totalDeduction, includeSignature, includeStamp, includeTemplate = true }) => {
  const invoiceDate = invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date();
  // The invoice date is a calendar day, not a point in time - it is stored
  // UTC-anchored (see createInvoiceDraft's `new Date("YYYY-MM-DD")` parse,
  // which ECMA-262 treats as UTC midnight for date-only strings). Formatting
  // with toLocaleDateString/toLocaleString here would re-interpret that UTC
  // instant in the server process's local timezone, shifting the printed
  // day backwards or forwards depending on where the server runs. Reading
  // the UTC fields back out keeps the printed date identical to what was
  // selected, regardless of server timezone.
  const invoiceDateLabel = `${String(invoiceDate.getUTCDate()).padStart(2, '0')}/${String(invoiceDate.getUTCMonth() + 1).padStart(2, '0')}/${invoiceDate.getUTCFullYear()}`;
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const invoiceMonthYear = `${MONTH_NAMES[invoiceDate.getUTCMonth()]} ${invoiceDate.getUTCFullYear()}`;

  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoiceDateLabel,
    invoiceMonthYear,
    // owner company — shown in "Thanks and Regards" section
    company: {
      name: ownerCompany?.companyLegalName || ownerCompany?.name || '',
      trn: ownerCompany?.trn || '',
      address: ownerCompany?.address || '',
      city: ownerCompany?.city || '',
      country: ownerCompany?.nationality || '',
    },
    // client company — shown in "Bill To" block at the top
    client: {
      name: clientCompany?.name || '',
      address: clientCompany?.address || '',
      city: clientCompany?.city || '',
      trn: clientCompany?.trn || '',
      poBox: clientCompany?.poBox || '',
      phone: clientCompany?.telephoneNumber || clientCompany?.mobileNumber || '',
      fax: clientCompany?.faxNumber || '',
    },
    items,
    subtotal: totals.subtotal,
    vatRate: invoice.tax || 0,
    vatAmount: totals.vatAmount,
    total: totals.total,
    totalDeduction: Number(totalDeduction || 0),
    financials: totals.financials || {},
    // Template, signature, stamp come from the OWNER company. Template path
    // is only resolved when includeTemplate is on - leaving it unresolved
    // (rather than resolving it and having the renderer discard it) means
    // the background asset is never even read from disk when the toggle is
    // off, and renderInvoicePdf's existing "no template" branch (plain
    // white page) already does exactly the right thing with an empty path.
    templatePath: includeTemplate ? toAbsoluteStoragePath(ownerCompany?.invoiceTemplate || '') : '',
    signaturePath: toAbsoluteStoragePath(ownerCompany?.signature || ''),
    stampPath: toAbsoluteStoragePath(ownerCompany?.stamp || ''),
    includeSignature,
    includeStamp,
    templateConfig: ownerCompany?.invoiceTemplateConfig || {},
  };
};

const buildExtractedDraft = async (sourceTimesheetAbsolutePath) => {
  const extracted = await extractDocument({ pdfPath: sourceTimesheetAbsolutePath });
  const extractedData = extracted?.data?.data || extracted?.data || extracted || {};
  const runId = extracted?.run_id || extracted?.data?.run_id || extractedData?.run_id || null;
  const extractedFinancials = extractedData?.financials || {};
  const extractedTotals = extractedData?.totals || extractedData?.invoice_summary_totals || {};
  const invoiceSummary = extractedData?.invoice_summary || {};
  const strictRows =
    extractedData?.accepted_rows ||
    extractedData?.invoice_rows ||
    extractedData?.rows ||
    invoiceSummary.rows ||
    [];
  console.log('RAW AI ROWS', strictRows);
  const extractedRows = normalizeInvoiceRows(strictRows);
  const strictTotals = extractedData?.invoice_summary_totals || {};
  const rejectedRows = normalizeRejectedRows(
    extractedData?.rejected_rows || extractedData?.verification?.rejected_rows || []
  );
  const confidenceScores = extractedData?.metadata?.confidence_scores || extractedData?.verification?.confidence_scores || {};
  const attendanceRows = extractedData?.attendance_data || extractedData?.attendance?.rows || [];

  const subtotalFromRows = extractedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const vatRate = 0;
  const toNullableNumber = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const subtotal = toNullableNumber(extractedFinancials.subtotal)
    ?? toNullableNumber(extractedData.subtotal)
    ?? toNullableNumber(extractedTotals.subtotal)
    ?? toNullableNumber(strictTotals.subtotal)
    ?? subtotalFromRows;
  const adjustedSubtotal = toNullableNumber(extractedFinancials.adjusted_subtotal)
    ?? toNullableNumber(extractedTotals.adjusted_subtotal)
    ?? (subtotal - (toNullableNumber(extractedFinancials.total_deduction)
      ?? toNullableNumber(extractedTotals.total_deduction)
      ?? toNullableNumber(extractedData?.deductions)
      ?? toNullableNumber(extractedData?.deduction_detail?.total)
      ?? toNullableNumber(strictTotals.total_deduction)
      ?? 0));
  const vat = toNullableNumber(extractedFinancials.total_vat)
    ?? toNullableNumber(extractedData.vat)
    ?? toNullableNumber(extractedTotals.total_vat)
    ?? toNullableNumber(strictTotals.vat)
    ?? subtotal * vatRate;
  const totalDeduction = toNullableNumber(extractedFinancials.total_deduction)
    ?? toNullableNumber(extractedTotals.total_deduction)
    ?? toNullableNumber(extractedData?.deductions)
    ?? toNullableNumber(extractedData?.deduction_detail?.total)
    ?? toNullableNumber(strictTotals.total_deduction)
    ?? 0;
  const computedNetTotal = adjustedSubtotal + vat;
  const extractedNetTotal = toNullableNumber(extractedFinancials.net_payable)
    ?? toNullableNumber(extractedData.net_total)
    ?? toNullableNumber(extractedTotals.net_total)
    ?? toNullableNumber(strictTotals.net_total);
  const netTotal = Number.isFinite(extractedNetTotal)
    && Math.abs(extractedNetTotal - computedNetTotal) <= 0.01
    ? extractedNetTotal
    : computedNetTotal;
  const deductionVat = toNullableNumber(extractedFinancials.deduction_vat)
    ?? toNullableNumber(extractedTotals.deduction_vat)
    ?? 0;
  const deductionTotalWithVat = toNullableNumber(extractedFinancials.deduction_total_with_vat)
    ?? toNullableNumber(extractedTotals.deduction_total_with_vat)
    ?? (totalDeduction + deductionVat);
  const deductionBreakdown = extractedFinancials.deduction_breakdown
    || extractedTotals.deduction_breakdown
    || extractedData?.deduction_detail?.breakdown
    || {};

  return {
    run_id: runId,
    raw_rows: strictRows,
    raw_row_count: Array.isArray(strictRows) ? strictRows.length : 0,
    rows: extractedRows,
    accepted_rows: extractedRows,
    rejected_rows: rejectedRows,
    confidence_scores: confidenceScores,
    attendance_rows: attendanceRows,
    totals: {
      subtotal,
      adjusted_subtotal: adjustedSubtotal,
      vat,
      net_total: netTotal,
      total_deduction: totalDeduction,
      deduction_vat: deductionVat,
      deduction_total_with_vat: deductionTotalWithVat,
    },
    financials: {
      subtotal,
      adjusted_subtotal: adjustedSubtotal,
      total_vat: vat,
      total_deduction: totalDeduction,
      deduction_vat: deductionVat,
      deduction_total_with_vat: deductionTotalWithVat,
      net_payable: netTotal,
      deduction_source: extractedFinancials.deduction_source || '',
      summary_detected: Boolean(extractedFinancials.summary_detected || extractedTotals.summary_detected || totalDeduction > 0),
      deduction_breakdown: deductionBreakdown,
    },
    warnings: extractedData?.validation?.extraction_warnings || extractedData?.validation?.warnings || extracted?.validation?.extraction_warnings || extracted?.validation?.warnings || [],
    metadata: extractedData?.metadata || {},
  };
};

export const extractInvoiceDraft = async (req, res) => {
  try {
    const timesheetPath = req.body?.timesheetPath || req.body?.source_timesheet_pdf;
    if (!timesheetPath) {
      return res.status(400).json({ message: 'timesheetPath is required' });
    }

    // Require that the timesheetPath corresponds to an uploaded FileRecord
    const fr = await FileRecord.findOne({ path: timesheetPath });
    if (!fr) {
      return res.status(400).json({ message: 'timesheetPath is not an authorized file' });
    }

    const ctx = { userId: req.user?.userId, ownerId: req.user?.ownerId, companyId: req.user?.companyId };
    if (String(fr.ownerId) !== String(ctx.ownerId || ctx.userId) && String(fr.companyId) !== String(ctx.companyId)) {
      return res.status(403).json({ message: 'Access denied to requested file' });
    }

    const { driver: sourceDriver, key: sourceKey } = resolveStorageRef(fr);
    if (!(await objectExists({ key: sourceKey, driver: sourceDriver }))) {
      return res.status(400).json({ message: 'Source timesheet PDF not found' });
    }

    // The AI extraction microservice needs a real local filesystem path
    // (pdfplumber/OCR). On the r2 driver this downloads the object into a
    // disposable temp file first; on local it's a zero-copy no-op. Either
    // way the temp copy is always cleaned up, generated or not.
    const sourceFile = await downloadToTempFile({ key: sourceKey, driver: sourceDriver, filename: path.basename(timesheetPath) });
    let draft;
    try {
      draft = await buildExtractedDraft(sourceFile.path);
    } finally {
      await sourceFile.cleanup();
    }
    return res.json({
      message: 'Invoice draft extracted successfully',
      data: {
        source_timesheet_pdf: timesheetPath,
        rows: draft.rows,
        accepted_rows: draft.accepted_rows,
        rejected_rows: draft.rejected_rows,
        confidence_scores: draft.confidence_scores,
        attendance_rows: draft.attendance_rows,
        extraction_method: draft.metadata?.billing?.source || 'unknown',
        totals: draft.totals,
      },
      extraction_warnings: draft.warnings,
    });
  } catch (error) {
    return serverError(res, 'Failed to extract invoice draft');
  }
};

// Accepts a "YYYY-MM" value (same format the dashboard's shared
// MonthFilterSelect and the Attendance page's own filter both use) and
// returns the calendar-month date range to filter invoiceDate against.
const buildInvoiceMonthFilter = (monthQuery) => {
  if (!monthQuery) return {}
  const match = String(monthQuery).match(/^(\d{4})-(\d{2})$/);
  if (!match) return {};
  const [, yearStr, monthStr] = match;
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (monthIndex < 0 || monthIndex > 11) return {};
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { invoiceDate: { $gte: start, $lte: end } };
};

// Closure-pass finding: this endpoint had no .limit() at all - with no
// `month` query param (buildInvoiceMonthFilter returns {} for that case)
// it returned every invoice ever created for the owner in one response.
// Matches notification.controller.js's parsePagination convention (same
// default/cap shape); employee.controller.js's list endpoint uses a
// looser 200 cap for the same reason (dashboard callers request large
// limits like 1000 as a "give me effectively everything reasonable" best
// effort, not a guarantee) - 500 here sits between the two, invoices being
// typically fewer per owner than attendance rows but potentially more than
// employees.
const parseInvoicePagination = (req) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
  return { page, limit, skip: (page - 1) * limit };
};

export const getInvoices = async (req, res) => {
  try {
    const ownerId = req.user?.ownerId;
    if (!ownerId) return res.status(403).json({ message: 'User not authorized' });
    const monthFilter = buildInvoiceMonthFilter(req.query.month);
    const { page, limit, skip } = parseInvoicePagination(req);
    const query = { ownerId, ...monthFilter };
    // Cached (30s, ownerId-scoped, same employeeCachePrefix every other
    // mutation on this owner's data already invalidates - see
    // company.controller.js's identical convention) and .lean() - the
    // result is only ever mapped into a plain response object below, never
    // saved back or read for a virtual/instance method.
    const cacheKey = `${employeeCachePrefix(ownerId)}invoices:list:${page}:${limit}:${req.query.month || 'all'}`;
    const { items, total } = await cacheGetOrSet(cacheKey, 30, async () => {
      // No .populate('company') here on purpose - under real concurrent
      // load this was a second, sequential Mongo round-trip per request
      // (measured 900ms-1.8s under 100 concurrent VUs, vs sub-second
      // isolated), on top of Invoice.find() itself. `clientName` is
      // already stamped onto every Invoice at creation time from the same
      // company doc (see createInvoice/invoiceApproval.worker.js, both set
      // clientName = clientCompany.name), so the frontend's existing
      // `companyId?.name || clientName` fallback (TaxInvoiceList.jsx) reads
      // the same value without needing the populate at all.
      const [items, total] = await Promise.all([
        Invoice.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Invoice.countDocuments(query),
      ]);
      return { items, total };
    });
    const hasMore = skip + items.length < total;
    const data = items.map((inv) => {
      const obj = inv;
      const vatAmount = Math.max(0, Number(obj.vatAmount ?? obj.total_vat ?? obj.vat ?? 0));
      return {
        ...obj,
        // companyId stays the raw company ObjectId (unpopulated) - the
        // frontend only uses it when it's an object with a `.name`, and
        // otherwise falls back to `clientName`, so this is response-shape
        // compatible without the extra populate query.
        companyId: obj.company,
        pdfUrl: obj.generated_invoice_pdf || obj.pdfUrl || '',
        vatAmount,
      };
    });
    return res.json({
      message: 'Invoices retrieved',
      data,
      page,
      limit,
      total,
      hasMore,
      meta: { page, limit, total, hasMore },
    });
  } catch (error) {
    return serverError(res, 'Failed to fetch invoices');
  }
};

export const getInvoice = async (req, res) => {
  try {
    const ownerId = req.user?.ownerId;
    if (!ownerId) return res.status(403).json({ message: 'User not authorized' });
    // Same rationale as getInvoices above - clientName already carries the
    // company name from creation time, no populate needed.
    const invoice = await Invoice.findOne({ _id: req.params.id, ownerId }).lean();
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const data = invoice;
    data.companyId = data.company;
    data.pdfUrl = data.generated_invoice_pdf || data.pdfUrl || '';
    data.vatAmount = Math.max(0, Number(data.vatAmount ?? data.total_vat ?? data.vat ?? 0));
    return res.json({ data });
  } catch (error) {
    return serverError(res, 'Failed to fetch invoice');
  }
};

// Phase 4.3: review-token sign/verify. createInvoice is confirmed
// unreachable from the current frontend UI (GenerateTaxInvoice.jsx's
// handleGenerate is dead code - see Phase 4.2), but per the standing
// "do not remove defense-in-depth merely because a path is currently
// unreachable" principle, this endpoint must still not be bypassable via
// a direct, crafted API request. Previously, approvedExtraction was
// trusted purely as a client-supplied boolean - a request could fabricate
// {approvedExtraction: {...fake data...}} on the very first call and skip
// the review-required response entirely, with no server-side proof the
// data ever came from this server's own extraction.
const REVIEW_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes - long enough for a human to actually review, short enough to bound replay risk

const hashExtractionForToken = (extraction, ownerId) => {
  const stable = JSON.stringify({
    ownerId: String(ownerId || ''),
    accepted_rows: extraction?.accepted_rows || extraction?.rows || [],
    rejected_rows: extraction?.rejected_rows || [],
    confidence_scores: extraction?.confidence_scores || {},
  });
  return createHmac('sha256', env.JWT_SECRET).update(stable).digest('hex');
};

export const signReviewToken = (extraction, ownerId) => {
  const issuedAt = Date.now();
  const dataHash = hashExtractionForToken(extraction, ownerId);
  const signature = createHmac('sha256', env.JWT_SECRET)
    .update(`${dataHash}:${issuedAt}`)
    .digest('hex');
  return `${issuedAt}.${signature}`;
};

export const verifyReviewToken = (token, extraction, ownerId) => {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [issuedAtStr, signature] = token.split('.');
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > REVIEW_TOKEN_TTL_MS) return false;

  const dataHash = hashExtractionForToken(extraction, ownerId);
  const expectedSignature = createHmac('sha256', env.JWT_SECRET)
    .update(`${dataHash}:${issuedAt}`)
    .digest('hex');
  return signature === expectedSignature;
};

export const createInvoice = async (req, res) => {
  let sourceTimesheetTempFile = null;
  try {
    const payload = buildInvoicePayload(req.body);
    const userId = req.user?.userId || req.user?._id || req.user?.id;

    if (!payload.company) {
      return res.status(400).json({ message: 'company/companyId is required' });
    }

    // Always allocate invoice numbers server-side so the global counter advances
    // even when the UI sends a preview value. Pass ownerId for tenant scoping.
    const ownerId = req.user?.ownerId;
    payload.invoiceNumber = await generateInvoiceNumber(userId, ownerId);

    if (!ownerId) return res.status(403).json({ message: 'User not authorized' });

    const clientCompany = await Company.findOne({
      _id: payload.company,
      ownerId,
      $or: [
        { companyRole: 'client' },
        { companyRole: { $exists: false }, isOwner: { $ne: true } },
      ],
    });
    if (!clientCompany) {
      return res.status(400).json({ message: 'Client company not found for current user' });
    }

    // Owner company provides the template, signature, stamp and appears in the "Regards" section.
    // Priority: explicit owner flag -> user-linked owner company -> company with branding assets.
    let ownerCompany = await Company.findOne({
      ownerId,
      $or: [
        { companyRole: 'owner' },
        { isOwner: true },
      ],
    });
    if (!ownerCompany) {
      const ownerUser = await User.findById(userId).populate('company');
      ownerCompany = ownerUser?.company || null;
    }
    if (!ownerCompany) ownerCompany = clientCompany;

    if (!payload.clientName || payload.clientName === 'Unknown Client') {
      payload.clientName = clientCompany.name || payload.clientName;
    }

    const sourceTimesheetPath = payload.source_timesheet_pdf;
    let sourceTimesheetAbsolutePath = null;
    let sourceTimesheetTempFile = null;
    if (sourceTimesheetPath) {
      const frSource = await FileRecord.findOne({ path: sourceTimesheetPath });
      if (!frSource) return res.status(400).json({ message: 'source_timesheet_pdf is not an authorized file' });
      const ctx = { userId: req.user?.userId, ownerId: req.user?.ownerId, companyId: req.user?.companyId };
      if (String(frSource.ownerId) !== String(ctx.ownerId || ctx.userId) && String(frSource.companyId) !== String(ctx.companyId)) {
        return res.status(403).json({ message: 'Access denied to requested file' });
      }
      const { driver: sourceDriver, key: sourceKey } = resolveStorageRef(frSource);
      if (!(await objectExists({ key: sourceKey, driver: sourceDriver }))) {
        return res.status(400).json({ message: 'Source timesheet PDF does not exist' });
      }
      // Downloaded once (if r2) and reused for both extraction and the
      // AttendanceImport record below; cleaned up once we're fully done
      // with it further down in this handler.
      sourceTimesheetTempFile = await downloadToTempFile({
        key: sourceKey,
        driver: sourceDriver,
        filename: path.basename(sourceTimesheetPath),
      });
      sourceTimesheetAbsolutePath = sourceTimesheetTempFile.path;
    }

    let approvedRows = normalizeInvoiceRows(req.body?.approvedExtraction?.accepted_rows || req.body?.approvedExtraction?.rows || req.body?.items || []);
    const hasManualApprovedExtraction = Boolean(req.body?.approvedExtraction);
    let extractedWarnings = Array.isArray(req.body?.approvedExtraction?.extraction_warnings)
      ? req.body.approvedExtraction.extraction_warnings
      : [];
    let extractedRejectedRows = normalizeRejectedRows(req.body?.approvedExtraction?.rejected_rows || []);
    let confidenceScores = req.body?.approvedExtraction?.confidence_scores || {};
    let extractedAttendanceRows = req.body?.approvedExtraction?.attendance_rows || [];
    let extractionMethod = req.body?.approvedExtraction?.extraction_method || 'unknown';
    let extractedTotalDeduction = Number(req.body?.approvedExtraction?.totals?.total_deduction || 0);
    let extractedFinancials = req.body?.approvedExtraction?.financials || null;
    let generationRunId = req.body?.run_id || randomUUID();

    if (!approvedRows.length && sourceTimesheetAbsolutePath) {
      const draft = await buildExtractedDraft(sourceTimesheetAbsolutePath);
      generationRunId = draft.run_id || generationRunId;
      approvedRows = draft.rows;
      extractedWarnings = draft.warnings;
      extractedRejectedRows = draft.rejected_rows;
      confidenceScores = draft.confidence_scores;
      extractedAttendanceRows = draft.attendance_rows;
      extractionMethod = draft.metadata?.billing?.source || 'unknown';
      extractedTotalDeduction = draft.totals?.total_deduction || 0;
      extractedFinancials = draft.financials || null;
      req.body = {
        ...req.body,
        approvedExtraction: {
          ...(req.body?.approvedExtraction || {}),
          raw_rows: draft.raw_rows,
          raw_row_count: draft.raw_row_count,
        },
      };

      logEvent('extraction_complete', {
        run_id: generationRunId,
        source_pdf: payload.source_timesheet_pdf || sourceTimesheetAbsolutePath || '',
        rows: draft.rows.length,
        deduction_source: String(draft.financials?.deduction_source || ''),
        summary_table_detected: Boolean(draft.financials?.summary_detected),
        final_net: Number(draft.financials?.net_payable || 0),
      });
    }

    if (approvedRows.length && (!sourceTimesheetAbsolutePath || !extractedFinancials)) {
      logEvent('extraction_complete', {
        run_id: generationRunId,
        source_pdf: payload.source_timesheet_pdf || '',
        rows: approvedRows.length,
        deduction_source: String(extractedFinancials?.deduction_source || ''),
        summary_table_detected: Boolean(extractedFinancials?.summary_detected),
        final_net: Number(extractedFinancials?.net_payable || 0),
      });
    }

    // Phase 4.1: universal human review gate. Every extraction - regardless
    // of confidence or rejection rate - must be explicitly reviewed and
    // resubmitted (with approvedExtraction populated) before it can become
    // an invoice. Confidence/rejection-rate no longer decide WHETHER review
    // happens (that was the bug: AUTO_GENERATE and WARN previously fell
    // through to immediate invoice creation on the very first call, before
    // any human had seen the data) - they only decide what severity/warning
    // the reviewer sees. A genuinely non-reviewable case (zero rows
    // extracted at all - nothing for a human to review) remains a hard
    // failure via the existing 422 handler below this block, unchanged.
    if (approvedRows.length > 0 && Object.keys(confidenceScores).length > 0) {
      const validationResult = validateExtractionQuality({
        accepted_rows: approvedRows,
        rejected_rows: extractedRejectedRows,
        confidence_scores: confidenceScores,
      });

      const gatingAction = getGatingAction(validationResult);
      const submittedReviewToken = req.body?.approvedExtraction?.review_token;
      const tokenValid = hasManualApprovedExtraction
        && verifyReviewToken(submittedReviewToken, {
          accepted_rows: approvedRows,
          rejected_rows: extractedRejectedRows,
          confidence_scores: confidenceScores,
        }, ownerId);

      if (!tokenValid) {
        logEvent('validation_failed', {
          run_id: generationRunId,
          reason: hasManualApprovedExtraction ? 'invalid_review_token' : 'review_required',
          action: gatingAction.action,
          avg_confidence: validationResult.avgConfidence,
          rejection_rate: validationResult.rejectionRate,
        });
        return res.status(409).json({
          message: hasManualApprovedExtraction
            ? 'This review approval could not be verified. Please re-review the extraction and try again.'
            : 'Extraction completed. Human review is required before this invoice can be generated.',
          requiresManualApproval: true,
          reviewToken: signReviewToken({
            accepted_rows: approvedRows,
            rejected_rows: extractedRejectedRows,
            confidence_scores: confidenceScores,
          }, ownerId),
          validationResult,
          gatingAction,
          verification: {
            accepted_rows: approvedRows,
            rejected_rows: extractedRejectedRows,
            confidence_scores: confidenceScores,
            extraction_warnings: extractedWarnings,
          },
        });
      }

      // Second call, with a verified review token proving this exact data
      // genuinely came from this server's own extraction - confidence/
      // rejection-rate warnings are still surfaced on the generated
      // invoice's record, but no longer block generation.
      if (gatingAction.details?.length) {
        extractedWarnings.push(...gatingAction.details);
      }
    }

    if (!approvedRows.length) {
      return res.status(422).json({
        message: 'No valid billing summary rows were extracted from the timesheet PDF',
        extractionWarnings: extractedWarnings,
      });
    }

    approvedRows = groupInvoiceRowsForRenderer(approvedRows);
    const extractedRows = Array.isArray(req.body?.approvedExtraction?.raw_rows)
      ? req.body.approvedExtraction.raw_rows
      : approvedRows;
    const rendererRows = approvedRows;
    const rowsWereGrouped = rendererRows.length !== extractedRows.length;

    console.log('ROWS BEFORE RENDER', rendererRows);
    if (rowsWereGrouped) {
      logEvent('row_grouping_applied', {
        run_id: generationRunId,
        source_pdf: payload.source_timesheet_pdf || sourceTimesheetAbsolutePath || '',
        extracted_count: extractedRows.length,
        renderer_count: rendererRows.length,
      });
    }

    const taxRate = Number(payload.tax || 0);
    const selectedSubtotal = Number(rendererRows.reduce((sum, row) => sum + Number(row.amount || 0), 0).toFixed(2));
    const selectedDeduction = Number(
      extractedFinancials?.total_deduction
      ?? req.body?.approvedExtraction?.totals?.total_deduction
      ?? req.body?.deductions
      ?? req.body?.deduction_detail?.total
      ?? 0
    );
    const selectedVatSource = extractedFinancials?.total_vat
      ?? extractedFinancials?.vat
      ?? req.body?.approvedExtraction?.totals?.vat;
    const selectedVat = Number(selectedVatSource) > 0
      ? Math.max(0, Number(selectedVatSource) || 0)
      : Math.max(0, Number((selectedSubtotal * taxRate).toFixed(2)) || 0);
    const selectedAdjustedSubtotal = Math.max(0, selectedSubtotal - selectedDeduction);
    const selectedComputedNet = Number((selectedAdjustedSubtotal + selectedVat).toFixed(2));
    const extractedNetTotal = Number(
      extractedFinancials?.net_payable
      ?? extractedFinancials?.net_total
      ?? req.body?.approvedExtraction?.totals?.net_total
      ?? 0
    );
    const selectedNetTotal = Number.isFinite(extractedNetTotal) && Math.abs(extractedNetTotal - selectedComputedNet) <= 0.01
      ? extractedNetTotal
      : selectedComputedNet;
    const totals = extractedFinancials
      ? {
          // Previously this was `selectedSubtotal` (the gross, PRE-deduction
          // line-item sum), while `total` below is computed from
          // `selectedAdjustedSubtotal` (POST-deduction). That meant the
          // saved/displayed subtotal + vat never actually added up to the
          // saved/displayed net amount anywhere a person could see it (the
          // invoice list, invoice detail view, etc.) - only the PDF's
          // internal "TOTAL" row line happened to use the right number
          // internally. Using the adjusted (post-deduction) subtotal here
          // makes subtotal + vat = net true everywhere, matching the
          // renderer's own consistency assertion below.
          subtotal: selectedAdjustedSubtotal,
          vatAmount: selectedVat,
          total: selectedNetTotal,
          financials: {
            ...(extractedFinancials || {}),
            subtotal: selectedSubtotal,
            adjusted_subtotal: selectedAdjustedSubtotal,
            total_vat: selectedVat,
            net_payable: selectedNetTotal,
          },
        }
      : computeTotals({
          items: rendererRows,
          explicitSubtotal: selectedSubtotal,
          taxRate,
        });

    const draftInvoice = await Invoice.create({
      ...payload,
      createdBy: userId,
      ownerId: ownerId,
      items: approvedRows.map((row) => ({
        description: row.description,
        quantity: row.quantity,
        rate: row.rate,
        amount: row.amount,
      })),
      subtotal: totals.subtotal,
      vatAmount: totals.vatAmount,
      total: totals.total,
      source_timesheet_pdf: payload.source_timesheet_pdf || '',
      generated_invoice_pdf: '',
      pdfUrl: '',
      extraction_confidence_scores: confidenceScores,
      extraction_warnings: extractedWarnings,
      rejected_rows: extractedRejectedRows,
    });
    // getFinanceSummary aggregates Invoice.total/vatAmount and caches under
    // employeeCachePrefix (same prefix getDashboardSummary uses) - without
    // this, a newly created invoice wouldn't show up in Finance totals/
    // trend/companies until the finance-summary cache's own TTL expired.
    await cacheInvalidate(employeeCachePrefix(ownerId));
    const outputAbsolutePath = await reserveTempFilePath(`${draftInvoice.invoiceNumber}.pdf`);
    const finalizedFinancials = Object.freeze({ ...(totals.financials || {}) });
    const rendererPayload = buildRendererPayload({
      invoice: draftInvoice,
      ownerCompany,
      clientCompany,
      items: approvedRows,
      totals: {
        ...totals,
        financials: finalizedFinancials,
      },
      totalDeduction: extractedTotalDeduction || 0,
      includeSignature: payload.includeSignature,
      includeStamp: payload.includeStamp,
      includeTemplate: payload.includeTemplate,
    });

    try {
      const beforeSnapshot = financialSnapshot(rendererPayload.financials);
      logEvent('financial_state', {
        stage: 'before_renderer',
        run_id: generationRunId,
        source_pdf: payload.source_timesheet_pdf || sourceTimesheetAbsolutePath || '',
        invoice_number: draftInvoice.invoiceNumber,
        renderer_mode: 'display_only',
        subtotal: Number(rendererPayload.financials?.subtotal || totals.subtotal || 0),
        deduction: Number(rendererPayload.financials?.total_deduction || extractedTotalDeduction || 0),
        deduction_vat: Number(rendererPayload.financials?.deduction_vat || 0),
        adjusted_subtotal: Number(rendererPayload.financials?.adjusted_subtotal || 0),
        vat: Number(rendererPayload.financials?.total_vat || totals.vatAmount || 0),
        net_total: Number(rendererPayload.financials?.net_payable || totals.total || 0),
        deduction_source: String(rendererPayload.financials?.deduction_source || ''),
        summary_table_detected: Boolean(rendererPayload.financials?.summary_detected),
      });
      await renderInvoicePdf({
        ...rendererPayload,
        outputPath: outputAbsolutePath,
      });
      const afterSnapshot = financialSnapshot(rendererPayload.financials);
      if (JSON.stringify(beforeSnapshot) !== JSON.stringify(afterSnapshot)) {
        logEvent('validation_failed', {
          run_id: generationRunId,
          invoice_number: draftInvoice.invoiceNumber,
          reason: 'financial_immutability_violation',
          before: beforeSnapshot,
          after: afterSnapshot,
        });
        console.error(JSON.stringify({
          event: 'financial_immutability_error',
          run_id: generationRunId,
          invoice_number: draftInvoice.invoiceNumber,
          before: beforeSnapshot,
          after: afterSnapshot,
        }));
      }
      logEvent('renderer_complete', {
        run_id: generationRunId,
        source_pdf: payload.source_timesheet_pdf || sourceTimesheetAbsolutePath || '',
        invoice_number: draftInvoice.invoiceNumber,
        deduction_source: String(rendererPayload.financials?.deduction_source || ''),
        summary_table_detected: Boolean(rendererPayload.financials?.summary_detected),
        renderer_mode: 'display_only',
        final_net: Number(rendererPayload.financials?.net_payable || totals.total || 0),
      });
    } catch (pdfError) {
      logEvent('validation_failed', {
        run_id: generationRunId,
        invoice_number: draftInvoice.invoiceNumber,
        reason: 'renderer_error',
        message: pdfError.message,
      });
      throw pdfError;
    }

    // renderInvoicePdf always writes to a local working path first (pdf-lib
    // needs a real filesystem path). saveLocalFile() pushes that into
    // storage.service.js (R2 or the local storage tree, depending on
    // STORAGE_DRIVER) and returns the path to persist on the Invoice
    // document either way; the temp working file is then discarded.
    const savedInvoicePdf = await saveLocalFile({
      absolutePath: outputAbsolutePath,
      companyId: req.user?.companyId || null,
      ownerId,
      folder: 'invoices',
      filename: `${draftInvoice.invoiceNumber}.pdf`,
    });
    await cleanupTempFile(outputAbsolutePath);
    const generatedWebPath = savedInvoicePdf.path;
    draftInvoice.generated_invoice_pdf = generatedWebPath;
    draftInvoice.pdfUrl = generatedWebPath;
    await draftInvoice.save();

    logEvent('invoice_generated', {
      run_id: generationRunId,
      source_pdf: payload.source_timesheet_pdf || sourceTimesheetAbsolutePath || '',
      invoice_number: draftInvoice.invoiceNumber,
      deduction_source: String(rendererPayload.financials?.deduction_source || ''),
      summary_table_detected: Boolean(rendererPayload.financials?.summary_detected),
      renderer_mode: 'display_only',
      final_net: Number(rendererPayload.financials?.net_payable || totals.total || 0),
    });

    if (sourceTimesheetAbsolutePath) {
      await AttendanceImport.create({
        company: payload.company,
        invoice: draftInvoice._id,
        source_timesheet_pdf: payload.source_timesheet_pdf || sourceTimesheetPath,
        extraction_method: extractionMethod,
        confidence_scores: confidenceScores,
        attendance_rows: extractedAttendanceRows,
        extraction_warnings: extractedWarnings,
      });
    }
    if (sourceTimesheetTempFile) {
      await sourceTimesheetTempFile.cleanup();
      sourceTimesheetTempFile = null;
    }

    const responseData = draftInvoice.toObject();
    responseData.vatAmount = Math.max(0, Number((responseData.vatAmount ?? totals.vatAmount) || 0));
    return res.status(201).json({
      message: 'Invoice created successfully',
      data: {
        ...responseData,
        pdfUrl: generatedWebPath,
        vatAmount: responseData.vatAmount,
        verification: {
          accepted_rows: approvedRows,
          rejected_rows: extractedRejectedRows,
          confidence_scores: confidenceScores,
          extraction_warnings: extractedWarnings,
        },
      },
      invoice: {
        ...responseData,
        pdfUrl: generatedWebPath,
        vatAmount: responseData.vatAmount,
      },
      extractionWarnings: extractedWarnings,
    });
  } catch (error) {
    if (sourceTimesheetTempFile) {
      await sourceTimesheetTempFile.cleanup().catch(() => {});
    }
    logEvent('validation_failed', {
      run_id: req.body?.run_id || '',
      reason: 'create_invoice_error',
      message: error.message,
    });
    return serverError(res, 'Failed to create invoice');
  }
};

export const generateInvoiceRecord = async (req, res) => {
  return createInvoice(req, res);
};

export const updateInvoice = async (req, res) => {
  // Invoices are immutable once created - the entire review-gate
  // architecture (InvoiceDraft's ready/approved state machine, atomic
  // approval claims, review tokens) exists specifically so that editing
  // happens pre-approval on a draft, never after a real Invoice exists.
  // This endpoint previously accepted req.body unfiltered as the update
  // document, meaning any client-supplied field - including status,
  // ownerId, approvedBy, invoiceNumber, or financial totals - would be
  // applied directly, bypassing that entire invariant through a
  // completely separate, unreviewed path. Confirmed dead from the
  // current frontend (see api/invoices.js), but the route remains
  // registered and reachable by any authenticated user - reject outright
  // rather than narrow to an "allowed fields" list, since no field on an
  // already-created invoice should be client-editable through this path.
  return res.status(403).json({
    message: 'Invoices cannot be edited after creation. Edit the invoice draft before approval instead.',
  });
};

export const deleteInvoice = async (req, res) => {
  try {
    const ownerId = req.user?.ownerId;
    if (!ownerId) return res.status(403).json({ message: 'User not authorized' });
    const deleted = await Invoice.findOneAndDelete({ _id: req.params.id, ownerId });
    if (!deleted) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    await cacheInvalidate(employeeCachePrefix(ownerId));
    return res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    return serverError(res, 'Failed to delete invoice');
  }
};

export const downloadInvoice = async (req, res) => {
  try {
    const ownerId = req.user?.ownerId;
    if (!ownerId) return res.status(403).json({ message: 'User not authorized' });
    const invoice = await Invoice.findOne({ _id: req.params.id, ownerId });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const generatedPath = invoice.generated_invoice_pdf || invoice.pdfUrl;
    if (!generatedPath) return res.status(404).json({ message: 'Generated invoice PDF not found' });

    // Try to locate a tracked FileRecord first. If none exists, fall back to resolving
    // the path/key directly (useful for seeded or legacy records where FileRecord
    // wasn't created). Prefer tenant checks using invoice.ownerId.
    const fileRec = await FileRecord.findOne({ path: generatedPath });
    const requesterOwner = req.user?.ownerId || req.user?.userId;
    let storageRef = null;

    if (fileRec) {
      if (String(fileRec.ownerId) !== String(requesterOwner) && String(fileRec.companyId) !== String(req.user?.companyId)) {
        return res.status(403).json({ message: 'Access denied to invoice PDF' });
      }
      storageRef = resolveStorageRef(fileRec);
    } else {
      // No FileRecord — resolve the stored path/key directly and allow serve
      // if the object exists and the invoice owner matches the request owner.
      if (String(invoice.ownerId) !== String(requesterOwner)) {
        return res.status(403).json({ message: 'Access denied to invoice PDF' });
      }
      storageRef = resolveStorageRef(generatedPath);
    }

    if (!storageRef?.key || !(await objectExists(storageRef))) {
      return res.status(404).json({ message: 'Generated invoice PDF not found in storage' });
    }

    const inline = req.query.inline === '1' || req.query.inline === 'true';
    const disposition = `${inline ? 'inline' : 'attachment'}; filename="invoice-${invoice.invoiceNumber}.pdf"`;

    // Audit
    try {
      const auditCompanyId = fileRec?.companyId || invoice.company || req.user?.companyId || null;
      await AuditLog.create({
        user: req.user?.userId,
        ownerId: requesterOwner,
        action: 'DOWNLOAD_INVOICE_PDF',
        entity: 'Invoice',
        entityId: invoice._id,
        company: auditCompanyId,
        changes: fileRec ? { fileId: fileRec._id, path: fileRec.path } : { path: generatedPath },
      });
    } catch (e) {
      console.error('Failed to write audit log for invoice download', e.message);
    }

    await streamObject({
      ...storageRef,
      res,
      contentType: 'application/pdf',
      disposition,
    });
  } catch (error) {
    if (!res.headersSent) {
      return serverError(res, 'Failed to download invoice');
    }
    res.end();
  }
};