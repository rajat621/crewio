import axios from 'axios';
import env from '../config/env.js';

const requestedTimeoutMs = Number(env.AI_SERVICE_TIMEOUT_MS || 0);
const effectiveTimeoutMs = Number.isFinite(requestedTimeoutMs)
  ? Math.max(requestedTimeoutMs, 90000)
  : 90000;

const aiClient = axios.create({
  baseURL: env.AI_SERVICE_URL,
  timeout: effectiveTimeoutMs,
});

const postToAi = async (path, payload) => {
  try {
    console.log(
    "AI REQUEST:",
    "POST",
    `${env.AI_SERVICE_URL}${path}`
);
    console.log("AI REQUEST URL:", `${env.AI_SERVICE_URL}${path}`);

const response = await aiClient.post(path, payload);
    return response.data;
  } catch (error) {
    const message = error.response?.data?.error || error.response?.data?.message || error.message;
    const wrapped = new Error(`AI service request failed: ${message}`);
    wrapped.status = error.response?.status || 500;
    wrapped.details = error.response?.data;
    throw wrapped;
  }
};

const getFromAi = async (path) => {
  try {
    const response = await aiClient.get(path);
    return response.data;
  } catch (error) {
    const message = error.response?.data?.error || error.response?.data?.message || error.message;
    const wrapped = new Error(`AI service request failed: ${message}`);
    wrapped.status = error.response?.status || 500;
    wrapped.details = error.response?.data;
    throw wrapped;
  }
};

export const extractDocument = async ({ pdfPath, documentType = 'auto' }) => {
  return postToAi('/v2/extract', {
    pdf_path: pdfPath,
    document_type: documentType,
  });
};

// export const extractInvoiceSummary = async ({ pdfPath }) => {
//   return postToAi('/extract/invoice-summary', { pdf_path: pdfPath });
// };

// export const extractAttendance = async ({ pdfPath }) => {
//   return postToAi('/extract/attendance', { pdf_path: pdfPath });
// };
export const extractInvoiceSummary = async ({ pdfPath }) => {
  return postToAi('/v2/extract', {
    pdf_path: pdfPath,
    document_type: 'invoice-summary',
  });
};

export const extractAttendance = async ({ pdfPath }) => {
  return postToAi('/v2/extract', {
    pdf_path: pdfPath,
    document_type: 'attendance',
  });
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

  return postToAi('/v2/generate-invoice', {
    pdf_path: pdfPath,
    owner_company_id: owner_company_id,
    owner_template_id: owner_template_id,
    template_path: template_override || ownerTemplate,
    signature_path: signature_override || ownerSignature,
    stamp_path: stamp_override || ownerStamp,
    include_signature: include_signature,
    include_stamp: include_stamp,
    company_data: company_data,
  });
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


