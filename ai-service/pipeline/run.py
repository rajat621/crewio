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
import threading
import re
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from typing import Optional

from schema import (
    CompanyProfile,
    ExtractionResult,
)

from pipeline.classifier import classify_pdf
from pipeline.extraction_metrics import record_extraction_metric, set_extraction_metrics_context
from pipeline.financial_block_detector import detect_financial_blocks_in_text, extract_best_financial_value
from pipeline.text_extractor import extract_text_pdf
from pipeline.vision_runner import extract_using_vision, vision_enabled_for
from pipeline.structured_logging import (
    classify_failure,
    log_event,
    stage_complete,
    stage_failure,
    stage_start,
)


logger = logging.getLogger(__name__)

# Lightweight concurrency/resource guards (config-driven)
from config_runtime import RuntimeConfig, CONFIG
import os

_runtime_config = None
_ocr_semaphore = None
_semantic_semaphore = None
_pdf_semaphore = None
_inference_semaphore = None

def _init_concurrency_guards(runtime_config: RuntimeConfig):
    global _runtime_config, _ocr_semaphore, _semantic_semaphore, _pdf_semaphore, _inference_semaphore
    _runtime_config = runtime_config
    _ocr_semaphore = threading.Semaphore(runtime_config.concurrency_limits.ocr_concurrency)
    _semantic_semaphore = threading.Semaphore(runtime_config.concurrency_limits.semantic_concurrency)
    _pdf_semaphore = threading.Semaphore(runtime_config.concurrency_limits.pdf_concurrency)
    _inference_semaphore = threading.Semaphore(runtime_config.concurrency_limits.inference_concurrency)

def _with_guard(sem, func, *args, **kwargs):
    if sem is None:
        return func(*args, **kwargs)
    with sem:
        return func(*args, **kwargs)


def _run_with_timeout(func, timeout_s: float, *args, **kwargs):
    ex = ThreadPoolExecutor(max_workers=1)
    future = ex.submit(func, *args, **kwargs)
    try:
        return future.result(timeout=max(1.0, float(timeout_s)))
    except FutureTimeoutError:
        future.cancel()
        raise
    finally:
        ex.shutdown(wait=False, cancel_futures=True)

def _is_large_pdf(pdf_path: str) -> bool:
    # Detect large PDF by page count or file size
    try:
        from pdfplumber import open as pdfopen
        with pdfopen(pdf_path) as pdf:
            if len(pdf.pages) > _runtime_config.resource_limits.max_pdf_pages:
                return True
    except Exception:
        pass
    try:
        if os.path.getsize(pdf_path) > _runtime_config.resource_limits.max_payload_mb * 1024 * 1024:
            return True
    except Exception:
        pass
    return False


def _apply_semantic_recovery(result: ExtractionResult, vat_rate: float) -> None:
    """Attempt semantic recovery for missing financials and empty-row cases."""

    text = str(result.raw_text or "")
    if text:
        # Example: wrap semantic recovery in concurrency guard
        def _semantic_block():
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
        # Only run semantic if concurrency allows
        if _semantic_semaphore is not None and _semantic_semaphore._value == 0:
            # Degrade gracefully: skip semantic overlay
            result.warnings.append("semantic_skipped:concurrency_limit")
        else:
            _with_guard(_semantic_semaphore, _semantic_block)

    if not result.rows and text:
        result.warnings.append("structured_rows_required:no_blob_row_recovery")

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


def _is_vision_untrustworthy(result: ExtractionResult) -> bool:
    if not result.used_vision:
        return False
    if not result.rows:
        return True

    row_sum = round(sum(float(r.amount or 0.0) for r in result.rows), 2)
    subtotal = float(result.financials.subtotal or 0.0)
    net = float(result.financials.net_payable or 0.0)

    if row_sum <= 0.0:
        return True
    if subtotal > 0.0 and abs(row_sum - subtotal) > max(5.0, subtotal * 0.12):
        return True
    if net > 0.0 and row_sum < net * 0.5:
        return True
    return False


def _is_ocr_unreadable(result: ExtractionResult) -> bool:
    if not result.used_ocr:
        return False
    if result.rows:
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


def _is_deterministic_structured_failure(result: ExtractionResult) -> bool:
    warnings = [str(w) for w in (result.warnings or [])]
    markers = (
        "structured_rows_required:",
        "summary_row_total_mismatch:",
        "ocr_timeout_degraded",
        "ocr_budget_exhausted:",
        "table_skipped:fragmented_grid",
        "table_skipped:too_many_cells",
        "No structured table reconstructed from OCR pipeline",
    )
    return any(any(marker in warning for marker in markers) for warning in warnings)


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

    set_extraction_metrics_context(run_id=run_id or "", pdf_path=pdf_path)
    record_extraction_metric(
        "OCR_REPAIR_METRICS",
        {
            "total_tokens_before": 0,
            "total_tokens_after": 0,
            "oversized_tokens_before": 0,
            "oversized_tokens_after": 0,
            "reprocessed_tokens": 0,
            "split_success_rate": 0.0,
        },
        logger=logger,
        run_id=run_id or "",
        pdf_path=pdf_path,
        stage="extraction_start",
    )
    record_extraction_metric(
        "SEMANTIC_INPUT_METRICS",
        {
            "tokens_received": 0,
            "clusters_created": 0,
            "logical_rows_created": 0,
        },
        logger=logger,
        run_id=run_id or "",
        pdf_path=pdf_path,
        stage="extraction_start",
    )
    record_extraction_metric(
        "SEMANTIC_OUTPUT_METRICS",
        {
            "rows_accepted": 0,
            "rows_rejected": 0,
            "top_rejection_reasons": {},
        },
        logger=logger,
        run_id=run_id or "",
        pdf_path=pdf_path,
        stage="extraction_start",
    )

    # -----------------------------------------------------------------------
    # 1. classify
    # -----------------------------------------------------------------------

    if _runtime_config is None:
        _init_concurrency_guards(CONFIG)

    classify_started = stage_start(logger, "pdf_parsing", pdf_path=pdf_path, run_id=run_id or "")
    fmt, layout, is_image = classify_pdf(pdf_path)
    pdf_parsing_ms = int((time.time() - classify_started) * 1000)
    stage_complete(
        logger,
        "pdf_parsing",
        classify_started,
        run_id=run_id or "",
        format=fmt.value,
        layout=layout.value,
        image_pdf=bool(is_image),
    )
    log_event(logger, "performance_timing", metric="pdf_parsing_ms", duration_ms=pdf_parsing_ms, run_id=run_id or "")

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
    extraction_cache = {
        "pdf_path": pdf_path,
        "full_ocr_attempts": 0,
    }
    # vat_rate may be needed early for repair attempts
    vat_rate = float(company_profile.vat_rate if company_profile else 0.05)
    total_started = stage_start(logger, "worker_execution", run_id=run_id or "", pdf_path=pdf_path)

    # Allow explicit force of Gemini Vision when enabled in config/providers
    use_vision = vision_enabled_for(pdf_path)
    print("\n========================")
    print("USE VISION:", use_vision)
    print("ENABLE_VISION:", CONFIG.feature_flags.enable_vision)
    print("VISION_PROVIDER:", CONFIG.providers.vision_provider)
    print("========================\n")
    try:
        prov = str(CONFIG.providers.vision_provider or "").strip().lower()
        if bool(CONFIG.feature_flags.enable_vision) and prov in {"gemini", "google", "google_gemini"}:
            use_vision = True
    except Exception:
        pass
    if use_vision:
        extract_started = stage_start(logger, "vision_extraction", pdf_path=pdf_path, run_id=run_id or "")
        # call vision provider
        vision_result = _with_guard(_inference_semaphore, extract_using_vision, pdf_path=pdf_path, run_id=run_id)
        result = vision_result
        vision_ms = int((time.time() - extract_started) * 1000)
        stage_complete(
            logger,
            "vision_extraction",
            extract_started,
            run_id=run_id or "",
            used_vision=bool(result.used_vision),
            confidence=float(result.confidence or 0.0),
            rows=len(result.rows or []),
        )
        log_event(logger, "performance_timing", metric="vision_duration_ms", duration_ms=vision_ms, run_id=run_id or "")
        # If vision was explicitly validated and rejected by vision runner, or otherwise untrustworthy, fallback to OCR
        vision_rejected = any(str(w).startswith("vision_validated:rejected") for w in (vision_result.warnings or []))
        print("\n========== VISION DEBUG ==========")
        print("ROWS:", len(result.rows))
        print("ROW SUM:", sum(float(r.amount or 0) for r in result.rows))
        print("SUBTOTAL:", result.financials.subtotal)
        print("NET:", result.financials.net_payable)
        print("UNTRUSTWORTHY:", _is_vision_untrustworthy(result))
        print("==================================\n")
        vision_row_count = len(result.rows or [])
        vision_row_sum = round(
            sum(float(r.amount or 0) for r in result.rows),
            2
        )

        vision_subtotal = round(
            float(result.financials.subtotal or 0),
            2
        )

        vision_is_valid = (
            vision_row_count > 0
            and vision_row_sum > 0
            and abs(
                vision_row_sum - vision_subtotal
            ) <= max(
                5,
                vision_subtotal * 0.15
            )
        )

        if vision_rejected or (
            _is_vision_untrustworthy(result)
            and not vision_is_valid
        ):
            # Attempt confidence-based repair before unconditional OCR fallback.
            repair_threshold = float(os.getenv("VISION_REPAIR_CONFIDENCE_THRESHOLD", "0.8"))
            repaired = False
            try:
                if result.rows and float(result.confidence or 0.0) >= repair_threshold:
                    # Recompute subtotal from rows and finalize financials; treat this as a repair if it yields possible financials.
                    row_sum = round(sum(float(r.amount or 0.0) for r in result.rows), 2)
                    orig_subtotal = float(result.financials.subtotal or 0.0)
                    # Only attempt repair when there is a substantive subtotal mismatch or missing summary
                    if orig_subtotal <= 0.0 or abs(row_sum - orig_subtotal) > max(3.0, orig_subtotal * 0.35):
                        result.financials.subtotal = row_sum
                        _finalize_financials(result, vat_rate=vat_rate)
                        # If financials are now plausible, accept repaired vision result
                        if not _is_financial_impossible(result):
                            result.warnings.append("vision_repaired:recalc_from_rows")
                            repaired = True
            except Exception:
                repaired = False

            if repaired:
                logger.info("Vision output repaired from rows; skipping OCR fallback")
            else:
                result.warnings.append("vision_rejected:financial_consistency")
                logger.warning("Vision extraction rejected by financial consistency gate; falling back to OCR")
                try:
                    log_event(logger, "VISION_FALLBACK_TO_OCR", pdf_path=pdf_path, run_id=run_id or "")
                except Exception:
                    pass
                try:
                    log_event(logger, "OCR_FALLBACK_STARTED", pdf_path=pdf_path, run_id=run_id or "")
                except Exception:
                    pass
                extract_started = stage_start(logger, "ocr_after_vision_reject", pdf_path=pdf_path, run_id=run_id or "")
                retry = _with_guard(
                    _ocr_semaphore,
                    extract_text_pdf,
                    pdf_path=pdf_path,
                    fmt=fmt,
                    layout=layout,
                    debug_mode=debug_mode,
                    run_id=run_id,
                    request_cache=extraction_cache,
                )
                retry.warnings = ["vision_rejected:financial_consistency"] + list(retry.warnings or [])

                # Compare vision_result and retry to choose best candidate or perform hybrid merge
                try:
                    # helper to compute gross total for comparison
                    def gross_total_of(fin):
                        try:
                            g = float(getattr(fin, 'gross_total', 0.0) or 0.0)
                        except Exception:
                            g = 0.0
                        if g <= 0.0:
                            try:
                                g = float(fin.subtotal or 0.0) + float(getattr(fin, 'total_vat', 0.0) or 0.0)
                            except Exception:
                                g = float(fin.subtotal or 0.0)
                        return float(g)

                    vision_gross = gross_total_of(vision_result.financials)
                    candidates = [
                        (vision_result, 'vision'),
                        (retry, 'ocr'),
                    ]
                    # scoring: (abs(gross - vision_gross), -employee_count, -confidence)
                    def score_candidate(cand):
                        fin = cand.financials
                        gross = gross_total_of(fin)
                        gross_diff = abs(gross - vision_gross)
                        emp_count = len(cand.rows or [])
                        conf = float(cand.confidence or 0.0)
                        return (gross_diff, -emp_count, -conf)

                    # If vision validated accepted and OCR also succeeded, consider hybrid merge
                    vision_validated_accepted = any(str(w).startswith('vision_validated:accepted') for w in (vision_result.warnings or []))
                    if vision_validated_accepted and retry and retry.rows:
                        # hybrid: take vision financials, OCR rows
                        merged = retry
                        merged.financials = vision_result.financials
                        merged.used_vision = True
                        merged.used_ocr = True
                        merged.warnings = (merged.warnings or []) + ['hybrid_merge:vision_financials_ocr_rows']
                        result = merged
                        try:
                            log_event(logger, 'VISION_RESULT_ACCEPTED', pdf_path=pdf_path, run_id=run_id or '', hybrid=True)
                        except Exception:
                            pass
                    else:
                        # choose closest gross, then highest rows, then highest confidence
                        scored = [(score_candidate(c[0]), c[0], c[1]) for c in candidates]
                        scored.sort(key=lambda x: x[0])
                        chosen = scored[0][1]
                        result = chosen
                        try:
                            log_event(logger, 'VISION_RESULT_RECONCILED', pdf_path=pdf_path, run_id=run_id or '', chosen=('vision' if chosen is vision_result else 'ocr'))
                        except Exception:
                            pass

                except Exception as exc:
                    # If any failure here, prefer OCR retry
                    result = retry

                ocr_ms = int((time.time() - extract_started) * 1000)
                stage_complete(
                    logger,
                    "ocr_after_vision_reject",
                    extract_started,
                    run_id=run_id or "",
                    used_ocr=bool(result.used_ocr),
                    confidence=float(result.confidence or 0.0),
                )
                log_event(logger, "performance_timing", metric="ocr_after_vision_reject_duration_ms", duration_ms=ocr_ms, run_id=run_id or "")
    else:
        extract_started = stage_start(logger, "ocr", pdf_path=pdf_path, run_id=run_id or "")
        result = _with_guard(
            _ocr_semaphore,
            extract_text_pdf,
            pdf_path=pdf_path,
            fmt=fmt,
            layout=layout,
            debug_mode=debug_mode,
            run_id=run_id,
            request_cache=extraction_cache,
        )
        ocr_ms = int((time.time() - extract_started) * 1000)
        stage_complete(
            logger,
            "ocr",
            extract_started,
            run_id=run_id or "",
            used_ocr=bool(result.used_ocr),
            confidence=float(result.confidence or 0.0),
        )
        log_event(logger, "performance_timing", metric="ocr_duration_ms", duration_ms=ocr_ms, run_id=run_id or "")

    # -----------------------------------------------------------------------
    # 3. OCR escalation fallback
    # -----------------------------------------------------------------------

    if force_ocr and not is_image and not use_vision:
        logger.debug("Force OCR requested on non-image PDF; extractor will use OCR route")

    if (not use_vision) and ((not result.success) or (is_image and not result.used_ocr)) and not _is_deterministic_structured_failure(result):

        logger.warning(
            "Primary extraction incomplete -> retrying extraction"
        )

        retry = extract_text_pdf(
            pdf_path=pdf_path,
            fmt=fmt,
            layout=layout,
            debug_mode=debug_mode,
            run_id=run_id,
            request_cache=extraction_cache,
            retry_downstream_only=bool(extraction_cache.get("table_extraction_completed")),
            retry_reason="primary_incomplete",
        )
        if retry.success or (not result.success):
            result = retry

    if (not use_vision) and (result.confidence < 0.65 or not result.success) and not _is_deterministic_structured_failure(result):

        logger.debug("Low-confidence extraction detected; running retry strategies")

        for strategy in _RETRY_STRATEGIES:
            retried = extract_text_pdf(
                pdf_path=pdf_path,
                fmt=fmt,
                layout=layout,
                config_overrides=strategy["overrides"],
                debug_mode=debug_mode,
                run_id=run_id,
                request_cache=extraction_cache,
                retry_downstream_only=bool(extraction_cache.get("table_extraction_completed")),
                retry_reason=f"strategy:{strategy['name']}",
            )

            if (retried.success and retried.confidence > result.confidence) or (not result.success and retried.success):
                result = retried

            if result.success and result.confidence >= 0.8:
                break

    vat_rate = float(company_profile.vat_rate if company_profile else 0.05)

    # -----------------------------------------------------------------------
    # 4. semantic recovery before financial finalization
    # -----------------------------------------------------------------------

    semantic_started = stage_start(logger, "semantic_normalization", run_id=run_id or "")
    semantic_timeout_s = max(2.0, float(CONFIG.timeouts.provider_timeout_ms) / 1000.0)
    try:
        _with_guard(_semantic_semaphore, _run_with_timeout, _apply_semantic_recovery, semantic_timeout_s, result, vat_rate)
    except FutureTimeoutError:
        result.warnings.append("semantic_skipped:timeout")
        result.warnings.append("review_recommended:semantic_timeout")
        log_event(
            logger,
            "timeout_degradation_activated",
            stage="semantic_normalization",
            run_id=run_id or "",
            timeout_s=semantic_timeout_s,
        )
    semantic_ms = int((time.time() - semantic_started) * 1000)
    stage_complete(
        logger,
        "semantic_normalization",
        semantic_started,
        run_id=run_id or "",
        warnings=len(result.warnings or []),
    )
    log_event(logger, "performance_timing", metric="semantic_duration_ms", duration_ms=semantic_ms, run_id=run_id or "")

    # -----------------------------------------------------------------------
    # 5. finalize immutable financials (authoritative payload)
    # -----------------------------------------------------------------------

    validation_started = stage_start(logger, "validation", run_id=run_id or "")
    _finalize_financials(result, vat_rate=vat_rate)
    validation_ms = int((time.time() - validation_started) * 1000)
    stage_complete(
        logger,
        "validation",
        validation_started,
        run_id=run_id or "",
        subtotal=float(result.financials.subtotal or 0.0),
        net_total=float(result.financials.net_payable or 0.0),
    )
    log_event(logger, "performance_timing", metric="validation_duration_ms", duration_ms=validation_ms, run_id=run_id or "")

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
    # Emit final source selection for debugging/observability
    try:
        if result.used_vision and not result.used_ocr:
            final_src = "vision"
        elif (not result.used_vision) and (not result.used_ocr) and result.rows:
            # Native PDF extraction (pdfplumber/Camelot/Tabula) produced rows
            final_src = "native_pdf"
        elif result.used_ocr and not result.used_vision:
            final_src = "ocr"
        elif result.used_ocr and result.used_vision:
            final_src = "hybrid"
        else:
            final_src = "unknown"
        log_event(logger, "FINAL_EXTRACTION_SOURCE", run_id=run_id or "", pdf_path=pdf_path, source=final_src)
        record_extraction_metric(
            "FINAL_EXTRACTION_METRICS",
            {
                "source": final_src,
                "employee_rows": len(result.rows),
                "subtotal": float(result.financials.subtotal or 0.0),
                "vat": float(result.financials.total_vat or 0.0),
                "net_total": float(result.financials.net_payable or 0.0),
                "confidence": float(result.confidence or 0.0),
            },
            logger=logger,
            run_id=run_id or "",
            pdf_path=pdf_path,
            stage="final_extraction",
            extra={"processing_time_ms": int((time.time() - started) * 1000)},
        )
    except Exception:
        pass
    stage_complete(
        logger,
        "worker_execution",
        total_started,
        run_id=run_id or "",
        success=bool(result.success),
        rows=len(result.rows),
    )

    return result
