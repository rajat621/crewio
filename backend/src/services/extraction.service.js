import axios from 'axios';
import env from '../config/env.js';

const aiClient = axios.create({
  baseURL: env.AI_SERVICE_URL,
  timeout: Number(env.AI_SERVICE_TIMEOUT_MS || 45000),
});

const postToAi = async (path, payload) => {
  try {
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
  return postToAi('/extract', {
    pdf_path: pdfPath,
    document_type: documentType,
  });
};

export const extractInvoiceSummary = async ({ pdfPath }) => {
  return postToAi('/extract/invoice-summary', { pdf_path: pdfPath });
};

export const extractAttendance = async ({ pdfPath }) => {
  return postToAi('/extract/attendance', { pdf_path: pdfPath });
};

export const generateInvoiceFromPdf = async ({
  pdfPath,
  templatePath,
  signaturePath,
  stampPath,
  companyData = {},
}) => {
  return postToAi('/generate-invoice', {
    pdf_path: pdfPath,
    template_path: templatePath,
    signature_path: signaturePath,
    stamp_path: stampPath,
    company_data: companyData,
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
