import { Invoice } from '../models/Invoice.js';
import Company from '../models/Company.js';
import User from '../models/User.js';
import AttendanceImport from '../models/AttendanceImport.js';
import { extractDocument } from '../services/extraction.service.js';
import { renderInvoicePdf } from '../services/invoiceRenderer.service.js';
import { validateExtractionQuality, getGatingAction } from '../services/confidenceGating.service.js';
import { generateInvoiceNumber, getNextInvoiceNumber } from '../services/invoiceNumber.service.js';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');
const storageRoot = path.join(backendRoot, 'src', 'storage');
const uploadsRoot = path.join(storageRoot, 'uploads');

const folderMap = {
  timesheets: path.join(uploadsRoot, 'timesheets'),
  invoices: path.join(uploadsRoot, 'invoices'),
  templates: path.join(uploadsRoot, 'templates'),
  signatures: path.join(uploadsRoot, 'signatures'),
  stamps: path.join(uploadsRoot, 'stamps'),
};

for (const dirPath of Object.values(folderMap)) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

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

const toWebStoragePath = (absolutePath) => {
  if (!absolutePath) return '';
  const rel = path.relative(storageRoot, absolutePath).replace(/\\/g, '/');
  return `/${rel}`;
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

const normalizeInvoiceRows = (rows = []) => {
  return rows
    .map((row) => {
      const quantity = Number(row.quantity ?? row.qty ?? row.hours ?? row.total_hours ?? 0) || 0;
      const rate = Number(row.rate ?? row.unit_price ?? 0) || 0;
      const amount = Number(row.amount ?? row.total ?? 0) || 0;
      const description = String(row.description || row.trade || row.service || row.name || '').trim();
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
      const project = String(row.project || row.project_no || row.project_id || '').trim() || identifier;

      return {
        description,
        quantity,
        rate,
        amount,
        project,
        identifier,
      };
    });
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
    clientName: body.clientName || body.client?.name || 'Unknown Client',
    company: body.company || body.companyId || body.clientCompanyId,
    tax: Number.isFinite(taxRate) ? taxRate : 0,
    source_timesheet_pdf: body.source_timesheet_pdf || body.timesheetPath || '',
  };
};

export const getNextInvoiceNumberPreview = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    const invoiceNumber = await getNextInvoiceNumber(userId);
    return res.json({ data: { invoiceNumber } });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to get next invoice number', error: error.message });
  }
};

const buildRendererPayload = ({ invoice, ownerCompany, clientCompany, items, totals, totalDeduction, includeSignature, includeStamp }) => {
  const invoiceDate = invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date();
  const invoiceDateLabel = invoiceDate.toLocaleDateString('en-GB');
  const invoiceMonthYear = invoiceDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoiceDateLabel,
    invoiceMonthYear,
    // owner company — shown in "Thanks and Regards" section
    company: {
      name: ownerCompany?.companyLegalName || ownerCompany?.name || '',
      trn: ownerCompany?.trn || '',
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
    // Template, signature, stamp come from the OWNER company
    templatePath: toAbsoluteStoragePath(ownerCompany?.invoiceTemplate || ''),
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

  const subtotal = toNullableNumber(extractedFinancials.subtotal) ?? toNullableNumber(strictTotals.subtotal) ?? subtotalFromRows;
  const adjustedSubtotal = toNullableNumber(extractedFinancials.adjusted_subtotal) ?? subtotal;
  const vat = toNullableNumber(extractedFinancials.total_vat) ?? toNullableNumber(strictTotals.vat) ?? subtotal * vatRate;
  const netTotal = toNullableNumber(extractedFinancials.net_payable) ?? toNullableNumber(strictTotals.net_total) ?? (subtotal + vat);
  const totalDeduction = toNullableNumber(extractedFinancials.total_deduction) ?? toNullableNumber(strictTotals.total_deduction) ?? 0;
  const deductionVat = toNullableNumber(extractedFinancials.deduction_vat) ?? 0;
  const deductionTotalWithVat = toNullableNumber(extractedFinancials.deduction_total_with_vat) ?? (totalDeduction + deductionVat);

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
      summary_detected: Boolean(extractedFinancials.summary_detected),
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

    const sourcePath = toAbsoluteStoragePath(timesheetPath);
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return res.status(400).json({ message: 'Source timesheet PDF not found' });
    }

    const draft = await buildExtractedDraft(sourcePath);
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
    return res.status(500).json({ message: 'Failed to extract invoice draft', error: error.message });
  }
};

export const getInvoices = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    const items = await Invoice.find({ createdBy: userId }).sort({ createdAt: -1 });
    const data = items.map((inv) => {
      const obj = inv.toObject ? inv.toObject() : inv;
      const subtotal = Number(obj.subtotal || 0);
      const total = Number(obj.total || 0);
      const vatAmount = total - subtotal;
      return {
        ...obj,
        pdfUrl: obj.generated_invoice_pdf || obj.pdfUrl || '',
        vatAmount,
      };
    });
    return res.json({
      message: 'Invoices retrieved',
      data,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch invoices', error: error.message });
  }
};

export const getInvoice = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    const invoice = await Invoice.findOne({ _id: req.params.id, createdBy: userId });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const data = invoice.toObject();
    data.pdfUrl = data.generated_invoice_pdf || data.pdfUrl || '';
    return res.json({ data });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch invoice', error: error.message });
  }
};

export const createInvoice = async (req, res) => {
  try {
    const payload = buildInvoicePayload(req.body);
    const userId = req.user?.userId || req.user?._id || req.user?.id;

    if (!payload.company) {
      return res.status(400).json({ message: 'company/companyId is required' });
    }

    // Always allocate invoice numbers server-side so the global counter advances
    // even when the UI sends a preview value.
    payload.invoiceNumber = await generateInvoiceNumber(userId);

    const clientCompany = await Company.findOne({
      _id: payload.company,
      owner: userId,
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
      owner: userId,
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

    const sourceTimesheetAbsolutePath = payload.source_timesheet_pdf
      ? toAbsoluteStoragePath(payload.source_timesheet_pdf)
      : null;

    if (payload.source_timesheet_pdf && (!sourceTimesheetAbsolutePath || !fs.existsSync(sourceTimesheetAbsolutePath))) {
      return res.status(400).json({ message: 'Source timesheet PDF does not exist' });
    }

    let approvedRows = normalizeInvoiceRows(
      req.body?.approvedExtraction?.accepted_rows || req.body?.approvedExtraction?.rows || req.body?.items || []
    );
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

    // Apply production confidence gating to all invoices (extracted OR approved)
    if (approvedRows.length > 0 && Object.keys(confidenceScores).length > 0) {
      const validationResult = validateExtractionQuality({
        accepted_rows: approvedRows,
        rejected_rows: extractedRejectedRows,
        confidence_scores: confidenceScores,
      });

      const gatingAction = getGatingAction(validationResult);

      // Block automatic generation if confidence is critically low
      if (gatingAction.action === 'BLOCK') {
        logEvent('validation_failed', {
          run_id: generationRunId,
          reason: 'confidence_block',
          action: gatingAction.action,
          avg_confidence: validationResult.avgConfidence,
          rejection_rate: validationResult.rejectionRate,
        });
        return res.status(409).json({
          message: 'Invoice generation blocked: extraction quality below minimum threshold',
          requiresManualApproval: true,
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

      // Require explicit approval if confidence is below recommended threshold
      if (gatingAction.action === 'REQUIRE_APPROVAL' && !hasManualApprovedExtraction) {
        logEvent('validation_failed', {
          run_id: generationRunId,
          reason: 'manual_approval_required',
          action: gatingAction.action,
          avg_confidence: validationResult.avgConfidence,
          rejection_rate: validationResult.rejectionRate,
        });
        return res.status(409).json({
          message: 'Manual approval required: extraction confidence below recommended threshold',
          requiresManualApproval: true,
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

      // Warn but allow if minor concerns
      if (gatingAction.action === 'WARN') {
        extractedWarnings.push(...gatingAction.details);
      }
    }

    if (!approvedRows.length) {
      return res.status(422).json({
        message: 'No valid billing summary rows were extracted from the timesheet PDF',
        extractionWarnings: extractedWarnings,
      });
    }

    const extractedRows = Array.isArray(req.body?.approvedExtraction?.raw_rows)
      ? req.body.approvedExtraction.raw_rows
      : approvedRows;
    const rendererRows = approvedRows;

    console.log('ROWS BEFORE RENDER', rendererRows);
    if (rendererRows.length !== extractedRows.length) {
      console.error('ROW LOSS DETECTED');
      console.error(JSON.stringify({
        run_id: generationRunId,
        source_pdf: payload.source_timesheet_pdf || sourceTimesheetAbsolutePath || '',
        extracted_count: extractedRows.length,
        renderer_count: rendererRows.length,
        extracted_rows: extractedRows,
        renderer_rows: rendererRows,
      }));
    }

    const taxRate = payload.tax || 0;
    const totals = extractedFinancials
      ? {
          subtotal: Number(extractedFinancials.subtotal || 0),
          vatAmount: Number(extractedFinancials.total_vat || 0),
          total: Number(extractedFinancials.net_payable || 0),
          financials: extractedFinancials,
        }
      : computeTotals({
          items: approvedRows,
          explicitSubtotal: req.body?.approvedExtraction?.totals?.subtotal ?? req.body?.subtotal,
          taxRate,
        });

    const draftInvoice = await Invoice.create({
      ...payload,
      createdBy: userId,
      items: approvedRows.map((row) => ({
        description: row.description,
        quantity: row.quantity,
        rate: row.rate,
        amount: row.amount,
      })),
      subtotal: totals.subtotal,
      total: totals.total,
      source_timesheet_pdf: payload.source_timesheet_pdf || '',
      generated_invoice_pdf: '',
      pdfUrl: '',
      extraction_confidence_scores: confidenceScores,
      extraction_warnings: extractedWarnings,
      rejected_rows: extractedRejectedRows,
    });
    const outputAbsolutePath = path.join(folderMap.invoices, `${draftInvoice.invoiceNumber}.pdf`);
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

    const generatedWebPath = toWebStoragePath(outputAbsolutePath);
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
        source_timesheet_pdf: payload.source_timesheet_pdf || sourceTimesheetAbsolutePath,
        extraction_method: extractionMethod,
        confidence_scores: confidenceScores,
        attendance_rows: extractedAttendanceRows,
        extraction_warnings: extractedWarnings,
      });
    }

    const responseData = draftInvoice.toObject();
    return res.status(201).json({
      message: 'Invoice created successfully',
      data: {
        ...responseData,
        pdfUrl: generatedWebPath,
        vatAmount: totals.vatAmount,
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
        vatAmount: totals.vatAmount,
      },
      extractionWarnings: extractedWarnings,
    });
  } catch (error) {
    logEvent('validation_failed', {
      run_id: req.body?.run_id || '',
      reason: 'create_invoice_error',
      message: error.message,
    });
    return res.status(500).json({ message: 'Failed to create invoice', error: error.message });
  }
};

export const generateInvoiceRecord = async (req, res) => {
  return createInvoice(req, res);
};

export const updateInvoice = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    const updated = await Invoice.findOneAndUpdate(
      { _id: req.params.id, createdBy: userId },
      req.body,
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    return res.json({ message: 'Invoice updated', data: updated });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update invoice', error: error.message });
  }
};

export const deleteInvoice = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    const deleted = await Invoice.findOneAndDelete({ _id: req.params.id, createdBy: userId });
    if (!deleted) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    return res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete invoice', error: error.message });
  }
};

export const downloadInvoice = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    const invoice = await Invoice.findOne({ _id: req.params.id, createdBy: userId });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const generatedPath = invoice.generated_invoice_pdf || invoice.pdfUrl;
    const absoluteGeneratedPath = toAbsoluteStoragePath(generatedPath);

    if (!generatedPath || !absoluteGeneratedPath || !fs.existsSync(absoluteGeneratedPath)) {
      return res.status(404).json({ message: 'Generated invoice PDF not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');

    const inline = req.query.inline === '1' || req.query.inline === 'true';
    if (inline) {
      res.setHeader('Content-Disposition', `inline; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    }

    const pdfData = fs.readFileSync(absoluteGeneratedPath);
    return res.send(pdfData);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to download invoice', error: error.message });
  }
};
