import { Invoice } from '../models/Invoice.js';
import Company from '../models/Company.js';
import { extractDocument, generateInvoiceFromPdf } from '../services/extraction.service.js';
import fs from 'fs';
import path from 'path';

const toAbsoluteStoragePath = (inputPath) => {
  if (!inputPath || typeof inputPath !== 'string') {
    return inputPath;
  }

  if (inputPath.startsWith('/')) {
    return path.resolve(process.cwd(), `src/storage${inputPath}`);
  }

  return inputPath;
};

export const getInvoices = async (req, res) => {
  try {
    const items = await Invoice.find({}).sort({ createdAt: -1 });
    res.json({
      message: 'Invoices retrieved',
      data: items,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch invoices', error: error.message });
  }
};

export const getInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json({ data: invoice });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch invoice', error: error.message });
  }
};

const buildInvoicePayload = (body) => {
  const invoiceNumber = body.invoiceNumber || `INV-${Date.now()}`;
  return {
    ...body,
    invoiceNumber,
    clientName: body.clientName || body.client?.name || 'Unknown Client',
    company: body.company || body.companyId || body.clientCompanyId,
    tax: typeof body.vatRate === 'number' ? body.vatRate : body.tax,
    pdfUrl: body.timesheetPath || body.pdfUrl,
  };
};

export const createInvoice = async (req, res) => {
  try {
    const payload = buildInvoicePayload(req.body);
    if (!payload.company) {
      return res.status(400).json({ message: 'company/companyId is required' });
    }

    if (!payload.clientName || payload.clientName === 'Unknown Client') {
      const company = await Company.findById(payload.company).select('name');
      if (company?.name) {
        payload.clientName = company.name;
      }
    }

    // Get company data including template, logo, etc.
    const company = await Company.findById(payload.company);
    if (!company) {
      return res.status(400).json({ message: 'Company not found' });
    }

    // Create invoice first
    const created = await Invoice.create(payload);

    // Try to regenerate PDF from timesheet with invoice number and date
    if (payload.pdfUrl) {
      const filePath = toAbsoluteStoragePath(payload.pdfUrl);
      
      if (fs.existsSync(filePath)) {
        try {
          const companyData = {
            name: company.name || 'Company',
            companyLegalName: company.companyLegalName || company.name || 'Company',
            trn: company.trn || '-',
            vatRate: payload.tax || 5,
            invoiceNumber: created.invoiceNumber,
            invoiceDate: created.invoiceDate ? created.invoiceDate.toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'),
            clientName: created.clientName,
            address: company.address || '',
            city: company.city || '',
            contactEmail: company.contactEmail || '',
            mobileNumber: company.mobileNumber || '',
            websiteLink: company.websiteLink || '',
            logoPath: toAbsoluteStoragePath(company.logo || null),
          };

          const generatedResponse = await generateInvoiceFromPdf({
            pdfPath: filePath,
            templatePath: toAbsoluteStoragePath(company.invoiceTemplate || null),
            signaturePath: toAbsoluteStoragePath(company.signature || null),
            stampPath: toAbsoluteStoragePath(company.stamp || null),
            companyData,
          });

          // Update invoice with generated PDF path
          if (generatedResponse.invoice_path) {
            created.pdfUrl = generatedResponse.invoice_path;
            await created.save();
          }
        } catch (error) {
          console.error('PDF generation error:', error);
          // Continue even if PDF generation fails
        }
      }
    }

    res.status(201).json({
      message: 'Invoice created',
      data: created,
      invoice: created,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create invoice', error: error.message });
  }
};

export const generateInvoiceRecord = async (req, res) => {
  return createInvoice(req, res);
};

export const updateInvoice = async (req, res) => {
  try {
    const updated = await Invoice.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json({ message: 'Invoice updated', data: updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update invoice', error: error.message });
  }
};

export const deleteInvoice = async (req, res) => {
  try {
    const deleted = await Invoice.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete invoice', error: error.message });
  }
};

export const downloadInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Get the PDF path from the invoice
    const pdfPath = invoice.pdfUrl;
    
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      return res.status(404).json({ message: 'Invoice PDF not found' });
    }

    // Serve the PDF file
    res.setHeader('Content-Type', 'application/pdf');
    
    // Check if user wants inline view vs download
    const inline = req.query.inline === '1' || req.query.inline === 'true';
    if (inline) {
      res.setHeader('Content-Disposition', `inline; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    }

    const pdfData = fs.readFileSync(pdfPath);
    return res.send(pdfData);
  } catch (error) {
    res.status(500).json({ message: 'Failed to download invoice', error: error.message });
  }
};
