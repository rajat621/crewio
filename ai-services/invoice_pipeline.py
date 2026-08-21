"""
pipeline.py

Main orchestration layer.

Flow:

PDF
 ↓
run_extraction_pipeline()
 ↓
NormalizedInvoice
 ↓
Convert to invoice generator format
 ↓
Generate invoice PDF
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------
# Capability endpoint
# ---------------------------------------------------------------------

def get_ocr_capabilities() -> Dict[str, bool]:
    return {
        "ocr_available": True,
        "tesseract_available": True,
        "pdf2image_available": True,
        "vision_api": True,
        "local_ollama": False,
        "gemini_vision": True,
    }


# ---------------------------------------------------------------------
# Convert NormalizedInvoice -> extraction format expected by renderer
# ---------------------------------------------------------------------

def _convert_invoice_to_extraction(invoice) -> Dict[str, Any]:
    rows = []

    for row in invoice.invoice_rows:
        rows.append({
            "trade": row.description,
            "project_id": row.project,
            "employee_id": row.employee_id,
            "employee_name": row.employee_name,
            "hours": row.quantity,
            "rate": row.rate,
            "amount": row.amount,
        })

    return {
        "success": invoice.error in [None, ""],

        "rows": rows,

        "totals": {
            "subtotal": invoice.subtotal,
            "deductions": invoice.deductions,
            "vat": invoice.vat,
            "gross_total": invoice.gross_total,
            "net_total": invoice.net_total,
        },

        "original_totals": {
            "subtotal": invoice.original_subtotal,
            "deductions": invoice.original_deductions,
            "vat": invoice.original_vat,
            "gross_total": invoice.original_gross_total,
            "net_total": invoice.original_net_total,
        },

        "reconciled_totals": {
            "subtotal": invoice.subtotal,
            "deductions": invoice.deductions,
            "vat": invoice.vat,
            "gross_total": invoice.gross_total,
            "net_total": invoice.net_total,
        },

        "client": {
            "name": invoice.client_name,
            "trn": getattr(
                invoice,
                "client_trn",
                ""
            )
        },

        "timesheet_meta": {
            "period_month": invoice.period_month,
            "invoice_no": invoice.invoice_no,
            "source": invoice.extraction_source,
            "confidence": invoice.confidence,
        },

        "format": invoice.extraction_source,

        "warnings": invoice.warnings,

        "financial_corrections": invoice.financial_corrections,
        "rejected_values": invoice.rejected_values,
        "reconciliation_reason": invoice.reconciliation_reason,

        "error": invoice.error,
    }


# ---------------------------------------------------------------------
# Public extraction API
# ---------------------------------------------------------------------

def extract_only(
    pdf_path: str,
    api_key: Optional[str] = None,
) -> Dict[str, Any]:

    from extraction_pipeline import (
        run_extraction_pipeline
    )

    invoice = run_extraction_pipeline(
        pdf_path
    )

    return _convert_invoice_to_extraction(
        invoice
    )


# ---------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------

def validate_extraction(
    data: Dict[str, Any]
) -> bool:

    rows = data.get(
        "rows",
        []
    )

    if not rows:
        return False

    return any(
        (
            r.get("trade")
            and r.get("hours") is not None
        )
        for r in rows
    )


# ---------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------

def run_pipeline(
    pdf_path: str,
    company_data: Dict[str, Any],
    output_dir: str,
    template_path: Optional[str] = None,
    signature_path: Optional[str] = None,
    stamp_path: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Dict[str, Any]:

    logger.info(
        "pipeline start pdf=%s",
        pdf_path
    )

    extraction = extract_only(
        pdf_path,
        api_key
    )

    if not extraction["success"]:
        return {
            "success": False,
            "error": extraction.get(
                "error",
                "Extraction failed"
            ),
            "extraction": extraction,
            "invoice_path": None,
        }

    validation = {
        "rows_found":
            len(
                extraction["rows"]
            ),

        "subtotal":
            extraction["totals"][
                "subtotal"
            ],

        "deductions":
            extraction["totals"][
                "deductions"
            ],

        "net_total":
            extraction["totals"][
                "net_total"
            ],

        "confidence":
            extraction[
                "timesheet_meta"
            ][
                "confidence"
            ],
    }

    if not validate_extraction(
        extraction
    ):
        return {
            "success": False,
            "error":
                "No valid rows found",
            "validation":
                validation,
            "extraction":
                extraction,
            "invoice_path":
                None,
        }

    from invoice_generator import (
        generate_invoice_pdf
    )

    invoice_path = (
        generate_invoice_pdf(
            extraction=extraction,
            company_data=company_data,
            output_dir=output_dir,
            template_path=template_path,
            signature_path=signature_path,
            stamp_path=stamp_path,
        )
    )

    logger.info(
        "pipeline complete invoice=%s",
        invoice_path
    )

    return {
        "success": True,
        "invoice_path":
            invoice_path,
        "validation":
            validation,
        "extraction":
            extraction,
        "error": None,
    }


# ---------------------------------------------------------------------
# Legacy compatibility
# ---------------------------------------------------------------------

def run_hybrid_extraction(
    pdf_path: str,
    document_type: str = "auto"
) -> Dict[str, Any]:

    result = extract_only(
        pdf_path
    )

    rows = []

    for r in result.get(
        "rows",
        []
    ):
        rows.append({
            "trade":
                r["trade"],

            "project_id":
                r["project_id"],

            "hours":
                r["hours"],

            "rate":
                r["rate"],

            "amount":
                r["amount"],

            "vat": None,
            "vat_amount": None,
            "net_amount": None,
        })

    return {
        "success":
            result["success"],

        "document_type":
            "invoice_summary",

        "pipeline": {
            "used_ocr":
                result[
                    "timesheet_meta"
                ][
                    "source"
                ] == "ocr",

            "best_table_type":
                "invoice_summary",

            "confidence":
                result[
                    "timesheet_meta"
                ][
                    "confidence"
                ],
        },

        "pages": [],

        "metadata":
            result.get(
                "timesheet_meta",
                {}
            ),

        "invoice_summary": {
            "rows":
                rows,

            "totals": {
                "subtotal":
                    result[
                        "totals"
                    ][
                        "subtotal"
                    ],

                "vat_total":
                    result[
                        "totals"
                    ][
                        "vat"
                    ],

                "total_deduction":
                    result[
                        "totals"
                    ][
                        "deductions"
                    ],

                "net_total":
                    result[
                        "totals"
                    ][
                        "net_total"
                    ],
            },
        },

        "attendance": {
            "rows": []
        },
    }