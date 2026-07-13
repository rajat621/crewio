# Tax Invoice AI Module - Technical Specifications

**Project**: Crew Control - Tax Invoice Generation System
**Date**: May 4, 2026
**Status**: Development

---

## 📋 Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Data Flow](#data-flow)
4. [AI Module Specifications](#ai-module-specifications)
5. [PDF Generation Template](#pdf-generation-template)
6. [Company Profile Data Requirements](#company-profile-data-requirements)
7. [Integration Points](#integration-points)
8. [Error Handling](#error-handling)
9. [Production Deployment](#production-deployment)

---

## 🎯 Overview

The Tax Invoice AI Module is a production-ready Python service that:
- **Extracts** line items from timesheet PDFs (multi-table detection)
- **Validates** extracted data against business rules
- **Generates** formatted tax invoice PDFs with company branding
- **Integrates** seamlessly with Node.js backend and React frontend

### Supported Use Cases
1. **Tax Invoice Generation** - Extract timesheet data + generate invoice PDF
2. **Salary Slip Generation** (future) - Extract employee attendance + generate salary slip
3. **Data Extraction Only** - Return structured JSON for external processing

---

## 🏗️ System Architecture

```
Frontend (React)
    ↓ (Upload timesheet PDF + form data)
Backend (Node.js)
    ↓ (Save PDF + call AI service)
AI Service (Python/FastAPI)
    ├─ Table Detection (Camelot)
    ├─ Data Extraction
    ├─ Data Validation
    ├─ PDF Generation (ReportLab/weasyprint)
    └─ Return: JSON + PDF path
    ↓
Backend (Invoice Service)
    ├─ Save to MongoDB
    ├─ Store PDF path
    └─ Return to Frontend
    ↓
Frontend (Success Screen)
    └─ Download/Preview PDF
```

---

## 📊 Data Flow

### Step 1: User Submits Form
```javascript
// Frontend sends:
{
  companyId: "123",
  timesheetFile: File,
  invoiceDate: "DD.MM.YYYY",
  vatRate: 5 // percentage
}
```

### Step 2: Backend Uploads & Calls AI
```javascript
// Backend:
1. Saves PDF to: backend/src/storage/invoices/uploads/
2. Calls AI service:
   POST http://localhost:8001/generate-invoice
   {
     pdf_path: "/path/to/timesheet.pdf",
     company_id: "123",
     vat_rate: 0.05,
     invoice_date: "DD.MM.YYYY"
   }
```

### Step 3: AI Module Processing
```python
# AI Service:
1. Read PDF from disk
2. Detect all tables in PDF
3. Identify TAX INVOICE table:
   - Must have columns: TRADE, PROJECT, HOUR, RATE, AMOUNT
   - Project may be optional
4. Extract rows and validate
5. Fetch company details from backend
6. Generate invoice PDF with company branding
7. Save PDF to disk
8. Return response:
   {
     status: "success",
     extracted_data: [...],
     pdf_path: "/path/to/generated/invoice.pdf",
     invoice_number: "INV-001",
     summary: { subtotal, vat, total }
   }
```

### Step 4: Backend Stores Invoice
```javascript
// Backend creates Invoice document in MongoDB:
{
  invoiceNumber: "INV-001",
  companyId: "123",
  invoiceDate: Date,
  vatRate: 0.05,
  subtotal: 23603.75,
  vatAmount: 1180.19,
  total: 24783.94,
  items: [...],
  timesheetPath: "/uploads/timesheet.pdf",
  filePath: "/invoices/INV-001.pdf",
  status: "generated"
}
```

---

## 🤖 AI Module Specifications

### Endpoints

#### 1. `POST /extract` (Data Extraction Only)
Extract data without PDF generation
```
Request:
{
  pdf_path: string (absolute path to PDF)
}

Response:
{
  status: "success" | "error",
  rows: [
    {
      trade: string,
      project: string | null,
      hours: float,
      rate: float,
      amount: float
    }
  ],
  message: string (if error)
}
```

#### 2. `POST /generate-invoice` (Full Generation)
Extract data + generate invoice PDF
```
Request:
{
  pdf_path: string,
  company_id: string,
  vat_rate: float (0.05 = 5%),
  invoice_date: string "DD.MM.YYYY",
  invoice_number: string (optional, auto-generated if not provided)
}

Response:
{
  status: "success" | "error",
  invoice_number: string,
  pdf_path: string (absolute path to generated PDF),
  extracted_data: [...],
  summary: {
    subtotal: float,
    vat_amount: float,
    total: float
  },
  message: string (if error)
}
```

### Table Detection Logic

**Objective**: Find the TAX INVOICE line items table in a multi-table PDF

**Algorithm**:
```
For each table in PDF:
  1. Extract header row
  2. Normalize column names (uppercase, strip whitespace)
  3. Check if table contains ALL of: TRADE, HOUR, RATE, AMOUNT
   4. Check if table contains at least 2 data rows
  5. If found → This is the invoice table
  6. If multiple matches → Use the one with most rows

If no table found:
  → Raise ValueError("No valid invoice table found in PDF")
```

**Expected Columns** (case-insensitive):
- `TRADE` - Job role (STEEL FIXER, MASON, etc.)
- `PROJECT` - Project code (optional, but recommended)
- `HOUR` or `NO.HOURS` - Hours worked (integer/float)
- `RATE` - Hourly rate in AED (float)
- `AMOUNT` - Calculated amount (float)

**Sample Valid Header Variations**:
- `S.NO | TRADE | PROJECT.NO. | NO.OFHOURS | UNIT RATE | AMOUNT | ...`
- `TRADE | PROJECT | HOURS | RATE | AMOUNT`
- `No | Trade | Proj | Hr | Rate | Amt`

---

## 📄 PDF Generation Template

### Invoice Structure

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  [Company Logo]  [Arabic Header]  [Company Logo]       │
│  COMPANY NAME                                           │
│  Tagline/Motto                                          │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Tax Invoice                                            │
│  Invoice No. XXX          Date: DD.MM.YYYY              │
│                                                         │
│  Company Details:                                       │
│  M/s. COMPANY NAME                                      │
│  PO Box XXXXX                                           │
│  Tel No XXXXXXXXX                                       │
│  Fax No XXXXXXX                                         │
│  Address                                                │
│  TRN: XXXXXXXXXXXXXXXX                                  │
│                                                         │
│  Invoice for the month of: MONTH YEAR                  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Line Items Table:                                      │
│  ┌──┬──────────┬────────┬───────┬────────┬────────┬─────────┐
│  │S │TRADE     │PROJECT │HOURS  │RATE    │AMOUNT  │VAT/NET  │
│  ├──┼──────────┼────────┼───────┼────────┼────────┼─────────┤
│  │1 │STEEL...  │P1506   │50     │9.5     │475.00  │499.75   │
│  │2 │STEEL...  │P960    │168    │9.5     │1596.00 │1675.80  │
│  └──┴──────────┴────────┴───────┴────────┴────────┴─────────┘
│                                                         │
│  TOTAL DEDUCTION       AED 818.96                       │
│  TOTAL                 AED 22786.29                     │
│  In words: Twenty Two Thousand Seven Hundred...        │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Thanks and Regards                                     │
│  [COMPANY NAME]                                         │
│                                                         │
│  [Signature/Stamp Area]                                 │
│                                                         │
│  Footer: Contact info, web, TRN                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### PDF Styling
- **Font**: Arial / Segoe UI for English, Arabic fonts for Arabic text
- **Colors**: Company brand colors (from template)
- **Layout**: A4 size (210mm × 297mm)
- **DPI**: 300 (for print quality)
- **Header**: Company logo + branding (provided by user)
- **Footer**: Company contact info + TRN
- **Tables**: Professional formatting with borders/shading

---

## 🏢 Company Profile Data Requirements

The following data must be stored in Company model for invoice generation:

```javascript
// Additional fields to add to Company schema
{
  // ... existing fields
  
  // Invoice Branding
  logoPath: String,              // Path to company logo image
  templatePath: String,          // Path to invoice template (if custom)
  
  // Invoice Details
  arabicName: String,            // Arabic company name
  englishName: String,           // English company name
  poBox: String,                 // P.O. Box number
  telephoneNumber: String,       // Main phone
  faxNumber: String,             // Fax number
  trn: String,                   // Tax Registration Number (TRN)
  address: String,               // Full address
  email: String,                 // Company email
  website: String,               // Company website
  
  // Invoice Signature
  signaturePath: String,         // Path to signature image
  stampPath: String,             // Path to company stamp image
  
  // Invoice Settings
  invoicePrefix: String,         // e.g., "INV", "TI"
  nextInvoiceNumber: Number,     // For auto-incrementing
  defaultVatRate: Number,        // Default VAT % (5, 10, etc.)
  invoiceMonth: String,          // For "Invoice for month of..."
  bankDetails: String,           // Bank account info (optional)
  paymentTerms: String,          // Payment terms (optional)
  notes: String                  // Additional notes on invoice
}
```

---

## 🔗 Integration Points

### 1. Frontend → Backend
```javascript
// File: crewcontrol-fron/src/api/invoices.js
generateInvoiceRecord({
  companyId,
  timesheetPath,
  vatRate,
  invoiceDate
})
```

### 2. Backend → AI Service
```javascript
// File: backend/src/services/invoice.service.js
const extractInvoiceData = async (timesheetPath, companyId, vatRate, invoiceDate) => {
  const AI_URL = process.env.AI_SERVICE_URL || "http://localhost:8001";
  
  const response = await axios.post(`${AI_URL}/generate-invoice`, {
    pdf_path: timesheetPath,
    company_id: companyId,
    vat_rate: vatRate,
    invoice_date: invoiceDate,
    invoice_number: generateInvoiceNumber()
  });
  
  return response.data;
};
```

### 3. AI Service → Backend (Callback)
Optional: AI service can POST back to backend to:
- Fetch company details
- Store generated PDF metadata
- Update invoice status

---

## ⚠️ Error Handling

### Frontend Error Messages
```javascript
// User-friendly error messages
"Invalid PDF format"
"No timesheet data found in PDF"
"Unable to extract line items - check PDF structure"
"PDF generation failed - try again"
"File size too large (max 5MB)"
```

### Backend Error Handling
```javascript
try {
  const result = await invoicesApi.generateInvoiceRecord(data);
} catch (error) {
  if (error.response?.status === 400) {
    // Invalid data
    showError("Invalid data in PDF - check format");
  } else if (error.response?.status === 404) {
    // Company not found
    showError("Company not found");
  } else if (error.response?.status === 500) {
    // AI service error
    showError("Server error - please try again");
  } else {
    showError("Failed to generate invoice");
  }
}
```

### AI Service Error Responses
```python
# Status codes
200 ✓ Success
400 ✗ Invalid input / No table found / Invalid PDF
404 ✗ Company not found
422 ✗ Validation failed (missing fields)
500 ✗ Server error / PDF generation failed

# Error response format
{
  "status": "error",
  "code": "NO_TABLE_FOUND" | "INVALID_PDF" | "VALIDATION_ERROR" | "PDF_GEN_ERROR",
  "message": "Human-readable error message"
}
```

---

## 🚀 Production Deployment

### AI Service Setup
```bash
# Install dependencies
pip install fastapi uvicorn camelot-py[cv] pydantic reportlab

# Run service
uvicorn main:app --host 0.0.0.0 --port 8001

# Docker (optional)
docker build -t crew-control-ai .
docker run -p 8001:8001 crew-control-ai
```

### Backend Configuration
```javascript
// .env
AI_SERVICE_URL=http://localhost:8001  // local dev
// or
AI_SERVICE_URL=http://ai-service:8001  // docker
```

### File Storage
```
backend/src/storage/
├── invoices/
│   ├── uploads/          // Uploaded timesheet PDFs
│   ├── generated/        // Generated invoice PDFs
│   └── templates/        // Company invoice templates
└── employees/
    ├── avatars/
    └── documents/
```

### Performance Expectations
- PDF extraction: 1-3 seconds
- Data validation: < 500ms
- PDF generation: 1-2 seconds
- Total time: 3-6 seconds per invoice

---

## 📝 Implementation Checklist

### Phase 1: AI Module
- [ ] Update `extractor.py` - multi-table detection
- [ ] Create `validator.py` - data validation
- [ ] Update `main.py` - new `/generate-invoice` endpoint
- [ ] Add `requirements.txt` - PDF generation library
- [ ] Error handling and logging

### Phase 2: Backend
- [ ] Update Company model - new fields
- [ ] Update invoice.service.js - call new AI endpoint
- [ ] Create pdf.service.js - PDF handling utilities
- [ ] Update invoice controller - error handling

### Phase 3: Frontend
- [ ] Update form to collect invoice month
- [ ] Update success screen - preview/download links
- [ ] Add error messages display
- [ ] Test complete flow

### Phase 4: Testing & Deployment
- [ ] Unit tests for AI extraction
- [ ] Integration tests for full flow
- [ ] Performance testing (PDF generation time)
- [ ] Production deployment checklist

---

## 🔄 Future Features

1. **Salary Slip Generation** - Extract employee attendance data
2. **Batch Invoice Generation** - Generate multiple invoices
3. **Invoice Template Editor** - UI to customize invoice design
4. **OCR Support** - Extract data from scanned/image PDFs
5. **Email Delivery** - Auto-send invoices via email
6. **Invoice Tracking** - Dashboard showing all invoices

---

## 📞 Support & Questions

For implementation questions or issues:
1. Check error logs in AI service console
2. Verify PDF format matches expected structure
3. Ensure company profile has all required fields
4. Check file permissions in storage directory

