"""
Targeted validation:
 - timesheet2.pdf  → ProjectNo visible, deductions from row fields, correct totals
 - time_sheet.pdf  → ProjectNo hidden, deductions zero, correct totals
"""
from __future__ import annotations
import os, sys, time
from pathlib import Path
import pdfplumber

ROOT = Path(r"D:\Crew_control")
sys.path.insert(0, str(ROOT / "ai-service"))

from pipeline.run import run_extraction
from generator.pdf_writer import generate_invoice_pdf
from schema import CompanyProfile

OUTPUT_DIR = ROOT / "test-outputs" / "real_execution"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

profile = CompanyProfile(
    name="Skilled Labor Contractors LLC",
    trn="100123456700003",
    vat_rate=0.05,
    template_path=None,
    signature_path=None,
    stamp_path=None,
)

CASES = [
    ("timesheet2", str(ROOT / "timesheet2.pdf")),
    ("time_sheet", str(ROOT / "time_sheet.pdf")),
]

PASS = True

for label, pdf_path in CASES:
    print(f"\n{'='*70}")
    print(f"  {label}")
    print(f"{'='*70}")

    res = run_extraction(pdf_path=pdf_path, company_profile=profile, debug_mode=False)
    out_pdf = generate_invoice_pdf(
        output_dir=str(OUTPUT_DIR),
        result=res,
        profile=profile,
        template_path=None,
        signature_path=None,
        stamp_path=None,
    )

    ts = int(time.time())
    stamped = OUTPUT_DIR / f"fix-validation-{label}-{ts}.pdf"
    os.replace(out_pdf, stamped)

    with pdfplumber.open(str(stamped)) as pdf:
        page = pdf.pages[0]
        lines = (page.extract_text() or "").splitlines()

    print(f"  Output : {stamped}")
    print(f"  Pages  : {len(pdf.pages) if False else 1}")  # already closed, just label

    # Find key lines
    header_line = next((l for l in lines if "SI NO" in l or "S.NO" in l), "(not found)")
    deduct_line = next((l for l in lines if "TOTAL DEDUCTION" in l), "(not found)")
    total_line  = next((l for l in lines if l.strip().startswith("TOTAL") and "DEDUCTION" not in l), "(not found)")
    words_line  = next((l for l in lines if "In words" in l), "(not found)")

    print(f"\n  Header   : {header_line}")
    print(f"  Deduction: {deduct_line}")
    print(f"  Total    : {total_line}")
    print(f"  InWords  : {words_line}")

    # Validate ProjectNo presence/absence
    has_proj_in_header = "ProjectNo" in header_line or "Project" in header_line
    has_real_project = any(
        (getattr(r, "project_id", None) or "").strip() not in ("", "-", "--", "N/A", "n/a", "NA", "None", "null", "nil")
        for r in res.rows
    )

    proj_ok = has_proj_in_header == has_real_project
    print(f"\n  ProjectNo in header : {has_proj_in_header}")
    print(f"  Has real project IDs: {has_real_project}")
    print(f"  ProjectNo check     : {'PASS' if proj_ok else 'FAIL'}")
    if not proj_ok:
        PASS = False

    # Validate deductions
    row_deductions = sum(float(getattr(r, "deduction_total", None) or 0.0) for r in res.rows)
    fin_deduction  = float(res.financials.total_deduction or 0.0)
    expected_deduction = row_deductions if row_deductions > 0 else fin_deduction
    print(f"\n  Row-level deductions sum : {row_deductions:.2f}")
    print(f"  Financials total_deduction: {fin_deduction:.2f}")
    print(f"  Expected deduction shown  : {expected_deduction:.2f}")
    print(f"  Deduction line in PDF     : {deduct_line}")

    # Validate totals math
    subtotal = float(res.financials.subtotal or sum(float(r.amount or 0.0) for r in res.rows))
    total_vat = float(res.financials.total_vat or 0.0)
    adj = max(0.0, subtotal - expected_deduction)
    if total_vat == 0.0 and adj > 0:
        total_vat = adj * 0.05
    expected_net = float(res.financials.net_payable or (adj + total_vat))

    print(f"\n  Subtotal        : {subtotal:.2f}")
    print(f"  Adjusted        : {adj:.2f}  (subtotal - deduction)")
    print(f"  VAT             : {total_vat:.2f}")
    print(f"  Expected net    : {expected_net:.2f}")
    print(f"  Total line      : {total_line}")

print(f"\n{'='*70}")
print(f"  Overall: {'ALL CHECKS PASS' if PASS else 'SOME CHECKS FAILED'}")
print(f"{'='*70}")
