# AI Invoice and Salary Slip Implementation Notes

## Goal
Build a fast, production-ready AI/PDF module that can:
- Inspect any uploaded PDF page-by-page
- Detect the correct table even when the table format changes
- Handle missing fields like `projectId`
- Generate a tax invoice PDF in the same layout as the user template
- Reuse attendance and employee data later for salary slip generation

## What The Sample PDFs Show

### 1) `Invoice 8 (1).pdf`
- Page 1 is the final invoice layout the user wants to reproduce.
- Page 2 contains a detailed timesheet-style table with day-by-day attendance marks and employee rows.
- Page 3 contains a compact summary table with columns like `TRADE`, `PROJECT`, `HOUR`, `RATE`, `AMOUNT`, and `TOTAL AMOUNT (AED)`.
- This PDF proves the module must support both detailed attendance tables and summary tables in the same file.

### 2) `timesheet.pdf`
- The PDF has no useful text layer from normal extraction.
- This means the file is likely scanned or image-based.
- OCR fallback is required for production.

### 3) `INVOICE BKC OCT.pdf`
- Page 1 is the invoice cover/layout.
- Page 2 is the summary table.
- This is similar to the first file and confirms that the final invoice should be generated from extracted table data, not from one fixed table shape.

## Main Extraction Rules

### Tax Invoice Extraction
The AI module should search every page for table candidates that match one of these patterns:
- Detailed timesheet grid with employee-wise daily attendance
- Summary table with trade, project id, hour, rate, amount, VAT, total amount, net amount
- Invoice footer totals with gross total, deductions, and net payable amount

The module should accept missing `projectId` and still extract the row by using the rest of the row fields.

### Salary Slip Extraction
For salary generation, the module should focus on tables that contain:
- Employee ID
- Employee name
- Trade
- Day-wise attendance codes or hours
- Total hours
- Rate
- Deductions
- Net amount payable

If the PDF contains multiple tables, the module should select the best table by matching the required salary fields instead of assuming the first table is correct.

## Recommended AI Pipeline

1. Read PDF pages one by one.
2. Try direct text extraction first.
3. If a page has low or empty text, run OCR on that page.
4. Detect table regions using:
   - keyword matching on headers
   - line density and grid structure
   - repeated row patterns
5. Normalize column names using synonyms.
6. Parse each row into a structured schema.
7. Run deterministic calculations for totals, VAT, deductions, and net amounts.
8. Render the final PDF using the user’s company template, signature, and stamp.

## Suggested Column Synonyms

### Invoice / Timesheet Summary
- `projectId`: `PROJECT`, `PROJECT ID`, `Project No.`, `ProjecNo.`
- `employeeId`: `EMPLOYEE ID`, `ID NO`, `ID NO.`
- `employeeName`: `EMPLOYEE NAME`, `NAME`
- `trade`: `TRADE`
- `hours`: `HOUR`, `HOURS`, `TOTAL`, `NO.OF HOURS`
- `rate`: `RATE`, `UNIT PRICE`, `Unit Price`
- `amount`: `AMOUNT`, `TOTAL AMOUNT (AED)`, `TOTAL AMOUNT`
- `vat`: `VAT`
- `vatAmount`: `VAT AMOUNT`, `VATAMOUNT`
- `netAmount`: `NET AMOUNT`, `NET AMOUNT PAYABLE`, `NETAMOUNT`

### Salary Slip
- `attendance`: day-wise cells with codes such as `W`, `A`, `H`, numeric hours, or blank cells
- `deductions`: `ABSENT PENALTY`, `Safety Items`, `Other Deduction`, `Gas Deduction`
- `grossTotal`: `GROSS TOTAL`, `TOTAL`
- `netPayable`: `NET AMOUNT PAYABLE`, `NET SALARY`

## Final Tax Invoice Output

The final generated PDF should match the user’s chosen template, especially the first page style from the sample invoice:
- company header and branding
- invoice title and invoice number/date
- customer/company details
- centered period label
- summary table
- totals section
- amount in words
- signature and stamp area

The data for these fields should come from onboarding/company profile:
- company name
- company address
- TRN
- contact details
- invoice template image
- signature image
- stamp image
- VAT settings
- preferred invoice labels

## Backend Integration Contract

The backend should send the AI module:
- `pdf_path`
- `template_path`
- `signature_path`
- `stamp_path`
- `company_data`
- `document_type` such as `tax_invoice` or `salary_slip`

The AI module should return:
- extracted structured data
- calculated totals
- selected table metadata
- generated PDF path
- error details when the page does not contain a valid table

## Production Notes

- Prefer deterministic parsing and calculations over LLM-only extraction.
- Use OCR only when text extraction fails or the table is image-only.
- Keep table detection modular so new table layouts can be added without rewriting the full pipeline.
- Make table matching tolerant of missing columns and alternate spellings.
- Keep invoice generation template-driven so the output can match the user’s branded PDF exactly.

## Current Priority

1. Finish tax invoice table extraction for varied layouts.
2. Add salary slip extraction from employee attendance tables.
3. Wire the extraction result into the backend invoice generation flow.
4. Expose a clean frontend/backend integration path for uploads, template selection, and final PDF download.

## Implementation Status (Phase Update)

### Completed in this phase

- Implemented hybrid extraction core in `ai-service/pipeline.py`:
   - text-first extraction via `PyPDF2`
   - OCR fallback per page (when page text is weak) using `pdf2image` + `pytesseract` when available
   - page-wise table type classification (`invoice_summary`, `attendance`, `unknown`)
   - tolerant parsing where `project_id` is optional
   - attendance-to-invoice aggregation fallback when summary rows are missing

- Implemented validation scoring in `ai-service/validation.py`:
   - confidence score and extraction checks

- Implemented standardized response contracts in `ai-service/contracts.py`.

- Implemented template-driven PDF generation in `ai-service/pdf_generator.py`:
   - optional template background from image or first page of PDF
   - optional signature/stamp overlay

- Wired Flask endpoints in `ai-service/main.py`:
   - `POST /extract`
   - `POST /extract/invoice-summary`
   - `POST /extract/attendance`
   - `POST /generate-invoice`

- Added backend reusable AI proxy integration:
   - `backend/src/routes/ai.routes.js`
   - `backend/src/controllers/ai.controller.js`
   - `backend/src/services/extraction.service.js` (real HTTP client implementation)
   - `backend/src/app.js` mounted route at `/api/ai`
   - `backend/src/config/env.js` added `AI_SERVICE_URL` and `AI_SERVICE_TIMEOUT_MS`

### New Backend API Surface

- `POST /api/ai/extract`
   - body: `{ pdfPath, documentType }`

- `POST /api/ai/extract/invoice-summary`
   - body: `{ pdfPath }`

- `POST /api/ai/extract/attendance`
   - body: `{ pdfPath }`

- `POST /api/ai/generate-invoice`
   - body: `{ pdfPath, templatePath, signaturePath, stampPath, companyData }`

### Notes

- `project_id` is now optional in parsing logic.
- OCR path is optional-capability: extraction still runs with text-only mode when OCR dependencies are unavailable.