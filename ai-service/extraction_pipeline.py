"""
extraction_pipeline.py

Main orchestrator implementing the full 6-step extraction pipeline per spec.

STEP 1 — Detect document type (digital / scanned / mixed)
STEP 2 — Route to best extraction method
STEP 3 — Validation layer (source-agnostic)
STEP 4 — Fallback logic (native → vision → ocr)
STEP 5 — Hybrid recovery
STEP 6 — Return normalized invoice for renderer

The renderer only ever sees a NormalizedInvoice.
It does not know whether the source was OCR, Vision, native PDF, or hybrid.

No contractor-specific logic.
No hardcoded column positions.
No template assumptions.
Generalizes to any construction timesheet format.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Dict, List, Optional
from dotenv import load_dotenv
load_dotenv()
from anomaly_detection import (
    detect_abnormal_hours,
    detect_duplicate_employee,
    detect_missing_totals,
)
from confidence_engine import score_invoice_confidence
from document_classifier import ClassificationResult, DocumentType, classify_document
from extraction_strategy_router import ExtractionStage, plan_strategy
from extraction_validator import validate_and_repair
from financial_reconciliation import reconcile_invoice_financials
from hybrid_recovery import attempt_hybrid_recovery
from layout_classifier import resolve_layout
from native_extractor import extract_native
from normalized_output import NormalizedInvoice
from ocr_extractor import extract_ocr
from vision_extractor import extract_vision

logger = logging.getLogger(__name__)


def _vision_available() -> bool:
    """Check if Gemini Vision API is configured."""
    key = (
        os.getenv("GOOGLE_API_KEY")
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_GENERATIVE_AI_API_KEY")
        or ""
    ).strip()
    return bool(key)


def _vision_result_is_usable(result: NormalizedInvoice) -> bool:
    """
    Per spec, Vision is considered failed when:
      - invalid JSON returned  (handled by exception)
      - zero employees extracted
      - API timeout            (handled by exception)
    """
    return len(result.invoice_rows) > 0


def _ocr_should_run(vision_result: Optional[NormalizedInvoice]) -> bool:
    """
    Per spec: OCR only runs when Vision fails.
    Vision "fails" when it raises or returns zero employees.
    """
    if vision_result is None:
        return True
    return not _vision_result_is_usable(vision_result)


def _extract_layout_text_chunks(pdf_path: str, max_pages: int = 4) -> List[str]:
    chunks: List[str] = []
    try:
        import pdfplumber

        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages[:max_pages]:
                text = (page.extract_text() or "").strip()
                if text:
                    chunks.append(text)
    except Exception as exc:
        logger.debug("layout_text_probe_failed: %s", exc)
    return chunks


def _detect_pipeline_anomalies(final: NormalizedInvoice) -> List[str]:
    rows = [
        {
            "employee_id": row.employee_id,
            "hours": row.quantity,
            "amount": row.amount,
            "rate": row.rate,
        }
        for row in final.invoice_rows
    ]
    anomalies: List[str] = []
    for detector in (
        lambda: detect_missing_totals(rows, final.subtotal),
        lambda: detect_abnormal_hours(rows, max_hours=400.0),
        lambda: detect_duplicate_employee(rows),
    ):
        outcome = detector() or {}
        if outcome.get("anomaly"):
            anomalies.append(str(outcome.get("type") or "unknown_anomaly"))
    return anomalies


def _apply_post_processing(final: NormalizedInvoice, review_mode: bool) -> NormalizedInvoice:
    final, report = validate_and_repair(final)

    if not report.passed:
        logger.warning(
            "step3_validation failed rows=%d violations=%s",
            report.employee_count,
            report.row_violations[:3],
        )

    recon = reconcile_invoice_financials(final)
    for adjustment in recon.adjustments:
        final.warnings.append(f"reconcile:{adjustment}")

    anomalies = list(dict.fromkeys(recon.anomalies + _detect_pipeline_anomalies(final)))
    final.anomalies = anomalies
    if anomalies:
        final.warnings.append(f"anomaly:count={len(anomalies)}")

    confidence_payload = score_invoice_confidence(final, repairs_applied=report.repairs_applied)
    final.review_required = bool(
        confidence_payload.get("any_review_needed") or anomalies
    )
    final.review_reasons = list(dict.fromkeys(
        [f"anomaly:{a}" for a in anomalies]
        + [f"row_review:{idx}" for idx in (confidence_payload.get("rows_needing_review") or [])]
        + [f"field_review:{f}" for f in (confidence_payload.get("fields_needing_review") or [])]
    ))

    if not review_mode:
        final.review_required = False
        final.review_reasons = []

    return final


def run_extraction_pipeline(
    pdf_path: str,
    run_id: Optional[str] = None,
) -> NormalizedInvoice:
    """
    Full extraction pipeline.

    Priority order per spec:
      1. Native PDF extraction (digital PDFs only)
      2. Gemini Vision extraction (primary for scanned/image PDFs)
      3. OCR extraction (final fallback only)

    Returns NormalizedInvoice ready for the invoice renderer.
    The renderer must not branch on extraction_source.
    """
    started = time.time()
    run_tag = run_id or f"run_{int(started)}"
    review_mode = str(os.getenv("HUMAN_REVIEW_MODE", "true")).strip().lower() in {"1", "true", "yes", "on"}

    logger.info("extraction_pipeline start pdf=%s run=%s", pdf_path, run_tag)

    # -----------------------------------------------------------------------
    # STEP 1 — Detect document type
    # -----------------------------------------------------------------------
    classification: ClassificationResult = classify_document(pdf_path)
    logger.info(
        "step1_classify type=%s pages=%d digital_ratio=%.2f",
        classification.document_type.value,
        classification.total_pages,
        classification.digital_ratio,
    )

    layout_chunks = _extract_layout_text_chunks(pdf_path)
    layout_result = resolve_layout(pdf_path, layout_chunks, classification.document_type)
    strategy = plan_strategy(classification.document_type, layout_result.layout_type)
    logger.info(
        "step1_layout type=%s confidence=%.2f strategy=%s reason=%s",
        layout_result.layout_type.value,
        layout_result.confidence,
        strategy.primary.value,
        strategy.reason,
    )

    native_result: Optional[NormalizedInvoice] = None
    vision_result: Optional[NormalizedInvoice] = None
    ocr_result: Optional[NormalizedInvoice] = None

    # -----------------------------------------------------------------------
    # STEP 2 — Route extraction
    # STEP 4 — Fallback logic
    # -----------------------------------------------------------------------

    # --- Path A: Digital-first strategy ---
    if strategy.primary == ExtractionStage.NATIVE:
        logger.info("step2_route native_pdf_extraction")
        try:
            native_result = extract_native(pdf_path)
            if native_result.is_valid:
                logger.info(
                    "step2_native success rows=%d subtotal=%.2f",
                    len(native_result.invoice_rows), native_result.subtotal,
                )
            else:
                logger.info(
                    "step2_native insufficient rows=%d error=%s — routing to vision",
                    len(native_result.invoice_rows), native_result.error,
                )
        except Exception as exc:
            logger.warning("step2_native failed: %s — routing to vision", exc)
            native_result = None

        # If native succeeded, skip Vision entirely
        if native_result and native_result.is_valid:
            final = native_result
            final.warnings.append(f"layout:{layout_result.layout_type.value}")
            final.warnings.append(f"strategy:{strategy.reason}")
            final = _apply_post_processing(final, review_mode=review_mode)
            _log_completion(final, run_tag, started)
            return final

    # --- Path B: Vision primary or fallback ---
    if _vision_available():
        logger.info("step2_route vision_extraction (primary for image/scanned)")
        try:
            vision_result = extract_vision(pdf_path)
            logger.info(
                "step2_vision rows=%d subtotal=%.2f confidence=%.2f",
                len(vision_result.invoice_rows),
                vision_result.subtotal,
                vision_result.confidence,
            )
        except Exception as exc:
            logger.warning(
                "VISION FAILED -> FALLING BACK TO OCR FOR FILE: %s",
                pdf_path,
            )
            logger.warning("step2_vision failed: %s — falling back to OCR", exc)
            vision_result = None
    else:
        logger.info("step2_vision skipped: GEMINI_API_KEY not configured")

    # Mixed docs can still recover structured text via native when vision is weak.
    if (
        classification.document_type == DocumentType.MIXED
        and (vision_result is None or not _vision_result_is_usable(vision_result))
        and native_result is None
    ):
        try:
            logger.info("step2_route native_on_mixed_recovery")
            native_result = extract_native(pdf_path)
        except Exception as exc:
            logger.warning("step2_native_mixed_recovery failed: %s", exc)

    # --- Path C: OCR fallback — only when Vision fails ---
    if _ocr_should_run(vision_result):
        logger.info("step2_route ocr_extraction (final fallback — vision failed or unavailable)")
        try:
            ocr_result = extract_ocr(pdf_path)
            logger.info(
                "step2_ocr rows=%d subtotal=%.2f confidence=%.2f",
                len(ocr_result.invoice_rows),
                ocr_result.subtotal,
                ocr_result.confidence,
            )
        except Exception as exc:
            logger.error("step2_ocr also failed: %s", exc)
            ocr_result = NormalizedInvoice()
            ocr_result.error = f"ALL_EXTRACTORS_FAILED:{exc}"
            ocr_result.extraction_source = "ocr"

    # -----------------------------------------------------------------------
    # STEP 5 — Hybrid recovery
    # -----------------------------------------------------------------------
    if vision_result is not None and ocr_result is not None:
        logger.info("step5_hybrid_recovery")
        final = attempt_hybrid_recovery(vision_result, ocr_result)
    elif native_result is not None and vision_result is not None:
        # Prefer richer row extraction from vision while preserving strong native totals when useful.
        if len(vision_result.invoice_rows) >= len(native_result.invoice_rows):
            final = vision_result
            if native_result.subtotal > 0 and final.subtotal <= 0:
                final.subtotal = native_result.subtotal
        else:
            final = native_result
            if final.deductions <= 0 and vision_result.deductions > 0:
                final.deductions = vision_result.deductions
    elif vision_result is not None:
        final = vision_result
    elif ocr_result is not None:
        final = ocr_result
    elif native_result is not None:
        # native ran but was insufficient — use it anyway
        final = native_result
    else:
        # Complete failure
        final = NormalizedInvoice()
        final.error = "ALL_EXTRACTION_PATHS_FAILED"
        final.extraction_source = "none"

    # -----------------------------------------------------------------------
    # STEP 3 — Validation layer (source-agnostic, always runs)
    # -----------------------------------------------------------------------
    logger.info("step3_validation source=%s rows=%d", final.extraction_source, len(final.invoice_rows))
    final.warnings.append(f"layout:{layout_result.layout_type.value}")
    final.warnings.append(f"strategy:{strategy.reason}")
    final = _apply_post_processing(final, review_mode=review_mode)

    # -----------------------------------------------------------------------
    # STEP 6 — Return normalized invoice
    # -----------------------------------------------------------------------
    _log_completion(final, run_tag, started)
    return final


def _log_completion(invoice: NormalizedInvoice, run_tag: str, started: float) -> None:
    elapsed_ms = int((time.time() - started) * 1000)
    logger.info(
        "extraction_pipeline complete run=%s source=%s rows=%d "
        "subtotal=%.2f vat=%.4f net=%.2f confidence=%.2f elapsed_ms=%d",
        run_tag,
        invoice.extraction_source,
        len(invoice.invoice_rows),
        invoice.subtotal,
        invoice.vat,
        invoice.net_total,
        invoice.confidence,
        elapsed_ms,
    )