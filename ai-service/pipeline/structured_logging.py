"""Structured logging helpers for extraction and benchmarking metrics."""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict


_ALLOWED_EVENTS = {
    "extraction_complete",
    "financial_state",
    "renderer_complete",
    "invoice_generated",
    "validation_failed",
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
    "TABLE_MERGE_COMPLETE",
    "FINANCIALS_EXTRACTED",
}


def _verbose_enabled() -> bool:
    return os.getenv("AI_VERBOSE_LOGS", "0").strip().lower() in {"1", "true", "yes"}


def log_event(logger: logging.Logger, event: str, **fields: Any) -> None:
    if not _verbose_enabled() and event not in _ALLOWED_EVENTS:
        return
    payload: Dict[str, Any] = {"event": event, **fields}
    logger.info(json.dumps(payload, ensure_ascii=True, sort_keys=True))
