# AI Service for Crew Control

This is the AI service responsible for extracting data from PDFs and generating invoices.

## Installation

```bash
pip install -r requirements.txt
```

## Running the Service

```bash
python main.py
```

The service will start on `http://localhost:8001`

## Endpoints

### GET /health
Health check endpoint

### POST /generate-invoice
Generate invoice from PDF
- Parameters:
  - `pdf_path`: Path to the timesheet PDF
  - `template_path`: Path to invoice template
  - `signature_path`: Path to signature image
  - `stamp_path`: Path to stamp image
  - `company_data`: Company information

### POST /extract
Extract data from uploaded PDF
- Parameters:
  - `file`: PDF file to extract data from
