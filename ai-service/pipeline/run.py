"""
pipeline/run.py

Universal extraction pipeline.

Features:
- Fully offline OCR extraction
- RapidOCR + OpenCV
- No Anthropic dependency
- Automatic OCR fallback
- Attendance validation
- Dynamic VAT computation
"""

from __future__ import annotations

import logging
import re
import time
from typing import Optional

from schema import (
    CompanyProfile,
    ExtractionResult,
    InvoiceRow,
)

from pipeline.classifier import classify_pdf
from pipeline.fallback_extractor import fallback_extract
from pipeline.financial_block_detector import detect_financial_blocks_in_text, extract_best_financial_value
from pipeline.text_extractor import extract_text_pdf
from pipeline.structured_logging import log_event

logger = logging.getLogger(__name__)


def _apply_semantic_recovery(result: ExtractionResult, vat_rate: float) -> None:
    """Attempt semantic recovery for missing financials and empty-row cases."""

    text = str(result.raw_text or "")
    if text:
        blocks = detect_financial_blocks_in_text(text)

        recovered_subtotal = extract_best_financial_value(blocks.get("subtotal", []))
        recovered_deduction = extract_best_financial_value(blocks.get("deduction", []))
        recovered_vat = extract_best_financial_value(blocks.get("vat", []))
        recovered_net = extract_best_financial_value(blocks.get("net_payable", []))

        if float(result.financials.subtotal or 0.0) <= 0.0 and recovered_subtotal is not None:
            result.financials.subtotal = max(0.0, float(recovered_subtotal))
            result.warnings.append("recovery:footer_subtotal")

        if float(result.financials.total_deduction or 0.0) <= 0.0 and recovered_deduction is not None:
            result.financials.total_deduction = max(0.0, float(recovered_deduction))
            result.financials.deduction_source = result.financials.deduction_source or "semantic_footer"
            result.warnings.append("recovery:footer_deduction")

        if float(result.financials.total_vat or 0.0) <= 0.0 and recovered_vat is not None:
            result.financials.total_vat = max(0.0, float(recovered_vat))
            result.warnings.append("recovery:footer_vat")

        if float(result.financials.net_payable or 0.0) <= 0.0 and recovered_net is not None:
            result.financials.net_payable = max(0.0, float(recovered_net))
            result.warnings.append("recovery:footer_net_payable")

    if not result.rows and text:
        fallback = fallback_extract(full_text=text, vat_rate=vat_rate)
        if fallback.rows:
            recovered_rows = []
            for row in fallback.rows:
                trade = str(row.get("trade") or "").strip().upper() or "UNKNOWN"
                recovered_rows.append(
                    InvoiceRow(
                        trade=trade,
                        project_id=row.get("project_id"),
                        employee_id=row.get("employee_id"),
                        hours=float(row.get("hours") or 0.0),
                        rate=float(row.get("rate") or 0.0),
                        amount=float(row.get("amount") or 0.0),
                    )
                )
            result.rows = recovered_rows
            result.warnings.append(f"recovery:{fallback.method}")

        if fallback.financials:
            result.financials.subtotal = max(float(result.financials.subtotal or 0.0), float(fallback.financials.get("subtotal", 0.0) or 0.0))
            result.financials.total_deduction = max(float(result.financials.total_deduction or 0.0), float(fallback.financials.get("total_deduction", 0.0) or 0.0))
            result.financials.total_vat = max(float(result.financials.total_vat or 0.0), float(fallback.financials.get("total_vat", 0.0) or 0.0))
            result.financials.net_payable = max(float(result.financials.net_payable or 0.0), float(fallback.financials.get("net_payable", 0.0) or 0.0))

    if result.rows:
        row_sum = round(sum(float(r.amount or 0.0) for r in result.rows), 2)
        reported_subtotal = float(result.financials.subtotal or 0.0)
        if reported_subtotal <= 0.0 or abs(row_sum - reported_subtotal) > 1.0:
            result.financials.subtotal = row_sum
            result.warnings.append("recovery:subtotal_from_rows")

    if float(result.financials.total_vat or 0.0) <= 0.0:
        adjusted = max(0.0, float(result.financials.subtotal or 0.0) - max(0.0, float(result.financials.total_deduction or 0.0)))
        result.financials.total_vat = round(adjusted * float(vat_rate or 0.05), 4)
        result.warnings.append("recovery:vat_recomputed")

    if float(result.financials.net_payable or 0.0) <= 0.0:
        adjusted = max(0.0, float(result.financials.subtotal or 0.0) - max(0.0, float(result.financials.total_deduction or 0.0)))
        result.financials.net_payable = round(adjusted + float(result.financials.total_vat or 0.0), 2)
        result.warnings.append("recovery:net_payable_recomputed")


def _is_financial_impossible(result: ExtractionResult) -> bool:
    subtotal = float(result.financials.subtotal or 0.0)
    deduction = float(result.financials.total_deduction or 0.0)
    vat = float(result.financials.total_vat or 0.0)
    net = float(result.financials.net_payable or 0.0)

    if subtotal < 0.0 or deduction < 0.0 or vat < 0.0 or net < 0.0:
        return True
    if subtotal <= 0.0 and result.rows:
        return True
    if subtotal > 0.0 and deduction > subtotal * 1.2:
        return True
    if result.rows and abs(round(sum(float(r.amount or 0.0) for r in result.rows), 2) - subtotal) > max(3.0, subtotal * 0.35):
        return True
    return False


def _is_ocr_unreadable(result: ExtractionResult) -> bool:
    if not result.used_ocr:
        return False
    text = str(result.raw_text or "")
    text_chars = len(text.strip())
    alpha_tokens = len(re.findall(r"[A-Za-z]{2,}", text))
    return text_chars < 40 or (alpha_tokens < 5 and float(result.confidence or 0.0) < 0.25)


def _has_semantic_structure(result: ExtractionResult) -> bool:
    if result.rows:
        return True
    if result.metadata and any(
        [
            result.metadata.source_invoice_no,
            result.metadata.timesheet_no,
            result.metadata.period_from,
            result.metadata.period_to,
            result.metadata.period_month,
            result.metadata.client_name,
        ]
    ):
        return True

    text = str(result.raw_text or "").lower()
    semantic_hits = ["trade", "hours", "rate", "amount", "subtotal", "deduction", "vat", "payable", "project", "employee"]
    return sum(1 for token in semantic_hits if token in text) >= 2


def _finalize_financials(result: ExtractionResult, vat_rate: float) -> None:
    """Compute immutable final financial payload once, upstream of rendering."""
    subtotal = round(sum(float(r.amount or 0.0) for r in result.rows), 2) if result.rows else round(float(result.financials.subtotal or 0.0), 2)
    total_deduction = max(0.0, round(float(result.financials.total_deduction or 0.0), 3))
    adjusted_subtotal = max(0.0, round(subtotal - total_deduction, 3))

    # Output VAT is always on adjusted subtotal.
    total_vat = round(adjusted_subtotal * float(vat_rate or 0.05), 4)

    deduction_vat = round(total_deduction * float(vat_rate or 0.05), 3)
    deduction_total_with_vat = round(total_deduction + deduction_vat, 3)
    net_payable = round(adjusted_subtotal + total_vat, 2)
    gross_total = round(subtotal + total_vat, 2)

    # Keep row-level VAT values aligned for table display, but do not alter financial totals from here onward.
    for row in result.rows:
        row.compute_vat(float(vat_rate or 0.05))

    result.financials.subtotal = subtotal
    result.financials.total_deduction = total_deduction
    result.financials.deduction_vat = deduction_vat
    result.financials.deduction_total_with_vat = deduction_total_with_vat
    result.financials.adjusted_subtotal = adjusted_subtotal
    result.financials.total_vat = total_vat
    result.financials.gross_total = gross_total
    result.financials.net_payable = max(net_payable, 0.0)


_RETRY_STRATEGIES = [
    {
        "name": "strong_preprocess",
        "overrides": {
            "preprocessing": {"adaptive_block_size": 35, "adaptive_c": 12, "denoise_h": 14},
            "ocr": {"min_confidence": 0.4},
        },
    },
    {
        "name": "alt_morphology",
        "overrides": {
            "morphology": {"horizontal_kernel_width": 28, "vertical_kernel_height": 28, "open_iterations": 2},
            "ocr": {"min_confidence": 0.35},
        },
    },
    {
        "name": "aggressive_threshold",
        "overrides": {
            "preprocessing": {"adaptive_block_size": 41, "adaptive_c": 10},
            "ocr": {"min_confidence": 0.3},
        },
    },
]


# ---------------------------------------------------------------------------
# Main extraction pipeline
# ---------------------------------------------------------------------------

def run_extraction(
    pdf_path: str,
    company_profile: Optional[CompanyProfile] = None,
    force_ocr: bool = False,
    debug_mode: bool = False,
    run_id: Optional[str] = None,
) -> ExtractionResult:
    """
    Extract invoice data from any PDF.

    Supports:
    - text PDFs
    - scanned PDFs
    - image-based PDFs

    Uses:
    - pdfplumber
    - RapidOCR
    - OpenCV

    No external AI APIs required.
    """

    # -----------------------------------------------------------------------
    # 1. classify
    # -----------------------------------------------------------------------

    fmt, layout, is_image = classify_pdf(pdf_path)

    logger.debug(
        "Classified %s → format=%s layout=%s image=%s",
        pdf_path,
        fmt,
        layout,
        is_image,
    )

    # -----------------------------------------------------------------------
    # 2. extraction
    # -----------------------------------------------------------------------

    started = time.time()

    result = extract_text_pdf(pdf_path=pdf_path, fmt=fmt, layout=layout, debug_mode=debug_mode, run_id=run_id)

    # -----------------------------------------------------------------------
    # 3. OCR escalation fallback
    # -----------------------------------------------------------------------

    if force_ocr and not is_image:
        logger.debug("Force OCR requested on non-image PDF; extractor will use OCR route")

    if (not result.success) or (is_image and not result.used_ocr):

        logger.warning(
            "Primary extraction incomplete -> retrying extraction"
        )

        retry = extract_text_pdf(pdf_path=pdf_path, fmt=fmt, layout=layout, debug_mode=debug_mode, run_id=run_id)
        if retry.success or (not result.success):
            result = retry

    if result.confidence < 0.65 or not result.success:

        logger.debug("Low-confidence extraction detected; running retry strategies")

        for strategy in _RETRY_STRATEGIES:
            retried = extract_text_pdf(
                pdf_path=pdf_path,
                fmt=fmt,
                layout=layout,
                config_overrides=strategy["overrides"],
                debug_mode=debug_mode,
                run_id=run_id,
            )

            if (retried.success and retried.confidence > result.confidence) or (not result.success and retried.success):
                result = retried

            if result.success and result.confidence >= 0.8:
                break

    vat_rate = float(company_profile.vat_rate if company_profile else 0.05)

    # -----------------------------------------------------------------------
    # 4. semantic recovery before financial finalization
    # -----------------------------------------------------------------------

    _apply_semantic_recovery(result, vat_rate=vat_rate)

    # -----------------------------------------------------------------------
    # 5. finalize immutable financials (authoritative payload)
    # -----------------------------------------------------------------------

    _finalize_financials(result, vat_rate=vat_rate)

    log_event(
        logger,
        "financial_state",
        stage="extraction_complete",
        run_id=run_id or "",
        pdf_path=pdf_path,
        subtotal=result.financials.subtotal,
        deduction=result.financials.total_deduction,
        deduction_vat=result.financials.deduction_vat,
        adjusted_subtotal=result.financials.adjusted_subtotal,
        vat=result.financials.total_vat,
        net_total=result.financials.net_payable,
        deduction_source=result.financials.deduction_source,
        summary_detected=result.financials.summary_detected,
    )

    # -----------------------------------------------------------------------
    # 6. hard-failure gating (fail only for critical conditions)
    # -----------------------------------------------------------------------

    critical_failures = []
    if not result.rows:
        critical_failures.append("no_rows_extracted")
    if _is_financial_impossible(result):
        critical_failures.append("financials_impossible")
    if _is_ocr_unreadable(result):
        critical_failures.append("ocr_unreadable")
    if not _has_semantic_structure(result):
        critical_failures.append("no_semantic_structure_detected")

    if critical_failures:
        result.success = False
        result.error = f"critical_failures:{','.join(critical_failures)}"
        result.warnings.append(result.error)
    else:
        # Best-effort mode: keep invoice generation possible when critical failures are absent.
        result.success = True

    # -----------------------------------------------------------------------
    # 7. confidence adjustments
    # -----------------------------------------------------------------------

    if result.used_ocr and result.confidence > 0.9:

        result.confidence = 0.9

    # -----------------------------------------------------------------------
    # 8. final logging
    # -----------------------------------------------------------------------

    logger.debug(
        "Extraction completed → rows=%s subtotal=%s",
        len(result.rows),
        result.financials.subtotal,
    )

    log_event(
        logger,
        "run_extraction_complete",
        run_id=run_id or "",
        pdf_path=pdf_path,
        format=fmt.value,
        layout=layout.value,
        success=result.success,
        confidence=result.confidence,
        rows=len(result.rows),
        critical_failures=critical_failures,
        deduction_source=result.financials.deduction_source,
        summary_detected=result.financials.summary_detected,
        processing_time_ms=int((time.time() - started) * 1000),
    )

    return result