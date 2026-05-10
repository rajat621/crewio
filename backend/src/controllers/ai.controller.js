import {
  extractDocument,
  extractInvoiceSummary,
  extractAttendance,
  generateInvoiceFromPdf,
  getCapabilities as fetchAICapabilities,
} from '../services/extraction.service.js';

const sendFailure = (res, fallbackMessage, error) => {
  return res.status(error.status || 500).json({
    message: fallbackMessage,
    error: error.message,
    details: error.details,
  });
};

export const extractTables = async (req, res) => {
  try {
    const { pdfPath, documentType = 'auto' } = req.body || {};
    if (!pdfPath) {
      return res.status(400).json({ message: 'pdfPath is required' });
    }

    const result = await extractDocument({ pdfPath, documentType });
    return res.json({ message: 'Extraction completed', ...result });
  } catch (error) {
    return sendFailure(res, 'Extraction failed', error);
  }
};

export const extractInvoiceTables = async (req, res) => {
  try {
    const { pdfPath } = req.body || {};
    if (!pdfPath) {
      return res.status(400).json({ message: 'pdfPath is required' });
    }

    const result = await extractInvoiceSummary({ pdfPath });
    return res.json({ message: 'Invoice summary extracted', ...result });
  } catch (error) {
    return sendFailure(res, 'Invoice summary extraction failed', error);
  }
};

export const extractAttendanceTables = async (req, res) => {
  try {
    const { pdfPath } = req.body || {};
    if (!pdfPath) {
      return res.status(400).json({ message: 'pdfPath is required' });
    }

    const result = await extractAttendance({ pdfPath });
    return res.json({ message: 'Attendance extracted', ...result });
  } catch (error) {
    return sendFailure(res, 'Attendance extraction failed', error);
  }
};

export const generateInvoice = async (req, res) => {
  try {
    const {
      pdfPath,
      templatePath,
      signaturePath,
      stampPath,
      companyData = {},
    } = req.body || {};

    if (!pdfPath) {
      return res.status(400).json({ message: 'pdfPath is required' });
    }

    const result = await generateInvoiceFromPdf({
      pdfPath,
      templatePath,
      signaturePath,
      stampPath,
      companyData,
    });

    return res.status(201).json({ message: 'Invoice generated', ...result });
  } catch (error) {
    return sendFailure(res, 'Invoice generation failed', error);
  }
};

export const getCapabilities = async (req, res) => {
  try {
    const result = await fetchAICapabilities();
    return res.json({ message: 'Capabilities retrieved', ...result });
  } catch (error) {
    return sendFailure(res, 'Failed to retrieve capabilities', error);
  }
};
