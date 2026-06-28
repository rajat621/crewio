import axios from 'axios';
import { createHash } from 'crypto';
import env from '../config/env.js';
import { runtimeConfig } from '../config/env.js';

const requestedTimeoutMs = Number(env.AI_SERVICE_TIMEOUT_MS || 0);
const defaultTimeoutMs = 300000;
const effectiveTimeoutMs = Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
  ? Number(requestedTimeoutMs)
  : defaultTimeoutMs;

const aiClient = axios.create({
  baseURL: env.AI_SERVICE_URL,
  timeout: effectiveTimeoutMs,
});

const FAILURE_CATEGORIES = {
  OCR_FAILURE: 'OCR_FAILURE',
  TABLE_EXTRACTION_FAILURE: 'TABLE_EXTRACTION_FAILURE',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  MALFORMED_JSON: 'MALFORMED_JSON',
  VALIDATION_FAILURE: 'VALIDATION_FAILURE',
  PDF_CORRUPTION: 'PDF_CORRUPTION',
  WORKER_TIMEOUT: 'WORKER_TIMEOUT',
  UNKNOWN_FAILURE: 'UNKNOWN_FAILURE',
  PROVIDER_OVERLOAD: 'PROVIDER_OVERLOAD',
  UNKNOWN_PROVIDER_ERROR: 'UNKNOWN_PROVIDER_ERROR',
};

const shouldSample = (rate) => Math.random() < Math.max(0, Math.min(1, Number(rate || 0)));

const classifyFailure = (error) => {
  const msg = String(error?.response?.data?.error || error?.response?.data?.message || error?.message || '').toLowerCase();
  if (msg.includes('ocr')) return FAILURE_CATEGORIES.OCR_FAILURE;
  if (msg.includes('table')) return FAILURE_CATEGORIES.TABLE_EXTRACTION_FAILURE;
  if (msg.includes('timed out') || msg.includes('timeout')) return FAILURE_CATEGORIES.PROVIDER_TIMEOUT;
  if (msg.includes('429') || msg.includes('overload') || msg.includes('too many requests')) return FAILURE_CATEGORIES.PROVIDER_OVERLOAD;
  if (msg.includes('refused') || msg.includes('unavailable') || msg.includes('econn')) return FAILURE_CATEGORIES.PROVIDER_UNAVAILABLE;
  if (msg.includes('json')) return FAILURE_CATEGORIES.MALFORMED_JSON;
  if (msg.includes('validation')) return FAILURE_CATEGORIES.VALIDATION_FAILURE;
  if (msg.includes('corrupted pdf') || msg.includes('unreadable pdf')) return FAILURE_CATEGORIES.PDF_CORRUPTION;
  if (msg.includes('provider')) return FAILURE_CATEGORIES.UNKNOWN_PROVIDER_ERROR;
  return FAILURE_CATEGORIES.UNKNOWN_FAILURE;
};

const hashValue = (v) => createHash('sha256').update(String(v || '')).digest('hex').slice(0, 16);

const obsLog = (event, data = {}, { verbose = false } = {}) => {
  if (!runtimeConfig.featureFlags.enableObservability || !runtimeConfig.observability.structuredLogsEnabled) return;
  if (verbose && !shouldSample(runtimeConfig.observability.verboseSamplingRate)) return;
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'backend-ai-service', event, ...data }));
};

const delay = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetryCategory = (category) => {
  return [
    FAILURE_CATEGORIES.PROVIDER_TIMEOUT,
    FAILURE_CATEGORIES.PROVIDER_UNAVAILABLE,
    FAILURE_CATEGORIES.PROVIDER_OVERLOAD,
    FAILURE_CATEGORIES.UNKNOWN_PROVIDER_ERROR,
  ].includes(category);
};

const postToAi = async (path, payload, traceContext = {}) => {
  const started = Date.now();
  const stage = `ai_post_${path.replace(/[^a-zA-Z0-9]+/g, '_')}`;
  const sampledTrace = shouldSample(runtimeConfig.observability.traceSamplingRate);
  obsLog('stage_start', {
    stage,
    requestId: traceContext.requestId || '',
    traceId: traceContext.traceId || '',
    sampledTrace,
    pdfPathHash: hashValue(payload?.pdf_path || payload?.pdfPath || ''),
  });
  const maxRetries = Math.max(0, Number(runtimeConfig.retries.provider || 1));
  const baseDelay = Math.max(0, Number(runtimeConfig.circuitBreaker?.baseRetryDelayMs || 250));
  const jitter = Math.max(0, Number(runtimeConfig.circuitBreaker?.jitterMs || 150));

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await aiClient.post(path, payload, {
        headers: {
          'x-request-id': traceContext.requestId || '',
          'x-trace-id': traceContext.traceId || '',
        },
      });
      obsLog('stage_complete', {
        stage,
        durationMs: Date.now() - started,
        requestId: traceContext.requestId || '',
        traceId: traceContext.traceId || '',
        statusCode: response.status,
        retryCount: attempt,
      });
      return response.data;
    } catch (error) {
      lastError = error;
      const message = error.response?.data?.error || error.response?.data?.message || error.message;
      const failureCategory = classifyFailure(error);
      const isRetryable = shouldRetryCategory(failureCategory);

      obsLog('stage_failure', {
        stage,
        durationMs: Date.now() - started,
        requestId: traceContext.requestId || '',
        traceId: traceContext.traceId || '',
        statusCode: error.response?.status || 500,
        failureCategory,
        reason: message,
        retryCount: attempt,
        fallbackActivated: attempt >= maxRetries,
      });

      if (!isRetryable || attempt >= maxRetries) {
        const wrapped = new Error(`AI service request failed: ${message}`);
        wrapped.status = error.response?.status || 500;
        wrapped.details = error.response?.data;
        wrapped.failureCategory = failureCategory;
        throw wrapped;
      }

      const sleepMs = baseDelay + Math.floor(Math.random() * (jitter + 1));
      await delay(sleepMs);
    }
  }

  throw lastError;
};

const getFromAi = async (path, traceContext = {}) => {
  const started = Date.now();
  const stage = `ai_get_${path.replace(/[^a-zA-Z0-9]+/g, '_')}`;
  obsLog('stage_start', {
    stage,
    requestId: traceContext.requestId || '',
    traceId: traceContext.traceId || '',
  });
  try {
    const response = await aiClient.get(path, {
      headers: {
        'x-request-id': traceContext.requestId || '',
        'x-trace-id': traceContext.traceId || '',
      },
    });
    obsLog('stage_complete', {
      stage,
      durationMs: Date.now() - started,
      requestId: traceContext.requestId || '',
      traceId: traceContext.traceId || '',
      statusCode: response.status,
    });
    return response.data;
  } catch (error) {
    const message = error.response?.data?.error || error.response?.data?.message || error.message;
    const failureCategory = classifyFailure(error);
    obsLog('stage_failure', {
      stage,
      durationMs: Date.now() - started,
      requestId: traceContext.requestId || '',
      traceId: traceContext.traceId || '',
      statusCode: error.response?.status || 500,
      failureCategory,
      reason: message,
    });
    const wrapped = new Error(`AI service request failed: ${message}`);
    wrapped.status = error.response?.status || 500;
    wrapped.details = error.response?.data;
    wrapped.failureCategory = failureCategory;
    throw wrapped;
  }
};

export const extractDocument = async ({ pdfPath, documentType = 'auto', traceContext = {} }) => {
  return postToAi('/extract', {
    pdf_path: pdfPath,
    document_type: documentType,
  }, traceContext);
};

export const extractInvoiceSummary = async ({ pdfPath, traceContext = {} }) => {
  return postToAi('/extract/invoice-summary', { pdf_path: pdfPath }, traceContext);
};

export const extractAttendance = async ({ pdfPath, traceContext = {} }) => {
  return postToAi('/extract/attendance', { pdf_path: pdfPath }, traceContext);
};

export const generateInvoiceFromPdf = async ({
  pdfPath,
  owner_company_id,
  owner_template_id,
  template_override,
  signature_override,
  stamp_override,
  include_signature = true,
  include_stamp = true,
  company_data = {},
  traceContext = {},
}) => {
  // Resolve owner company data from database if owner_company_id provided
  let ownerTemplate = template_override;
  let ownerSignature = signature_override;
  let ownerStamp = stamp_override;

  if (owner_company_id && !template_override && !signature_override && !stamp_override) {
    try {
      // Import Company model dynamically to avoid circular dependencies
      const { default: Company } = await import('../models/Company.js');
      const ownerCompany = await Company.findById(owner_company_id);
      
      if (ownerCompany) {
        ownerTemplate = ownerTemplate || ownerCompany.invoiceTemplate;
        ownerSignature = ownerSignature || ownerCompany.signature;
        ownerStamp = ownerStamp || ownerCompany.stamp;
      }
    } catch (err) {
      console.error('Failed to fetch owner company data:', err.message);
      // Continue with provided overrides or defaults
    }
  }

  return postToAi('/generate-invoice', {
    pdf_path: pdfPath,
    owner_company_id: owner_company_id,
    owner_template_id: owner_template_id,
    template_path: template_override || ownerTemplate,
    signature_path: signature_override || ownerSignature,
    stamp_path: stamp_override || ownerStamp,
    include_signature: include_signature,
    include_stamp: include_stamp,
    company_data: company_data,
  }, traceContext);
};

// Backward-compatible export.
export const extractInvoiceData = async (pdfPath) => {
  return extractInvoiceSummary({ pdfPath });
};

export const getCapabilities = async ({ traceContext = {} } = {}) => {
  return getFromAi('/capabilities', traceContext);
};

export default {
  extractDocument,
  extractInvoiceSummary,
  extractAttendance,
  generateInvoiceFromPdf,
  extractInvoiceData,
  getCapabilities,
};
