<<<<<<< HEAD
﻿"""
pipeline.py  –  Orchestration layer for the invoice generation pipeline.

This replaces the old regex-based pipeline. It delegates to:
    extractor.py         – universal timesheet data extraction (deterministic + Ollama local)
=======
"""
pipeline.py  –  Orchestration layer for the invoice generation pipeline.

This replaces the old regex-based pipeline. It delegates to:
  extractor.py         – universal timesheet data extraction (pdfplumber + Claude Vision)
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
  invoice_generator.py – layout-aware PDF generation

Public API
----------
run_pipeline(pdf_path, company_data, output_dir, **asset_paths) -> dict
    Full end-to-end: extract → validate → generate.

extract_only(pdf_path, api_key=None) -> dict
    Just extract; useful for previewing data before generating.

get_ocr_capabilities() -> dict
    Compatibility shim for existing /capabilities endpoint.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Capability report  (legacy compat)
# ---------------------------------------------------------------------------

def get_ocr_capabilities() -> Dict[str, bool]:
    try:
        from pdf2image import convert_from_path  # noqa: F401
        pdf2image_ok = True
    except ImportError:
        pdf2image_ok = False
    try:
        import pytesseract  # noqa: F401
        tesseract_ok = True
    except ImportError:
        tesseract_ok = False
    return {
        "ocr_available":       pdf2image_ok and tesseract_ok,
        "tesseract_available": tesseract_ok,
        "pdf2image_available": pdf2image_ok,
<<<<<<< HEAD
        "vision_api":          False,
        "local_ollama":        True,
=======
        "vision_api":          True,
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    }


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_extraction(data: Dict[str, Any]) -> bool:
    rows = data.get("rows", [])
    if not rows:
        return False
    return any(
        isinstance(r, dict) and str(r.get("trade") or "").strip()
        and r.get("hours") is not None
        for r in rows
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_only(pdf_path: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    """Run extraction only (no PDF generation)."""
    from extractor import extract_timesheet
    return extract_timesheet(pdf_path, api_key=api_key)


def run_pipeline(
    pdf_path: str,
    company_data: Dict[str, Any],
    output_dir: str,
    template_path: Optional[str] = None,
    signature_path: Optional[str] = None,
    stamp_path: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Full pipeline: extract timesheet data -> validate -> generate tax invoice PDF.
    """
    logger.info("Pipeline: extracting %s", pdf_path)
    from extractor import extract_timesheet
    extraction = extract_timesheet(pdf_path, api_key=api_key)

    if not extraction.get("success"):
        return {
            "success": False,
            "error": extraction.get("error", "Extraction failed"),
            "extraction": extraction,
            "validation": {},
            "invoice_path": None,
        }

    rows   = extraction.get("rows", [])
    totals = extraction.get("totals", {})
    valid  = validate_extraction(extraction)

    validation = {
        "rows_found":      len(rows),
        "rows_valid":      valid,
        "subtotal":        totals.get("subtotal", 0),
        "deductions":      totals.get("deductions", 0),
        "net_total":       totals.get("net_total", 0),
        "format_detected": extraction.get("format", "unknown"),
        "client_detected": extraction.get("client", {}).get("name", ""),
    }

    if not valid:
        return {
            "success": False,
            "error": "No valid invoice rows found in the timesheet",
            "extraction": extraction,
            "validation": validation,
            "invoice_path": None,
        }

    logger.info("Pipeline: generating invoice PDF (%d rows, format=%s)",
                len(rows), extraction.get("format"))
    from invoice_generator import generate_invoice_pdf
    invoice_path = generate_invoice_pdf(
        extraction=extraction,
        company_data=company_data,
        output_dir=output_dir,
        template_path=template_path,
        signature_path=signature_path,
        stamp_path=stamp_path,
    )

    logger.info("Pipeline: invoice written to %s", invoice_path)
    return {
        "success": True,
        "invoice_path": invoice_path,
        "extraction": extraction,
        "validation": validation,
        "error": None,
    }


# ---------------------------------------------------------------------------
# Legacy shims  (keep old /extract endpoints working unchanged)
# ---------------------------------------------------------------------------

def run_hybrid_extraction(pdf_path: str, document_type: str = "auto") -> Dict[str, Any]:
    """Backward-compat wrapper – returns old-shaped payload."""
    result = extract_only(pdf_path)
    rows   = result.get("rows", [])
    totals = result.get("totals", {})

    legacy_rows = [
        {
            "trade":      str(r.get("trade") or "").upper(),
            "project_id": r.get("project_id"),
            "hours":      r.get("hours"),
            "rate":       r.get("rate"),
            "amount":     r.get("amount"),
            "vat":        None,
            "vat_amount": None,
            "net_amount": None,
        }
        for r in rows
    ]

    return {
        "success":       result.get("success", False),
        "document_type": "invoice_summary",
        "pipeline": {
            "used_ocr":        False,
            "best_table_type": "invoice_summary" if rows else "unknown",
            "confidence":      1.0 if rows else 0.0,
        },
        "pages":    [],
        "metadata": result.get("timesheet_meta", {}),
        "invoice_summary": {
            "rows": legacy_rows,
            "totals": {
                "subtotal":        totals.get("subtotal", 0),
                "vat_total":       0.0,
                "total_deduction": totals.get("deductions", 0),
                "net_total":       totals.get("net_total", 0),
            },
        },
        "attendance": {"rows": []},
    }
