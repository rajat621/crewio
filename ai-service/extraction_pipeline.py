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
from typing import Optional

from document_classifier import ClassificationResult, DocumentType, classify_document
from extraction_validator import validate_and_repair
from hybrid_recovery import attempt_hybrid_recovery
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

    native_result: Optional[NormalizedInvoice] = None
    vision_result: Optional[NormalizedInvoice] = None
    ocr_result: Optional[NormalizedInvoice] = None

    # -----------------------------------------------------------------------
    # STEP 2 — Route extraction
    # STEP 4 — Fallback logic
    # -----------------------------------------------------------------------

    # --- Path A: Digital PDF → native extraction first ---
    if classification.document_type == DocumentType.DIGITAL:
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
            final, report = validate_and_repair(final)
            _log_completion(final, run_tag, started)
            return final

    # --- Path B: Scanned/Mixed/native-failed → Vision primary ---
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
            logger.warning("step2_vision failed: %s — falling back to OCR", exc)
            vision_result = None
    else:
        logger.info("step2_vision skipped: GEMINI_API_KEY not configured")

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
    final, report = validate_and_repair(final)

    if not report.passed:
        logger.warning(
            "step3_validation failed rows=%d violations=%s",
            report.employee_count, report.row_violations[:3],
        )

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