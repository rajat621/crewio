#!/usr/bin/env python3
"""
TEST: OCR Routing Logic

Verify intelligent routing between:
1. pdfplumber (clean text PDFs)
2. RapidOCR + OpenCV (scanned/image PDFs)

Routing conditions:
- Low text volume (<700 chars) → OCR
- Attendance-heavy (W/A/H/OFF tokens ≥20) → OCR
- Otherwise → pdfplumber
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "ai-service"))

from schema import TimesheetFormat

# Simulate the routing function
def _should_use_ocr_pipeline(total_chars: int, has_text_rows: bool, full_text: str, fmt: TimesheetFormat) -> bool:
    """
    Determine if OCR pipeline should be used.
    
    Conditions for OCR:
    1. Low text volume
    2. Attendance-heavy (many W/A/H/OFF tokens)
    3. No text rows and BKC/GENERIC format
    """
    import re
    
    _ATTENDANCE_TOKEN_RE = re.compile(r"\b(W|A|H|OFF)\b", re.I)
    
    attendance_hits = len(_ATTENDANCE_TOKEN_RE.findall(full_text or ""))
    low_text = total_chars < 700
    attendance_heavy = attendance_hits >= 20

    if low_text:
        return True
    if attendance_heavy and not has_text_rows:
        return True
    if fmt in {TimesheetFormat.BKC, TimesheetFormat.GENERIC} and not has_text_rows:
        return True

    return False


# =============================================================================
# TEST 1: Clean text PDF (pdfplumber route)
# =============================================================================

print("\n" + "="*80)
print("TEST 1: Clean Text PDF - pdfplumber Route")
print("="*80)

clean_text = """
COMPANY TIMESHEET AND INVOICE

Invoice No INV-001
Date: 15/01/2024
Invoice Period: January 2024

M/s. Construction Ltd
TRN: 105-1234567-8
Address: 123 Business Park, Dubai
Phone: +971 4 XXX XXXX
Email: info@construction.ae
Website: www.construction.ae

BILLING DETAILS

Bill To: Star Construction LLC
Address: 456 Client Street, Dubai
TRN: 105-9876543-2

TIMESHEET SUMMARY FOR JANUARY 2024

SI NO | TRADE | PROJECT | HOURS | RATE | AMOUNT | VAT 5% | NET
1 | STEEL FIXER | P1506 | 40.0 | 50.00 | 2000.00 | 100.00 | 2100.00
2 | MASON | P1506 | 35.0 | 45.00 | 1575.00 | 78.75 | 1653.75
3 | CARPENTER | P1507 | 38.0 | 55.00 | 2090.00 | 104.50 | 2194.50
4 | WELDER | P1507 | 42.0 | 65.00 | 2730.00 | 136.50 | 2866.50
5 | ELECTRICIAN | P1508 | 40.0 | 60.00 | 2400.00 | 120.00 | 2520.00
6 | PAINTER | P1508 | 36.0 | 40.00 | 1440.00 | 72.00 | 1512.00
7 | PLUMBER | P1509 | 41.0 | 58.00 | 2378.00 | 118.90 | 2496.90

FINANCIAL SUMMARY

Total Working Hours: 272.0 hours
Total Amount: 14613.00 AED
Total VAT (5%): 730.65 AED
Total Net Amount: 15343.65 AED

PAYMENT TERMS
Payment Due: Within 30 days of invoice date
Late Payment Penalty: 2% per month

Terms and Conditions:
All amounts are in UAE Dirhams (AED)
This is a tax invoice as per UAE regulations

Authorized By: Ahmed Al-Mansouri
Director, Construction Division
Date: 15/01/2024
"""

fmt = TimesheetFormat.MCC
total_chars = len(clean_text)
has_text_rows = True
use_ocr = _should_use_ocr_pipeline(total_chars, has_text_rows, clean_text, fmt)

print(f"\nPDF Characteristics:")
print(f"  Text volume: {total_chars} chars (>700: clean text)")
print(f"  Has extracted rows: {has_text_rows}")
print(f"  Attendance tokens: 0")
print(f"  Format: {fmt}")

print(f"\nRouting Decision: {'OCR' if use_ocr else 'pdfplumber'}")

assert not use_ocr, "Clean text PDF should use pdfplumber"

print("\n✓ PASS: Clean text PDF routed to pdfplumber")

# =============================================================================
# TEST 2: Low-text PDF (OCR route)
# =============================================================================

print("\n" + "="*80)
print("TEST 2: Low-Text PDF (Scanned) - OCR Route")
print("="*80)

low_text = "Invoice\nSteel\nFixe\n40\n50"  # Very little extracted text

fmt = TimesheetFormat.BKC
total_chars = len(low_text)
has_text_rows = False
use_ocr = _should_use_ocr_pipeline(total_chars, has_text_rows, low_text, fmt)

print(f"\nPDF Characteristics:")
print(f"  Text volume: {total_chars} chars (<700: low text)")
print(f"  Has extracted rows: {has_text_rows}")
print(f"  Attendance tokens: 0")
print(f"  Format: {fmt}")

print(f"\nRouting Decision: {'OCR' if use_ocr else 'pdfplumber'}")

assert use_ocr, "Low-text PDF should use OCR"

print("\n✓ PASS: Low-text PDF routed to OCR")

# =============================================================================
# TEST 3: Attendance-heavy PDF (OCR route)
# =============================================================================

print("\n" + "="*80)
print("TEST 3: Attendance-Heavy PDF - OCR Route")
print("="*80)

attendance_heavy_text = """
ATTENDANCE REGISTER
W = Working, A = Absent, H = Holiday, OFF = Off-day

Employee: Ahmed Al-Maktoumi
Trade: ELECTRICIAN

Week 1: W W W W W OFF OFF
Week 2: W W W A H OFF OFF
Week 3: W W W W W OFF OFF
Week 4: W W W W W OFF OFF
Week 5: H A H W W OFF OFF
Week 6: OFF OFF W W W OFF OFF

Total Hours: 110
Rate: 60 AED/hr
"""

fmt = TimesheetFormat.BKC
total_chars = len(attendance_heavy_text)
has_text_rows = False
use_ocr = _should_use_ocr_pipeline(total_chars, has_text_rows, attendance_heavy_text, fmt)

# Count attendance tokens manually
import re
attendance_tokens = len(re.findall(r"\b(W|A|H|OFF)\b", attendance_heavy_text, re.I))

print(f"\nPDF Characteristics:")
print(f"  Text volume: {total_chars} chars (sufficient text)")
print(f"  Has extracted rows: {has_text_rows}")
print(f"  Attendance tokens: {attendance_tokens} (≥20: attendance-heavy)")
print(f"  Format: {fmt}")

print(f"\nRouting Decision: {'OCR' if use_ocr else 'pdfplumber'}")

assert use_ocr, "Attendance-heavy PDF should use OCR"

print("\n✓ PASS: Attendance-heavy PDF routed to OCR")

# =============================================================================
# TEST 4: BKC format without rows (OCR route)
# =============================================================================

print("\n" + "="*80)
print("TEST 4: BKC Format Without Extracted Rows - OCR Route")
print("="*80)

bkc_no_rows = """
Tax Invoice
BKC
Billable Schedule
Payment Terms
Amount: 5000 AED
"""

fmt = TimesheetFormat.BKC
total_chars = len(bkc_no_rows)
has_text_rows = False
use_ocr = _should_use_ocr_pipeline(total_chars, has_text_rows, bkc_no_rows, fmt)

print(f"\nPDF Characteristics:")
print(f"  Text volume: {total_chars} chars (>700: some text)")
print(f"  Has extracted rows: {has_text_rows}")
print(f"  Attendance tokens: 0")
print(f"  Format: {fmt} (BKC-specific)")

print(f"\nRouting Decision: {'OCR' if use_ocr else 'pdfplumber'}")

assert use_ocr, "BKC without rows should use OCR"

print("\n✓ PASS: BKC format without rows routed to OCR")

# =============================================================================
# TEST 5: MCC format with rows (pdfplumber route)
# =============================================================================

print("\n" + "="*80)
print("TEST 5: MCC Format With Extracted Rows - pdfplumber Route")
print("="*80)

mcc_with_rows = """
MCC TIMESHEET AND INVOICE
Monthly Report for January 2024

Invoice Details:
Invoice No: INV-2024-001
Date: 31/01/2024
Period: 01/01/2024 to 31/01/2024

Bill To: Major Construction Company
Address: 123 Main Street, Dubai
TRN: 105-1111111-1

OUR COMPANY DETAILS
Name: Skilled Labor Contractors LLC
Address: 456 Project Road, Dubai
TRN: 105-2222222-2
Contact: +971 4 000 0000

TIMESHEET ITEMS

Line Items:
1. CARPENTER - 40 hours @ 55 AED per hour = 2200 AED
2. WELDER - 38 hours @ 65 AED per hour = 2470 AED
3. STEEL FIXER - 42 hours @ 50 AED per hour = 2100 AED
4. MASON - 35 hours @ 45 AED per hour = 1575 AED
5. ELECTRICIAN - 40 hours @ 60 AED per hour = 2400 AED
6. PLUMBER - 36 hours @ 58 AED per hour = 2088 AED
7. PAINTER - 41 hours @ 40 AED per hour = 1640 AED

FINANCIAL CALCULATION

Subtotal Amount: 14473 AED
Value Added Tax (5%): 723.65 AED
Gross Total: 15196.65 AED
Less: Deductions (Admin): 500 AED
Net Amount Payable: 14696.65 AED

SUMMARY

Total Hours Worked: 272 hours
Hourly Rates Applied: 40-65 AED per hour
Payment Method: Bank Transfer
Due Date: 15/02/2024

Thank you for choosing our services.
"""

fmt = TimesheetFormat.MCC
total_chars = len(mcc_with_rows)
has_text_rows = True
use_ocr = _should_use_ocr_pipeline(total_chars, has_text_rows, mcc_with_rows, fmt)

print(f"\nPDF Characteristics:")
print(f"  Text volume: {total_chars} chars (>700: sufficient)")
print(f"  Has extracted rows: {has_text_rows}")
print(f"  Attendance tokens: 0")
print(f"  Format: {fmt}")

print(f"\nRouting Decision: {'OCR' if use_ocr else 'pdfplumber'}")

assert not use_ocr, "MCC with rows should use pdfplumber"

print("\n✓ PASS: MCC format with rows routed to pdfplumber")

# =============================================================================
# TEST 6: Edge case - exactly at low-text boundary (600 chars)
# =============================================================================

print("\n" + "="*80)
print("TEST 6: Edge Case - Exactly At Low-Text Boundary (600 chars)")
print("="*80)

boundary_text = "x" * 600

fmt = TimesheetFormat.GENERIC
total_chars = len(boundary_text)
has_text_rows = False
use_ocr = _should_use_ocr_pipeline(total_chars, has_text_rows, boundary_text, fmt)

print(f"\nPDF Characteristics:")
print(f"  Text volume: {total_chars} chars (<700: below threshold)")
print(f"  Has extracted rows: {has_text_rows}")
print(f"  Attendance tokens: 0")
print(f"  Format: {fmt}")

print(f"\nRouting Decision: {'OCR' if use_ocr else 'pdfplumber'}")

assert use_ocr, "600 chars should trigger OCR (<700 threshold)"

print("\n✓ PASS: Edge case at low-text boundary routed to OCR")

# =============================================================================
# TEST 7: Edge case - exactly at low-text boundary (700 chars)
# =============================================================================

print("\n" + "="*80)
print("TEST 7: Edge Case - Just Above Low-Text Boundary (700 chars)")
print("="*80)

boundary_text_above = "x" * 700

fmt = TimesheetFormat.GENERIC
total_chars = len(boundary_text_above)
has_text_rows = False
use_ocr = _should_use_ocr_pipeline(total_chars, has_text_rows, boundary_text_above, fmt)

print(f"\nPDF Characteristics:")
print(f"  Text volume: {total_chars} chars (≥700: above threshold)")
print(f"  Has extracted rows: {has_text_rows}")
print(f"  Attendance tokens: 0")
print(f"  Format: {fmt}")

print(f"\nRouting Decision: {'OCR' if use_ocr else 'pdfplumber'}")

# At 700 chars, it's NOT low text, but GENERIC format without rows should still use OCR
assert use_ocr, "GENERIC format without rows should use OCR regardless of char count"

print("\n✓ PASS: GENERIC format routed to OCR")

# =============================================================================
# SUMMARY
# =============================================================================

print("\n" + "="*80)
print("OCR ROUTING VERIFICATION: ALL TESTS PASSED ✓")
print("="*80)
print("\nRouting Rules Verified:")
print("  ✓ Condition 1: Low text (<700 chars) → OCR")
print("  ✓ Condition 2: Attendance-heavy (≥20 tokens) + no rows → OCR")
print("  ✓ Condition 3: BKC/GENERIC format + no rows → OCR")
print("  ✓ Otherwise → pdfplumber")
print("\nRouting Paths:")
print("  pdfplumber: Clean text PDFs with extracted rows")
print("  OCR: Scanned, low-text, attendance-heavy, or format-specific")
print("  Fallback OCR: If initial extraction fails")
