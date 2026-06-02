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
}


def _verbose_enabled() -> bool:
    return os.getenv("AI_VERBOSE_LOGS", "0").strip().lower() in {"1", "true", "yes"}


def log_event(logger: logging.Logger, event: str, **fields: Any) -> None:
    if not _verbose_enabled() and event not in _ALLOWED_EVENTS:
        return
    payload: Dict[str, Any] = {"event": event, **fields}
    logger.info(json.dumps(payload, ensure_ascii=True, sort_keys=True))
