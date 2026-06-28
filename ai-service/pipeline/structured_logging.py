<<<<<<< HEAD
﻿"""Structured logging helpers for extraction and benchmarking metrics."""
=======
"""Structured logging helpers for extraction and benchmarking metrics."""
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

from __future__ import annotations

import json
import logging
import os
<<<<<<< HEAD
import random
import time
from contextvars import ContextVar
from hashlib import sha256
from typing import Any, Dict

from config_runtime import CONFIG

=======
from typing import Any, Dict

>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

_ALLOWED_EVENTS = {
    "extraction_complete",
    "financial_state",
    "renderer_complete",
    "invoice_generated",
    "validation_failed",
<<<<<<< HEAD
    "table_detected",
    "table_classified",
    "table_parser_selected",
    "table_routing_summary",
    "attendance_rows_extracted",
    "summary_rows_extracted",
    "aggregation_results",
    "table_merge_complete",
    "deduction_detected",
    "financial_summary_detected",
    "deduction_extracted",
    "run_extraction_complete",
    "TABLE_DETECTED",
    "TABLE_REJECTED",
    "TABLE_CLASSIFIED",
    "TABLE_PARSER_SELECTED",
    "TABLE_ROUTING_SUMMARY",
    "COLUMN_MAPPING",
    "ATTENDANCE_ROW_PARSED",
    "SUMMARY_ROW_PARSED",
    "ROW_REJECTED",
    "ATTENDANCE_ROWS_EXTRACTED",
    "SUMMARY_ROWS_EXTRACTED",
    "AGGREGATION_COMPLETE",
    "VALIDATION_COMPLETE",
    "VALIDATION_CORRECTION",
    "NUMERIC_SANITY_CHECK",
    "NUMERIC_REPAIR_APPLIED",
    "AMOUNT_REPAIRED",
    "HOURS_REPAIRED",
    "ROW_CLUSTER_CREATED",
    "FIELD_DETECTED",
    "SEMANTIC_MATCH",
    "ROW_ACCEPTED",
    "ROW_REJECTED",
    "SEMANTIC_INPUT_STATS",
    "OCR_TOKEN_SAMPLE",
    "TOKEN_COLLECTION_FAILURE",
    "semantic_debug_dumped",
    "SEMANTIC_OUTPUT_STATS",
    "TOTAL_RECONCILIATION",
    "TABLE_MERGE_COMPLETE",
    "FINANCIALS_EXTRACTED",
    "stage_start",
    "stage_complete",
    "stage_failure",
    "circuit_breaker_opened",
    "circuit_breaker_half_open",
    "circuit_breaker_closed",
    "circuit_breaker_open_block",
    "ocr_skip_decision",
    "semantic_payload_reduced",
    "performance_timing",
    "large_pdf_detected",
    "ocr_truncation_activated",
    "semantic_payload_truncated",
    "timeout_degradation_activated",
    "ocr_cache_hit",
    "parser_retry_only",
    "skipped_duplicate_ocr",
    "cached_table_reuse",
}

_trace_context: ContextVar[Dict[str, Any]] = ContextVar("trace_context", default={})

FAILURE_CATEGORIES = {
    "OCR_FAILURE",
    "TABLE_EXTRACTION_FAILURE",
    "PROVIDER_TIMEOUT",
    "PROVIDER_UNAVAILABLE",
    "MALFORMED_JSON",
    "VALIDATION_FAILURE",
    "PDF_CORRUPTION",
    "WORKER_TIMEOUT",
    "UNKNOWN_FAILURE",
    "PROVIDER_OVERLOAD",
    "UNKNOWN_PROVIDER_ERROR",
=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
}


def _verbose_enabled() -> bool:
    return os.getenv("AI_VERBOSE_LOGS", "0").strip().lower() in {"1", "true", "yes"}


<<<<<<< HEAD
def _roll(rate: float) -> bool:
    bounded = max(0.0, min(1.0, float(rate)))
    return random.random() < bounded


def should_sample_trace() -> bool:
    return _roll(CONFIG.observability.trace_sampling_rate)


def should_sample_verbose() -> bool:
    if _verbose_enabled():
        return True
    return _roll(CONFIG.observability.verbose_sampling_rate)


def should_sample_debug_artifacts() -> bool:
    return _roll(CONFIG.observability.debug_artifact_sampling_rate)


def set_trace_context(*, request_id: str = "", trace_id: str = "", run_id: str = "") -> None:
    _trace_context.set(
        {
            "request_id": str(request_id or ""),
            "trace_id": str(trace_id or ""),
            "run_id": str(run_id or ""),
            "trace_sampled": should_sample_trace(),
            "verbose_sampled": should_sample_verbose(),
        }
    )


def get_trace_context() -> Dict[str, Any]:
    return dict(_trace_context.get() or {})


def classify_failure(error: Exception | str | None) -> str:
    msg = str(error or "").lower()
    if "ocr" in msg:
        return "OCR_FAILURE"
    if "table" in msg:
        return "TABLE_EXTRACTION_FAILURE"
    if "timeout" in msg or "timed out" in msg:
        return "PROVIDER_TIMEOUT"
    if "429" in msg or "overload" in msg or "too many requests" in msg:
        return "PROVIDER_OVERLOAD"
    if "unavailable" in msg or "connection" in msg or "refused" in msg:
        return "PROVIDER_UNAVAILABLE"
    if "json" in msg:
        return "MALFORMED_JSON"
    if "validation" in msg or "missing_keys" in msg:
        return "VALIDATION_FAILURE"
    if "pdf" in msg and ("corrupt" in msg or "unreadable" in msg):
        return "PDF_CORRUPTION"
    if "provider" in msg:
        return "UNKNOWN_PROVIDER_ERROR"
    return "UNKNOWN_FAILURE"


def hash_text(value: str) -> str:
    return sha256(str(value or "").encode("utf-8")).hexdigest()[:16]


def stage_start(logger: logging.Logger, stage: str, **fields: Any) -> float:
    started = time.time()
    log_event(logger, "stage_start", stage=stage, **fields)
    return started


def stage_complete(logger: logging.Logger, stage: str, started: float, **fields: Any) -> None:
    elapsed_ms = int((time.time() - started) * 1000)
    log_event(logger, "stage_complete", stage=stage, duration_ms=elapsed_ms, **fields)


def stage_failure(logger: logging.Logger, stage: str, started: float, error: Exception | str, **fields: Any) -> None:
    elapsed_ms = int((time.time() - started) * 1000)
    # Backward-compatible: allow callers to pass failure_category while keeping
    # automatic classification as a safe default.
    provided_category = fields.pop("failure_category", None)
    failure_category = str(provided_category or classify_failure(error) or "UNKNOWN_FAILURE")
    try:
        log_event(
            logger,
            "stage_failure",
            stage=stage,
            duration_ms=elapsed_ms,
            failure_category=failure_category,
            reason=str(error),
            **fields,
        )
    except Exception:
        # Never let logging failures mask the original pipeline exception.
        logger.exception("stage_failure logging failed", extra={"stage": stage})


def log_event(logger: logging.Logger, event: str, **fields: Any) -> None:
    trace_ctx = get_trace_context()
    sampled_verbose = bool(trace_ctx.get("verbose_sampled", False))
    if (not sampled_verbose) and event not in _ALLOWED_EVENTS:
        return
    payload: Dict[str, Any] = {
        "event": event,
        "request_id": trace_ctx.get("request_id", ""),
        "trace_id": trace_ctx.get("trace_id", ""),
        "run_id": trace_ctx.get("run_id", "") or fields.get("run_id", ""),
        **fields,
    }
=======
def log_event(logger: logging.Logger, event: str, **fields: Any) -> None:
    if not _verbose_enabled() and event not in _ALLOWED_EVENTS:
        return
    payload: Dict[str, Any] = {"event": event, **fields}
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    logger.info(json.dumps(payload, ensure_ascii=True, sort_keys=True))
