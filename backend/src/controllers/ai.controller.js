// import { randomUUID } from 'crypto';
// import {
//   extractDocument,
//   extractInvoiceSummary,
//   extractAttendance,
//   generateInvoiceFromPdf,
//   getCapabilities as fetchAICapabilities,
// } from '../services/extraction.service.js';
// import FileRecord from '../models/FileRecord.js';
// import { isCompanyAccessible, getAuthContext } from '../utils/tenant.js';
// import {
//   enqueueExtractionJob,
//   getTenantScopedJob,
//   getTenantJobMetrics,
//   getQueueMetrics,
// } from '../services/extractionJob.service.js';
// import env from '../config/env.js';
// import { runtimeConfig } from '../config/env.js';
// import { downloadToTempFile, driverFromStoredPath } from '../services/storage.service.js';

// // A FileRecord's `path` is either a local web path ("/companies/...") or,
// // for r2-backed records, the literal R2 object key. Resolve it to the
// // { driver, key } pair storage.service.js needs - this is the ONLY place
// // in this controller that decides how a persisted path maps to a storage
// // object. Never pass fr.path (or req.body.pdfPath) straight to the AI
// // service: it may be an R2 key, not a real filesystem path.
// const resolveStorageRef = (fileRecord) => {
//   const driver = fileRecord.storageDriver || driverFromStoredPath(fileRecord.path);
//   const key = fileRecord.storageKey || fileRecord.path;
//   return { driver, key };
// };

// const isEnabled = (v, defaultValue = false) => {
//   if (typeof v === 'boolean') return v;
//   if (typeof v !== 'string') return defaultValue;
//   const x = v.trim().toLowerCase();
//   return x === '1' || x === 'true' || x === 'yes' || x === 'on';
// };

// const asyncAiEnabled = () => isEnabled(env.ENABLE_ASYNC_AI, false);

// const ensureTraceContext = (req, res) => {
//   const requestId = String(req.headers['x-request-id'] || randomUUID());
//   const traceId = String(req.headers['x-trace-id'] || randomUUID());
//   const ctx = { requestId, traceId };
//   req.traceContext = ctx;
//   res.setHeader('x-request-id', requestId);
//   res.setHeader('x-trace-id', traceId);
//   return ctx;
// };

// const obsLog = (event, data = {}) => {
//   if (!runtimeConfig.featureFlags.enableObservability) return;
//   console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'backend-api', event, ...data }));
// };

// const resolveTenant = (req, body = {}) => {
//   const userId = req.user?.userId || body.userId || body.user_id;
//   const companyId = body.companyId || body.company_id;
//   return { userId, companyId };
// };

// const sendFailure = (res, fallbackMessage, error) => {
//   return res.status(error.status || 500).json({
//     message: fallbackMessage,
//     error: error.message,
//     details: error.details,
//   });
// };

// export const extractTables = async (req, res) => {
//   const trace = ensureTraceContext(req, res);
//   const stageStarted = Date.now();
//   try {
//     const { pdfPath, documentType = 'auto' } = req.body || {};
//     if (!pdfPath) {
//       return res.status(400).json({ message: 'pdfPath is required' });
//     }

//     // Only allow extraction of files previously uploaded and tracked via FileRecord
//     const fr = await FileRecord.findOne({ path: pdfPath });
//     if (!fr) {
//       return res.status(400).json({ message: 'pdfPath is not an authorized file' });
//     }

//     const ctx = getAuthContext(req);
//     if (String(fr.ownerId) !== String(ctx.ownerId || ctx.userId) && String(fr.companyId) !== String(ctx.companyId)) {
//       return res.status(403).json({ message: 'Access denied to requested file' });
//     }

//     const { driver: storageDriver, key: storageKey } = resolveStorageRef(fr);

//     obsLog('stage_start', { stage: 'upload_ingestion', ...trace });
//     // If async AI flow enabled, enqueue a job instead of running long sync extraction.
//     // Pass the storage reference (not a resolved local path) - the worker may run in a
//     // separate process/container, so the download must happen there, right before use.
//     if (asyncAiEnabled()) {
//       const { userId, companyId } = { userId: req.user?.userId, companyId: req.body?.companyId || req.body?.company_id };
//       const payload = { pdfPath, storageKey, storageDriver, documentType, companyId, userId, traceContext: trace };
//       const job = await enqueueExtractionJob({ jobType: 'extract', userId, companyId, payload, traceContext: trace });
//       obsLog('stage_queued', { stage: 'upload_ingestion', jobId: job.jobId, ...trace });
//       return res.status(202).json({ message: 'AI job queued', data: { jobId: job.jobId, status: job.status } });
//     }

//     // Fallback synchronous path (legacy). The AI service needs a real filesystem
//     // path (pdfplumber/OCR) - never pass an R2 key as pdf_path. On the r2 driver
//     // this downloads the object into a disposable temp file first; on local it's
//     // a zero-copy no-op. Either way the temp copy is always cleaned up.
//     const tempFile = await downloadToTempFile({ key: storageKey, driver: storageDriver });
//     let result;
//     try {
//       result = await extractDocument({ pdfPath: tempFile.path, documentType, traceContext: trace });
//     } finally {
//       await tempFile.cleanup();
//     }
//     obsLog('stage_complete', { stage: 'upload_ingestion', durationMs: Date.now() - stageStarted, ...trace });
//     return res.json({ message: 'Extraction completed', ...result });
//   } catch (error) {
//     obsLog('stage_failure', { stage: 'upload_ingestion', durationMs: Date.now() - stageStarted, reason: error.message, ...trace });
//     return sendFailure(res, 'Extraction failed', error);
//   }
// };

// export const extractInvoiceTables = async (req, res) => {
//   const trace = ensureTraceContext(req, res);
//   try {
//     const { pdfPath } = req.body || {};
//     if (!pdfPath) {
//       return res.status(400).json({ message: 'pdfPath is required' });
//     }

//     const fr = await FileRecord.findOne({ path: pdfPath });
//     if (!fr) return res.status(400).json({ message: 'pdfPath is not an authorized file' });
//     const ctx = getAuthContext(req);
//     if (String(fr.ownerId) !== String(ctx.ownerId || ctx.userId) && String(fr.companyId) !== String(ctx.companyId)) {
//       return res.status(403).json({ message: 'Access denied to requested file' });
//     }

//     const { driver: storageDriver, key: storageKey } = resolveStorageRef(fr);

//     if (asyncAiEnabled()) {
//       const { userId, companyId } = { userId: req.user?.userId, companyId: req.body?.companyId || req.body?.company_id };
//       const payload = { pdfPath, storageKey, storageDriver, documentType: 'invoice-summary', companyId, userId, traceContext: trace };
//       const job = await enqueueExtractionJob({ jobType: 'extract-invoice-summary', userId, companyId, payload, traceContext: trace });
//       return res.status(202).json({ message: 'AI job queued', data: { jobId: job.jobId, status: job.status } });
//     }

//     const tempFile = await downloadToTempFile({ key: storageKey, driver: storageDriver });
//     let result;
//     try {
//       result = await extractInvoiceSummary({ pdfPath: tempFile.path, traceContext: trace });
//     } finally {
//       await tempFile.cleanup();
//     }
//     return res.json({ message: 'Invoice summary extracted', ...result });
//   } catch (error) {
//     return sendFailure(res, 'Invoice summary extraction failed', error);
//   }
// };

// export const extractAttendanceTables = async (req, res) => {
//   const trace = ensureTraceContext(req, res);
//   try {
//     const { pdfPath } = req.body || {};
//     if (!pdfPath) {
//       return res.status(400).json({ message: 'pdfPath is required' });
//     }

//     const fr = await FileRecord.findOne({ path: pdfPath });
//     if (!fr) return res.status(400).json({ message: 'pdfPath is not an authorized file' });
//     const ctx = getAuthContext(req);
//     if (String(fr.ownerId) !== String(ctx.ownerId || ctx.userId) && String(fr.companyId) !== String(ctx.companyId)) {
//       return res.status(403).json({ message: 'Access denied to requested file' });
//     }

//     const { driver: storageDriver, key: storageKey } = resolveStorageRef(fr);

//     if (asyncAiEnabled()) {
//       const { userId, companyId } = { userId: req.user?.userId, companyId: req.body?.companyId || req.body?.company_id };
//       const payload = { pdfPath, storageKey, storageDriver, documentType: 'attendance', companyId, userId, traceContext: trace };
//       const job = await enqueueExtractionJob({ jobType: 'extract-attendance', userId, companyId, payload, traceContext: trace });
//       return res.status(202).json({ message: 'AI job queued', data: { jobId: job.jobId, status: job.status } });
//     }

//     const tempFile = await downloadToTempFile({ key: storageKey, driver: storageDriver });
//     let result;
//     try {
//       result = await extractAttendance({ pdfPath: tempFile.path, traceContext: trace });
//     } finally {
//       await tempFile.cleanup();
//     }
//     return res.json({ message: 'Attendance extracted', ...result });
//   } catch (error) {
//     return sendFailure(res, 'Attendance extraction failed', error);
//   }
// };

// export const generateInvoice = async (req, res) => {
//   const trace = ensureTraceContext(req, res);
//   try {
//     const {
//       pdfPath,
//       owner_company_id,
//       owner_template_id,
//       template_override,
//       signature_override,
//       stamp_override,
//       include_signature = true,
//       include_stamp = true,
//       company_data = {},
//     } = req.body || {};

//     if (!pdfPath) {
//       return res.status(400).json({ message: 'pdfPath is required' });
//     }

//     const fr = await FileRecord.findOne({ path: pdfPath });
//     if (!fr) return res.status(400).json({ message: 'pdfPath is not an authorized file' });
//     const ctx = getAuthContext(req);
//     if (String(fr.ownerId) !== String(ctx.ownerId || ctx.userId) && String(fr.companyId) !== String(ctx.companyId)) {
//       return res.status(403).json({ message: 'Access denied to requested file' });
//     }

//     const { driver: storageDriver, key: storageKey } = resolveStorageRef(fr);
//     const tempFile = await downloadToTempFile({ key: storageKey, driver: storageDriver });
//     let result;
//     try {
//       result = await generateInvoiceFromPdf({
//         pdfPath: tempFile.path,
//         owner_company_id,
//         owner_template_id,
//         template_override,
//         signature_override,
//         stamp_override,
//         include_signature,
//         include_stamp,
//         company_data,
//         traceContext: trace,
//       });
//     } finally {
//       await tempFile.cleanup();
//     }

//     return res.status(201).json({ 
//       message: 'Invoice generated', 
//       ...result 
//     });
//   } catch (error) {
//     return sendFailure(res, 'Invoice generation failed', error);
//   }
// };

// export const getCapabilities = async (req, res) => {
//   const trace = ensureTraceContext(req, res);
//   try {
//     // If AI service URL is not configured, return a safe default capabilities response
//     // so that public health/capabilities checks succeed in development.
//     if (!env.AI_SERVICE_URL) {
//       return res.json({ message: 'Capabilities retrieved', data: { enabled: false, reason: 'AI service not configured' } });
//     }

//     const result = await fetchAICapabilities({ traceContext: trace });
//     return res.json({ message: 'Capabilities retrieved', ...result });
//   } catch (error) {
//     // If underlying AI provider fails, return a 200 with minimal info rather than failing E2E.
//     console.error('getCapabilities error:', error.message);
//     return res.json({ message: 'Capabilities retrieved', data: { enabled: false, error: error.message } });
//   }
// };

// export const createExtractionJob = async (req, res) => {
//   const trace = ensureTraceContext(req, res);
//   try {
//     if (!asyncAiEnabled()) {
//       return res.status(503).json({
//         message: 'Async AI flow is disabled by feature flag',
//         success: false,
//       });
//     }

//     const {
//       jobType = 'extract',
//       pdfPath,
//       documentType = 'auto',
//       owner_company_id,
//       owner_template_id,
//       template_override,
//       signature_override,
//       stamp_override,
//       include_signature = true,
//       include_stamp = true,
//       company_data = {},
//     } = req.body || {};

//     const { userId, companyId } = {
//       userId: req.user?.userId,
//       companyId: req.body?.companyId || req.body?.company_id,
//     };

//     if (!userId || !companyId) {
//       return res.status(400).json({
//         message: 'companyId and userId are required for tenant-scoped AI jobs',
//       });
//     }

//     if (!pdfPath) {
//       return res.status(400).json({ message: 'pdfPath is required' });
//     }

//     // Ensure provided pdfPath is an uploaded file and owned by the tenant
//     const fr = await FileRecord.findOne({ path: pdfPath });
//     if (!fr) return res.status(400).json({ message: 'pdfPath is not an authorized file' });
//     const ctx = getAuthContext(req);
//     if (String(fr.ownerId) !== String(ctx.ownerId || ctx.userId) && String(fr.companyId) !== String(ctx.companyId)) {
//       return res.status(403).json({ message: 'Access denied to requested file' });
//     }

//     const { driver: storageDriver, key: storageKey } = resolveStorageRef(fr);

//     const payload = {
//       pdfPath,
//       storageKey,
//       storageDriver,
//       documentType,
//       owner_company_id,
//       owner_template_id,
//       template_override,
//       signature_override,
//       stamp_override,
//       include_signature,
//       include_stamp,
//       company_data: {
//         ...(company_data || {}),
//         companyId,
//         userId,
//       },
//       companyId,
//       userId,
//       traceContext: trace,
//     };

//     const job = await enqueueExtractionJob({
//       jobType,
//       userId,
//       companyId,
//       payload,
//       traceContext: trace,
//     });

//     return res.status(202).json({
//       message: 'AI job queued',
//       success: true,
//       data: {
//         ...job,
//         companyId,
//         userId,
//       },
//     });
//   } catch (error) {
//     return sendFailure(res, 'Failed to queue AI job', error);
//   }
// };

// export const getExtractionJobStatus = async (req, res) => {
//   ensureTraceContext(req, res);
//   try {
//     if (!asyncAiEnabled()) {
//       return res.status(503).json({
//         message: 'Async AI flow is disabled by feature flag',
//         success: false,
//       });
//     }

//     const { jobId } = req.params;
//     const { userId, companyId } = {
//       userId: req.user?.userId,
//       companyId: req.query?.companyId || req.query?.company_id,
//     };

//     if (!jobId) {
//       return res.status(400).json({ message: 'jobId is required' });
//     }

//     if (!userId || !companyId) {
//       return res.status(400).json({
//         message: 'companyId and userId are required for tenant-scoped AI jobs',
//       });
//     }

//     const job = await getTenantScopedJob({ jobId, userId, companyId });

//     if (!job) {
//       return res.status(404).json({ message: 'AI job not found' });
//     }

//     return res.json({
//       message: 'AI job retrieved',
//       success: true,
//       data: {
//         jobId: job.jobId,
//         jobType: job.jobType,
//         status: job.status,
//         progress: job.progress,
//         attemptsMade: job.attemptsMade,
//         error: job.error,
//         createdAt: job.createdAt,
//         startedAt: job.startedAt,
//         completedAt: job.completedAt,
//       },
//     });
//   } catch (error) {
//     return sendFailure(res, 'Failed to fetch AI job status', error);
//   }
// };

// export const getExtractionJobResult = async (req, res) => {
//   ensureTraceContext(req, res);
//   try {
//     if (!asyncAiEnabled()) {
//       return res.status(503).json({
//         message: 'Async AI flow is disabled by feature flag',
//         success: false,
//       });
//     }

//     const { jobId } = req.params;
//     const { userId, companyId } = {
//       userId: req.user?.userId,
//       companyId: req.query?.companyId || req.query?.company_id,
//     };

//     if (!jobId) {
//       return res.status(400).json({ message: 'jobId is required' });
//     }

//     if (!userId || !companyId) {
//       return res.status(400).json({
//         message: 'companyId and userId are required for tenant-scoped AI jobs',
//       });
//     }

//     const job = await getTenantScopedJob({ jobId, userId, companyId });

//     if (!job) {
//       return res.status(404).json({ message: 'AI job not found' });
//     }

//     if (job.status !== 'completed') {
//       return res.status(409).json({
//         message: 'AI job is not completed yet',
//         success: false,
//         data: {
//           jobId: job.jobId,
//           status: job.status,
//           error: job.error,
//         },
//       });
//     }

//     return res.json({
//       message: 'AI job result retrieved',
//       success: true,
//       data: {
//         jobId: job.jobId,
//         jobType: job.jobType,
//         status: job.status,
//         result: job.result,
//         completedAt: job.completedAt,
//       },
//     });
//   } catch (error) {
//     return sendFailure(res, 'Failed to fetch AI job result', error);
//   }
// };

// export const getExtractionJobMetrics = async (req, res) => {
//   ensureTraceContext(req, res);
//   try {
//     if (!asyncAiEnabled()) {
//       return res.status(503).json({
//         message: 'Async AI flow is disabled by feature flag',
//         success: false,
//       });
//     }

//     const { userId, companyId } = {
//       userId: req.user?.userId,
//       companyId: req.query?.companyId || req.query?.company_id,
//     };
//     if (!userId || !companyId) {
//       return res.status(400).json({
//         message: 'companyId and userId are required for tenant-scoped AI job metrics',
//       });
//     }

//     const [tenantMetrics, queueMetrics] = await Promise.all([
//       getTenantJobMetrics({ userId, companyId }),
//       getQueueMetrics(),
//     ]);

//     return res.json({
//       message: 'AI job metrics retrieved',
//       success: true,
//       data: {
//         companyId,
//         userId,
//         flags: {
//           ENABLE_ASYNC_AI: asyncAiEnabled(),
//           ENABLE_OLLAMA: isEnabled(env.ENABLE_OLLAMA, true),
//           ENABLE_SEMANTIC_EXTRACTION: isEnabled(env.ENABLE_SEMANTIC_EXTRACTION, true),
//           ENABLE_PADDLE_OCR: isEnabled(env.ENABLE_PADDLE_OCR, true),
//         },
//         tenant: tenantMetrics,
//         queue: queueMetrics,
//       },
//     });
//   } catch (error) {
//     return sendFailure(res, 'Failed to fetch AI job metrics', error);
//   }
// };


import { randomUUID } from 'crypto';
import {
  extractDocument,
  extractInvoiceSummary,
  extractAttendance,
  generateInvoiceFromPdf,
  getCapabilities as fetchAICapabilities,
} from '../services/extraction.service.js';
import FileRecord from '../models/FileRecord.js';
import { isCompanyAccessible, getAuthContext } from '../utils/tenant.js';
import {
  enqueueExtractionJob,
  getTenantScopedJob,
  getTenantJobMetrics,
} from '../services/extractionJob.service.js';
import env from '../config/env.js';
import { runtimeConfig } from '../config/env.js';
import { downloadToTempFile, driverFromStoredPath } from '../services/storage.service.js';

// A FileRecord's `path` is either a local web path ("/companies/...") or,
// for r2-backed records, the literal R2 object key. Resolve it to the
// { driver, key } pair storage.service.js needs - this is the ONLY place
// in this controller that decides how a persisted path maps to a storage
// object. Never pass fr.path (or req.body.pdfPath) straight to the AI
// service: it may be an R2 key, not a real filesystem path.
const resolveStorageRef = (fileRecord) => {
  const driver = fileRecord.storageDriver || driverFromStoredPath(fileRecord.path);
  const key = fileRecord.storageKey || fileRecord.path;
  return { driver, key };
};

const isEnabled = (v, defaultValue = false) => {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return defaultValue;
  const x = v.trim().toLowerCase();
  return x === '1' || x === 'true' || x === 'yes' || x === 'on';
};

const asyncAiEnabled = () => isEnabled(env.ENABLE_ASYNC_AI, false);

const ensureTraceContext = (req, res) => {
  const requestId = String(req.headers['x-request-id'] || randomUUID());
  const traceId = String(req.headers['x-trace-id'] || randomUUID());
  const ctx = { requestId, traceId };
  req.traceContext = ctx;
  res.setHeader('x-request-id', requestId);
  res.setHeader('x-trace-id', traceId);
  return ctx;
};

const obsLog = (event, data = {}) => {
  if (!runtimeConfig.featureFlags.enableObservability) return;
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'backend-api', event, ...data }));
};

const resolveTenant = (req, body = {}) => {
  const userId = req.user?.userId || body.userId || body.user_id;
  const companyId = body.companyId || body.company_id;
  return { userId, companyId };
};

const sendFailure = (res, fallbackMessage, error) => {
  // error.message and error.details (the latter being the raw response
  // body from a failed AI-service HTTP call, per
  // extraction.service.js/invoiceDraft.service.js's `wrapped.details =
  // error.response?.data`) both previously reached the client here -
  // this function is called from 8 active sites, so fixing it once here
  // closes all of them.
  console.error('[ai] request failed:', fallbackMessage, error);
  return res.status(error.status || 500).json({
    message: fallbackMessage,
  });
};

export const extractTables = async (req, res) => {
  const trace = ensureTraceContext(req, res);
  const stageStarted = Date.now();
  try {
    const { pdfPath, documentType = 'auto' } = req.body || {};
    if (!pdfPath) {
      return res.status(400).json({ message: 'pdfPath is required' });
    }

    // Only allow extraction of files previously uploaded and tracked via FileRecord
    const fr = await FileRecord.findOne({ path: pdfPath });
    if (!fr) {
      return res.status(400).json({ message: 'pdfPath is not an authorized file' });
    }

    const ctx = getAuthContext(req);
    if (String(fr.ownerId) !== String(ctx.ownerId || ctx.userId) && String(fr.companyId) !== String(ctx.companyId)) {
      return res.status(403).json({ message: 'Access denied to requested file' });
    }

    const { driver: storageDriver, key: storageKey } = resolveStorageRef(fr);

    obsLog('stage_start', { stage: 'upload_ingestion', ...trace });
    // If async AI flow enabled, enqueue a job instead of running long sync extraction.
    // Pass the storage reference (not a resolved local path) - the worker may run in a
    // separate process/container, so the download must happen there, right before use.
    if (asyncAiEnabled()) {
      const { userId, companyId } = { userId: req.user?.userId, companyId: req.body?.companyId || req.body?.company_id };
      const payload = { pdfPath, storageKey, storageDriver, documentType, companyId, userId, traceContext: trace };
      const job = await enqueueExtractionJob({ jobType: 'extract', userId, companyId, payload, traceContext: trace });
      obsLog('stage_queued', { stage: 'upload_ingestion', jobId: job.jobId, ...trace });
      return res.status(202).json({ message: 'AI job queued', data: { jobId: job.jobId, status: job.status } });
    }

    // Fallback synchronous path (legacy). The AI service needs a real filesystem
    // path (pdfplumber/OCR) - never pass an R2 key as pdf_path. On the r2 driver
    // this downloads the object into a disposable temp file first; on local it's
    // a zero-copy no-op. Either way the temp copy is always cleaned up.
    const tempFile = await downloadToTempFile({ key: storageKey, driver: storageDriver });
    let result;
    try {
      result = await extractDocument({ pdfPath: tempFile.path, documentType, traceContext: trace });
    } finally {
      await tempFile.cleanup();
    }
    obsLog('stage_complete', { stage: 'upload_ingestion', durationMs: Date.now() - stageStarted, ...trace });
    return res.json({ message: 'Extraction completed', ...result });
  } catch (error) {
    obsLog('stage_failure', { stage: 'upload_ingestion', durationMs: Date.now() - stageStarted, reason: error.message, ...trace });
    return sendFailure(res, 'Extraction failed', error);
  }
};

export const extractInvoiceTables = async (req, res) => {
  const trace = ensureTraceContext(req, res);
  try {
    const { pdfPath } = req.body || {};
    if (!pdfPath) {
      return res.status(400).json({ message: 'pdfPath is required' });
    }

    const fr = await FileRecord.findOne({ path: pdfPath });
    if (!fr) return res.status(400).json({ message: 'pdfPath is not an authorized file' });
    const ctx = getAuthContext(req);
    if (String(fr.ownerId) !== String(ctx.ownerId || ctx.userId) && String(fr.companyId) !== String(ctx.companyId)) {
      return res.status(403).json({ message: 'Access denied to requested file' });
    }

    const { driver: storageDriver, key: storageKey } = resolveStorageRef(fr);

    if (asyncAiEnabled()) {
      const { userId, companyId } = { userId: req.user?.userId, companyId: req.body?.companyId || req.body?.company_id };
      const payload = { pdfPath, storageKey, storageDriver, documentType: 'invoice-summary', companyId, userId, traceContext: trace };
      const job = await enqueueExtractionJob({ jobType: 'extract-invoice-summary', userId, companyId, payload, traceContext: trace });
      return res.status(202).json({ message: 'AI job queued', data: { jobId: job.jobId, status: job.status } });
    }

    const tempFile = await downloadToTempFile({ key: storageKey, driver: storageDriver });
    let result;
    try {
      result = await extractInvoiceSummary({ pdfPath: tempFile.path, traceContext: trace });
    } finally {
      await tempFile.cleanup();
    }
    return res.json({ message: 'Invoice summary extracted', ...result });
  } catch (error) {
    return sendFailure(res, 'Invoice summary extraction failed', error);
  }
};

export const extractAttendanceTables = async (req, res) => {
  const trace = ensureTraceContext(req, res);
  try {
    const { pdfPath } = req.body || {};
    if (!pdfPath) {
      return res.status(400).json({ message: 'pdfPath is required' });
    }

    const fr = await FileRecord.findOne({ path: pdfPath });
    if (!fr) return res.status(400).json({ message: 'pdfPath is not an authorized file' });
    const ctx = getAuthContext(req);
    if (String(fr.ownerId) !== String(ctx.ownerId || ctx.userId) && String(fr.companyId) !== String(ctx.companyId)) {
      return res.status(403).json({ message: 'Access denied to requested file' });
    }

    const { driver: storageDriver, key: storageKey } = resolveStorageRef(fr);

    if (asyncAiEnabled()) {
      const { userId, companyId } = { userId: req.user?.userId, companyId: req.body?.companyId || req.body?.company_id };
      const payload = { pdfPath, storageKey, storageDriver, documentType: 'attendance', companyId, userId, traceContext: trace };
      const job = await enqueueExtractionJob({ jobType: 'extract-attendance', userId, companyId, payload, traceContext: trace });
      return res.status(202).json({ message: 'AI job queued', data: { jobId: job.jobId, status: job.status } });
    }

    const tempFile = await downloadToTempFile({ key: storageKey, driver: storageDriver });
    let result;
    try {
      result = await extractAttendance({ pdfPath: tempFile.path, traceContext: trace });
    } finally {
      await tempFile.cleanup();
    }
    return res.json({ message: 'Attendance extracted', ...result });
  } catch (error) {
    return sendFailure(res, 'Attendance extraction failed', error);
  }
};

export const generateInvoice = async (req, res) => {
  const trace = ensureTraceContext(req, res);
  try {
    const {
      pdfPath,
      owner_company_id,
      owner_template_id,
      template_override,
      signature_override,
      stamp_override,
      include_signature = true,
      include_stamp = true,
      company_data = {},
    } = req.body || {};

    if (!pdfPath) {
      return res.status(400).json({ message: 'pdfPath is required' });
    }

    const fr = await FileRecord.findOne({ path: pdfPath });
    if (!fr) return res.status(400).json({ message: 'pdfPath is not an authorized file' });
    const ctx = getAuthContext(req);
    if (String(fr.ownerId) !== String(ctx.ownerId || ctx.userId) && String(fr.companyId) !== String(ctx.companyId)) {
      return res.status(403).json({ message: 'Access denied to requested file' });
    }

    const { driver: storageDriver, key: storageKey } = resolveStorageRef(fr);
    const tempFile = await downloadToTempFile({ key: storageKey, driver: storageDriver });
    let result;
    try {
      result = await generateInvoiceFromPdf({
        pdfPath: tempFile.path,
        owner_company_id,
        owner_template_id,
        template_override,
        signature_override,
        stamp_override,
        include_signature,
        include_stamp,
        company_data,
        traceContext: trace,
      });
    } finally {
      await tempFile.cleanup();
    }

    return res.status(201).json({ 
      message: 'Invoice generated', 
      ...result 
    });
  } catch (error) {
    return sendFailure(res, 'Invoice generation failed', error);
  }
};

export const getCapabilities = async (req, res) => {
  const trace = ensureTraceContext(req, res);
  try {
    // If AI service URL is not configured, return a safe default capabilities response
    // so that public health/capabilities checks succeed in development.
    if (!env.AI_SERVICE_URL) {
      return res.json({ message: 'Capabilities retrieved', data: { enabled: false, reason: 'AI service not configured' } });
    }

    const result = await fetchAICapabilities({ traceContext: trace });
    return res.json({ message: 'Capabilities retrieved', ...result });
  } catch (error) {
    // If underlying AI provider fails, return a 200 with minimal info rather than failing E2E.
    // No error detail in the response: this route requires no authentication at
    // all, so any client could trigger it and would otherwise receive whatever
    // the underlying failure's message contains (potentially internal
    // AI-service URLs or network details) with zero auth required to see it.
    console.error('getCapabilities error:', error.message);
    return res.json({ message: 'Capabilities retrieved', data: { enabled: false } });
  }
};

export const createExtractionJob = async (req, res) => {
  const trace = ensureTraceContext(req, res);
  try {
    if (!asyncAiEnabled()) {
      return res.status(503).json({
        message: 'Async AI flow is disabled by feature flag',
        success: false,
      });
    }

    const {
      jobType = 'extract',
      pdfPath,
      documentType = 'auto',
      owner_company_id,
      owner_template_id,
      template_override,
      signature_override,
      stamp_override,
      include_signature = true,
      include_stamp = true,
      company_data = {},
    } = req.body || {};

    const { userId, companyId } = {
      userId: req.user?.userId,
      companyId: req.body?.companyId || req.body?.company_id,
    };

    if (!userId || !companyId) {
      return res.status(400).json({
        message: 'companyId and userId are required for tenant-scoped AI jobs',
      });
    }

    if (!pdfPath) {
      return res.status(400).json({ message: 'pdfPath is required' });
    }

    // Ensure provided pdfPath is an uploaded file and owned by the tenant
    const fr = await FileRecord.findOne({ path: pdfPath });
    if (!fr) return res.status(400).json({ message: 'pdfPath is not an authorized file' });
    const ctx = getAuthContext(req);
    if (String(fr.ownerId) !== String(ctx.ownerId || ctx.userId) && String(fr.companyId) !== String(ctx.companyId)) {
      return res.status(403).json({ message: 'Access denied to requested file' });
    }

    const { driver: storageDriver, key: storageKey } = resolveStorageRef(fr);

    const payload = {
      pdfPath,
      storageKey,
      storageDriver,
      documentType,
      owner_company_id,
      owner_template_id,
      template_override,
      signature_override,
      stamp_override,
      include_signature,
      include_stamp,
      company_data: {
        ...(company_data || {}),
        companyId,
        userId,
      },
      companyId,
      userId,
      traceContext: trace,
    };

    const job = await enqueueExtractionJob({
      jobType,
      userId,
      companyId,
      payload,
      traceContext: trace,
    });

    return res.status(202).json({
      message: 'AI job queued',
      success: true,
      data: {
        ...job,
        companyId,
        userId,
      },
    });
  } catch (error) {
    return sendFailure(res, 'Failed to queue AI job', error);
  }
};

export const getExtractionJobStatus = async (req, res) => {
  ensureTraceContext(req, res);
  try {
    if (!asyncAiEnabled()) {
      return res.status(503).json({
        message: 'Async AI flow is disabled by feature flag',
        success: false,
      });
    }

    const { jobId } = req.params;
    const { userId, companyId } = {
      userId: req.user?.userId,
      companyId: req.query?.companyId || req.query?.company_id,
    };

    if (!jobId) {
      return res.status(400).json({ message: 'jobId is required' });
    }

    if (!userId || !companyId) {
      return res.status(400).json({
        message: 'companyId and userId are required for tenant-scoped AI jobs',
      });
    }

    const job = await getTenantScopedJob({
      jobId,
      userId,
      companyId,
      projection: { payload: 0, result: 0, decisionTrace: 0 },
    });

    if (!job) {
      return res.status(404).json({ message: 'AI job not found' });
    }

    return res.json({
      message: 'AI job retrieved',
      success: true,
      data: {
        jobId: job.jobId,
        jobType: job.jobType,
        status: job.status,
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        error: job.error,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
    });
  } catch (error) {
    return sendFailure(res, 'Failed to fetch AI job status', error);
  }
};

export const getExtractionJobResult = async (req, res) => {
  ensureTraceContext(req, res);
  try {
    if (!asyncAiEnabled()) {
      return res.status(503).json({
        message: 'Async AI flow is disabled by feature flag',
        success: false,
      });
    }

    const { jobId } = req.params;
    const { userId, companyId } = {
      userId: req.user?.userId,
      companyId: req.query?.companyId || req.query?.company_id,
    };

    if (!jobId) {
      return res.status(400).json({ message: 'jobId is required' });
    }

    if (!userId || !companyId) {
      return res.status(400).json({
        message: 'companyId and userId are required for tenant-scoped AI jobs',
      });
    }

    const job = await getTenantScopedJob({ jobId, userId, companyId });

    if (!job) {
      return res.status(404).json({ message: 'AI job not found' });
    }

    if (job.status !== 'completed') {
      return res.status(409).json({
        message: 'AI job is not completed yet',
        success: false,
        data: {
          jobId: job.jobId,
          status: job.status,
          error: job.error,
        },
      });
    }

    return res.json({
      message: 'AI job result retrieved',
      success: true,
      data: {
        jobId: job.jobId,
        jobType: job.jobType,
        status: job.status,
        result: job.result,
        completedAt: job.completedAt,
      },
    });
  } catch (error) {
    return sendFailure(res, 'Failed to fetch AI job result', error);
  }
};

export const getExtractionJobMetrics = async (req, res) => {
  ensureTraceContext(req, res);
  try {
    if (!asyncAiEnabled()) {
      return res.status(503).json({
        message: 'Async AI flow is disabled by feature flag',
        success: false,
      });
    }

    const { userId, companyId } = {
      userId: req.user?.userId,
      companyId: req.query?.companyId || req.query?.company_id,
    };
    if (!userId || !companyId) {
      return res.status(400).json({
        message: 'companyId and userId are required for tenant-scoped AI job metrics',
      });
    }

    const tenantMetrics = await getTenantJobMetrics({ userId, companyId });

    return res.json({
      message: 'AI job metrics retrieved',
      success: true,
      data: {
        companyId,
        userId,
        flags: {
          ENABLE_ASYNC_AI: asyncAiEnabled(),
          ENABLE_OLLAMA: isEnabled(env.ENABLE_OLLAMA, true),
          ENABLE_SEMANTIC_EXTRACTION: isEnabled(env.ENABLE_SEMANTIC_EXTRACTION, true),
          ENABLE_PADDLE_OCR: isEnabled(env.ENABLE_PADDLE_OCR, true),
        },
        tenant: tenantMetrics,
      },
    });
  } catch (error) {
    return sendFailure(res, 'Failed to fetch AI job metrics', error);
  }
};