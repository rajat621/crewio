// import axios from 'axios';
// import env from '../config/env.js';

// const requestedTimeoutMs = Number(env.AI_SERVICE_TIMEOUT_MS || 0);
// const effectiveTimeoutMs = Number.isFinite(requestedTimeoutMs)
//   ? Math.max(requestedTimeoutMs, 90000)
//   : 90000;

// const aiClient = axios.create({
//   baseURL: env.AI_SERVICE_URL,
//   timeout: effectiveTimeoutMs,
// });

// const postToAi = async (path, payload) => {
//   try {
//     console.log(
//     "AI REQUEST:",
//     "POST",
//     `${env.AI_SERVICE_URL}${path}`
// );
//     console.log("AI REQUEST URL:", `${env.AI_SERVICE_URL}${path}`);

// const response = await aiClient.post(path, payload);
//     return response.data;
//   } catch (error) {
//     const message = error.response?.data?.error || error.response?.data?.message || error.message;
//     const wrapped = new Error(`AI service request failed: ${message}`);
//     wrapped.status = error.response?.status || 500;
//     wrapped.details = error.response?.data;
//     throw wrapped;
//   }
// };

// const getFromAi = async (path) => {
//   try {
//     const response = await aiClient.get(path);
//     return response.data;
//   } catch (error) {
//     const message = error.response?.data?.error || error.response?.data?.message || error.message;
//     const wrapped = new Error(`AI service request failed: ${message}`);
//     wrapped.status = error.response?.status || 500;
//     wrapped.details = error.response?.data;
//     throw wrapped;
//   }
// };

// export const extractDocument = async ({ pdfPath, documentType = 'auto' }) => {
//   return postToAi('/v2/extract', {
//     pdf_path: pdfPath,
//     document_type: documentType,
//   });
// };

// // export const extractInvoiceSummary = async ({ pdfPath }) => {
// //   return postToAi('/extract/invoice-summary', { pdf_path: pdfPath });
// // };

// // export const extractAttendance = async ({ pdfPath }) => {
// //   return postToAi('/extract/attendance', { pdf_path: pdfPath });
// // };
// export const extractInvoiceSummary = async ({ pdfPath }) => {
//   return postToAi('/v2/extract', {
//     pdf_path: pdfPath,
//     document_type: 'invoice-summary',
//   });
// };

// export const extractAttendance = async ({ pdfPath }) => {
//   return postToAi('/v2/extract', {
//     pdf_path: pdfPath,
//     document_type: 'attendance',
//   });
// };
// export const generateInvoiceFromPdf = async ({
//   pdfPath,
//   owner_company_id,
//   owner_template_id,
//   template_override,
//   signature_override,
//   stamp_override,
//   include_signature = true,
//   include_stamp = true,
//   company_data = {},
// }) => {
//   // Resolve owner company data from database if owner_company_id provided
//   let ownerTemplate = template_override;
//   let ownerSignature = signature_override;
//   let ownerStamp = stamp_override;

//   if (owner_company_id && !template_override && !signature_override && !stamp_override) {
//     try {
//       // Import Company model dynamically to avoid circular dependencies
//       const { default: Company } = await import('../models/Company.js');
//       const ownerCompany = await Company.findById(owner_company_id);
      
//       if (ownerCompany) {
//         ownerTemplate = ownerTemplate || ownerCompany.invoiceTemplate;
//         ownerSignature = ownerSignature || ownerCompany.signature;
//         ownerStamp = ownerStamp || ownerCompany.stamp;
//       }
//     } catch (err) {
//       console.error('Failed to fetch owner company data:', err.message);
//       // Continue with provided overrides or defaults
//     }
//   }

//   return postToAi('/v2/generate-invoice', {
//     pdf_path: pdfPath,
//     owner_company_id: owner_company_id,
//     owner_template_id: owner_template_id,
//     template_path: template_override || ownerTemplate,
//     signature_path: signature_override || ownerSignature,
//     stamp_path: stamp_override || ownerStamp,
//     include_signature: include_signature,
//     include_stamp: include_stamp,
//     company_data: company_data,
//   });
// };

// // Backward-compatible export.
// export const extractInvoiceData = async (pdfPath) => {
//   return extractInvoiceSummary({ pdfPath });
// };

// export const getCapabilities = async () => {
//   return getFromAi('/capabilities');
// };

// export default {
//   extractDocument,
//   extractInvoiceSummary,
//   extractAttendance,
//   generateInvoiceFromPdf,
//   extractInvoiceData,
//   getCapabilities,
// };


import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import env from '../config/env.js';

const requestedTimeoutMs = Number(env.AI_SERVICE_TIMEOUT_MS || 0);
const effectiveTimeoutMs = Number.isFinite(requestedTimeoutMs)
  ? Math.max(requestedTimeoutMs, 90000)
  : 90000;

const aiClient = axios.create({
  baseURL: env.AI_SERVICE_URL,
  timeout: effectiveTimeoutMs,
  // D19.18 finding (real, significant): this file's aiClient never sent
  // the `X-Internal-Service-Key` header that the AI service's global
  // `_enforce_shared_secret` before_request hook (ai-services/main.py)
  // requires on every non-health-check endpoint whenever
  // AI_SERVICE_SHARED_SECRET is configured - and that variable is
  // *mandatory* (the Python service refuses to start without it) whenever
  // APP_ENV=production there. The sibling file `invoiceDraft.service.js`
  // already sends this header correctly (see its own aiClient setup) -
  // this file was the one AI-service caller that didn't, discovered by
  // cross-checking every caller of the same downstream service against
  // each other rather than auditing each file in isolation. In a properly
  // configured production deployment this meant every request this file
  // makes (attendance/timesheet extraction, invoice generation) would be
  // rejected with 401 by the AI service - a functional break, not just a
  // security one - or, if the requests were somehow still succeeding in
  // practice, it would mean AI_SERVICE_SHARED_SECRET wasn't actually set
  // in that production environment, in which case the AI service's
  // expensive OCR/PDF/extraction endpoints were reachable by any client
  // that can reach that service's URL, with zero authentication. Fixed by
  // mirroring invoiceDraft.service.js's exact pattern.
  headers: env.AI_SERVICE_SHARED_SECRET
    ? { 'X-Internal-Service-Key': env.AI_SERVICE_SHARED_SECRET }
    : {},
});

const logRequest = (path) => {
  console.log('AI REQUEST:', 'POST', `${env.AI_SERVICE_URL}${path}`);
  console.log('AI REQUEST URL:', `${env.AI_SERVICE_URL}${path}`);
};

const wrapError = (error) => {
  const message = error.response?.data?.error || error.response?.data?.message || error.message;
  const wrapped = new Error(`AI service request failed: ${message}`);
  wrapped.status = error.response?.status || 500;
  wrapped.details = error.response?.data;
  return wrapped;
};

const postToAi = async (path, payload) => {
  try {
    logRequest(path);
    const response = await aiClient.post(path, payload);
    return response.data;
  } catch (error) {
    throw wrapError(error);
  }
};

/**
 * IMPORTANT: the AI service (env.AI_SERVICE_URL) runs as its own separate
 * deployment - it does NOT share a filesystem with this backend (or with the
 * worker process). A local path that is perfectly valid here (a downloaded
 * R2 temp file, or an original local-storage file) means nothing on the AI
 * service's own disk, so `pdf_path` as a JSON string can never work across
 * that boundary - it will always 400 with "pdf_path does not exist".
 *
 * The AI service already supports multipart uploads (`request.files['file']`)
 * as an alternative to `pdf_path` - see /v2/extract and /v2/generate-invoice
 * in main.py - so instead of sending a path, we stream the actual file bytes
 * from `filePath` (which must already be a real local file - see
 * storage.service.js#downloadToTempFile) to the AI service. This uses an
 * existing, already-supported input mode; it does not change the AI
 * service's API.
 */
const postFileToAi = async (path, filePath, fields = {}) => {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
  }

  try {
    logRequest(path);
    const response = await aiClient.post(path, form, {
      // Explicit here (not just relying on the instance-level default
      // merging correctly) because this call already passes its own
      // `headers` object for form.getHeaders() - being explicit removes
      // any doubt about axios's default-vs-per-request header merge
      // semantics actually including the shared-secret header from the
      // instance defaults above.
      headers: {
        ...form.getHeaders(),
        ...(env.AI_SERVICE_SHARED_SECRET ? { 'X-Internal-Service-Key': env.AI_SERVICE_SHARED_SECRET } : {}),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return response.data;
  } catch (error) {
    throw wrapError(error);
  }
};

// Parses a `data:<mime>;base64,<data>` URI (how Company.invoiceTemplate /
// .signature / .stamp are stored) into a raw buffer + extension, so it can
// be attached as a real file part on the multipart upload. Returns null for
// anything that isn't a base64 data URI (e.g. empty, or a legacy path) -
// those can't be forwarded across the service boundary as a bare string.
const parseDataUri = (value) => {
  if (typeof value !== 'string') return null;
  const match = /^data:([^;]+);base64,(.+)$/s.exec(value.trim());
  if (!match) return null;
  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const ext = mime.split('/')[1] || 'bin';
  return { buffer, mime, ext };
};

const getFromAi = async (path) => {
  try {
    const response = await aiClient.get(path);
    return response.data;
  } catch (error) {
    throw wrapError(error);
  }
};

export const extractDocument = async ({ pdfPath, documentType = 'auto' }) => {
  return postFileToAi('/v2/extract', pdfPath, { document_type: documentType });
};

export const extractInvoiceSummary = async ({ pdfPath }) => {
  return postFileToAi('/v2/extract', pdfPath, { document_type: 'invoice-summary' });
};

export const extractAttendance = async ({ pdfPath }) => {
  return postFileToAi('/v2/extract', pdfPath, { document_type: 'attendance' });
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

  // /v2/generate-invoice/upload is the multipart counterpart of
  // /v2/generate-invoice - it takes the source PDF as an uploaded file plus
  // company_data/include_signature/include_stamp as form fields, and
  // template/signature/stamp as uploaded file parts (not path strings). The
  // template/signature/stamp values on Company are stored as base64 data
  // URIs, so decode each one into a real file part before attaching it.
  const form = new FormData();
  form.append('file', fs.createReadStream(pdfPath));
  form.append('company_data', JSON.stringify(company_data || {}));
  form.append('include_signature', String(include_signature));
  form.append('include_stamp', String(include_stamp));

  const attachAsset = (fieldName, value) => {
    const parsed = parseDataUri(value);
    if (!parsed) return;
    form.append(fieldName, parsed.buffer, {
      filename: `${fieldName}.${parsed.ext}`,
      contentType: parsed.mime,
    });
  };
  attachAsset('template', ownerTemplate);
  attachAsset('signature', ownerSignature);
  attachAsset('stamp', ownerStamp);

  try {
    logRequest('/v2/generate-invoice/upload');
    const response = await aiClient.post('/v2/generate-invoice/upload', form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return response.data;
  } catch (error) {
    throw wrapError(error);
  }
};

// Backward-compatible export.
export const extractInvoiceData = async (pdfPath) => {
  return extractInvoiceSummary({ pdfPath });
};

export const getCapabilities = async () => {
  return getFromAi('/capabilities');
};

export default {
  extractDocument,
  extractInvoiceSummary,
  extractAttendance,
  generateInvoiceFromPdf,
  extractInvoiceData,
  getCapabilities,
};