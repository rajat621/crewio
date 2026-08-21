import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import env from '../config/env.js';

/**
 * Thin transport layer to the AI service draft endpoints.
 *
 * Nothing in this file computes an invoice total. Every number the backend
 * persists comes back from the AI service, which owns the arithmetic
 * (ai-services/invoice_draft.py). If you find yourself wanting to sum a
 * column here, call recomputeDraft instead.
 */

const requestedTimeoutMs = Number(env.AI_SERVICE_TIMEOUT_MS || 0);
const effectiveTimeoutMs = Number.isFinite(requestedTimeoutMs)
  ? Math.max(requestedTimeoutMs, 90000)
  : 90000;

const aiClient = axios.create({
  baseURL: env.AI_SERVICE_URL,
  timeout: effectiveTimeoutMs,
  headers: env.AI_SERVICE_SHARED_SECRET
    ? { 'X-Internal-Service-Key': env.AI_SERVICE_SHARED_SECRET }
    : {},
});

const wrapError = (error) => {
  const message =
    error.response?.data?.error ||
    error.response?.data?.message ||
    error.message;
  const wrapped = new Error(`AI service request failed: ${message}`);
  wrapped.status = error.response?.status || 500;
  wrapped.details = error.response?.data;
  return wrapped;
};

const postToAi = async (path, payload) => {
  try {
    const response = await aiClient.post(path, payload);
    return response.data;
  } catch (error) {
    throw wrapError(error);
  }
};

/**
 * In production the AI service is a separate deployed service with its own
 * filesystem/container (see extraction.service.js's postFileToAi, which
 * already solved this exact problem for the older /v2/extract flow) - a
 * path like /tmp/xyz.pdf that's real on THIS backend's container does not
 * exist on the AI service's container, so sending it as JSON `pdf_path`
 * fails there with "pdf_path does not exist" the moment the two run as
 * separate services, even though it works by coincidence in local dev
 * where both processes share one filesystem. /v2/invoice/draft already
 * supports multipart file upload as an alternative to `pdf_path` (see
 * main.py) - this streams the actual bytes instead of a path that only
 * means something on this side.
 */
const postFileToAi = async (path, filePath, fields = {}) => {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
  }

  try {
    const response = await aiClient.post(path, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return response.data;
  } catch (error) {
    throw wrapError(error);
  }
};

/**
 * Extract and return an editable draft. Renders no PDF.
 *
 * Streams the local temp file (already downloaded from R2/storage by
 * runExtraction) as multipart form data - see postFileToAi's comment for
 * why this can't be a JSON pdf_path in production.
 */
export const buildDraft = async ({ pdfPath, vatRate }) =>
  postFileToAi('/v2/invoice/draft', pdfPath, {
    // Explicit override from the wizard's own VAT field - when present the
    // AI service uses this instead of whatever it can infer from the
    // document (or its own 5% fallback).
    vat_rate: vatRate,
  });

/** Recalculate a draft server-side. Called on every autosave. */
export const recomputeDraft = async ({ draft }) =>
  postToAi('/v2/invoice/recompute', { draft });

/**
 * Render the approved draft to PDF via the AI service.
 *
 * NOT currently called by invoiceDraft.controller.js's approveInvoiceDraft -
 * that now renders through Node's own renderInvoicePdf (invoiceRenderer.
 * service.js), the same pipeline invoice.controller.js's createInvoice
 * already used, so approved invoices get real client/owner company details,
 * templates, signatures and stamps instead of a blank profile. Left here in
 * case a Flask-rendered path is ever wanted again (e.g. a template the Node
 * renderer doesn't support) - main.py's /v2/invoice/render still works if
 * called.
 */
export const renderApprovedDraft = async ({
  draft,
  companyData = {},
  templatePath,
  signaturePath,
  stampPath,
  includeSignature = true,
  includeStamp = true,
  sourcePdfPath,
}) =>
  postToAi('/v2/invoice/render', {
    draft,
    company_data: companyData,
    template_path: templatePath,
    signature_path: signaturePath,
    stamp_path: stampPath,
    include_signature: includeSignature,
    include_stamp: includeStamp,
    source_pdf_path: sourcePdfPath,
  });

/**
 * Fetch the bytes of a PDF the AI service rendered via renderApprovedDraft.
 * Also unused for the same reason - kept alongside it. (Originally: pulls
 * the bytes of a generated PDF over HTTP from main.py's
 * /download-invoice/<filename> route, since the raw invoice_path is a
 * filesystem path inside the AI service's own process that Node can't
 * read directly.)
 */
export const fetchGeneratedPdfBuffer = async (invoicePath) => {
  const filename = String(invoicePath || '').split(/[\\/]/).pop();
  if (!filename) {
    throw new Error('AI service did not return a usable invoice_path');
  }
  try {
    const response = await aiClient.get(`/download-invoice/${encodeURIComponent(filename)}`, {
      responseType: 'arraybuffer',
    });
    return { buffer: Buffer.from(response.data), filename };
  } catch (error) {
    const wrapped = new Error(`Failed to download generated invoice PDF: ${error.message}`);
    wrapped.status = error.response?.status || 500;
    throw wrapped;
  }
};

/**
 * Pull the denormalised summary fields out of a draft payload for list views.
 * Reads values the AI service already computed - does not derive new ones.
 */
export const summariseDraft = (payload) => {
  const totals = payload?.totals || {};
  return {
    totals: {
      subtotal: totals.subtotal ?? 0,
      deductions: totals.deductions ?? 0,
      vat: totals.vat ?? 0,
      netTotal: totals.net_total ?? 0,
      lineCount: totals.line_count ?? 0,
    },
    extractionConfidence: payload?.source?.confidence ?? 0,
    extractionSource: payload?.source?.extraction_source || '',
    blockingIssues: payload?.blocking_issues || [],
  };
};