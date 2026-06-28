"""
validation.py  –  Extraction quality scoring.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

from schema import ExtractionResult
from pipeline.structured_logging import classify_failure, hash_text, stage_complete, stage_failure, stage_start


logger = logging.getLogger(__name__)


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _safe_ratio(part: float, whole: float) -> float:
    if whole <= 0:
        return 0.0
    return _clamp01(part / whole)


def score_extraction_details(result: ExtractionResult) -> Dict[str, Any]:
    """Return weighted document-level confidence and component breakdown."""
    rows = list(result.rows or [])
    fin = result.financials

    subtotal = float(fin.subtotal or 0.0)
    deduction = float(fin.total_deduction or 0.0)
    total_vat = float(fin.total_vat or 0.0)
    net_payable = float(fin.net_payable or 0.0)

    row_sum = round(sum(float(r.amount or 0.0) for r in rows), 2)
    expected_subtotal = row_sum if row_sum > 0 else subtotal
    adjusted = max(0.0, expected_subtotal - max(0.0, deduction))

    vat_rate = 0.05
    if rows:
        valid_vat_rows = [float(r.vat_rate or 0.0) for r in rows if float(r.vat_rate or 0.0) > 0.0]
        if valid_vat_rows:
            vat_rate = sum(valid_vat_rows) / len(valid_vat_rows)

    expected_vat = round(adjusted * vat_rate, 4)
    expected_net = round(adjusted + expected_vat, 2)

    ocr_confidence = _clamp01(float(result.confidence or 0.0))

    table_detection_confidence = 0.9 if rows else 0.0
    if any("No structured table reconstructed" in str(w) for w in (result.warnings or [])):
        table_detection_confidence = min(table_detection_confidence, 0.4)
    if any("Fallback generic OCR parser used" in str(w) for w in (result.warnings or [])):
        table_detection_confidence = min(table_detection_confidence, 0.55)
    if any("financial_source:financial_summary_table" in str(w) for w in (result.warnings or [])):
        table_detection_confidence = max(table_detection_confidence, 0.92)

    if expected_subtotal > 0:
        subtotal_reconciliation = _clamp01(1.0 - (abs(subtotal - expected_subtotal) / max(expected_subtotal, 1.0)))
    else:
        subtotal_reconciliation = 1.0 if subtotal <= 0.0 else 0.0

    if expected_vat > 0:
        vat_reconciliation = _clamp01(1.0 - (abs(total_vat - expected_vat) / max(expected_vat, 1.0)))
    else:
        vat_reconciliation = 1.0 if total_vat <= 0.01 else 0.0

    if expected_net > 0:
        financial_consistency = _clamp01(1.0 - (abs(net_payable - expected_net) / max(expected_net, 1.0)))
    else:
        financial_consistency = 1.0 if net_payable <= 0.01 else 0.0

    row_consistency = 0.0
    if rows:
        valid_rows = sum(1 for r in rows if r.validation_ok)
        row_consistency = _safe_ratio(valid_rows, len(rows))

    semantic_header_confidence = 0.9 if rows else 0.0
    mismatch_flags = [w for w in (result.warnings or []) if "mismatch" in str(w).lower()]
    if mismatch_flags:
        semantic_header_confidence = max(0.2, semantic_header_confidence - min(0.6, 0.08 * len(mismatch_flags)))

    weighted = (
        0.20 * ocr_confidence
        + 0.15 * table_detection_confidence
        + 0.20 * financial_consistency
        + 0.10 * semantic_header_confidence
        + 0.10 * row_consistency
        + 0.15 * subtotal_reconciliation
        + 0.10 * vat_reconciliation
    )

    return {
        "score": round(_clamp01(weighted), 4),
        "components": {
            "ocr_confidence": round(ocr_confidence, 4),
            "table_detection_confidence": round(table_detection_confidence, 4),
            "financial_consistency": round(financial_consistency, 4),
            "semantic_header_confidence": round(semantic_header_confidence, 4),
            "row_consistency": round(row_consistency, 4),
            "subtotal_reconciliation": round(subtotal_reconciliation, 4),
            "vat_reconciliation": round(vat_reconciliation, 4),
        },
        "computed": {
            "row_sum": round(row_sum, 2),
            "expected_subtotal": round(expected_subtotal, 2),
            "expected_vat": round(expected_vat, 4),
            "expected_net_payable": round(expected_net, 2),
            "reported_subtotal": round(subtotal, 2),
            "reported_vat": round(total_vat, 4),
            "reported_net_payable": round(net_payable, 2),
        },
    }


def score_extraction(result: ExtractionResult) -> float:
    """Return weighted quality score 0.0-1.0 for an ExtractionResult."""
    return float(score_extraction_details(result).get("score", 0.0))


def validate_strict_model_payload(raw_output: str) -> Dict[str, Any]:
    """
    Validate strict JSON model output contract.

    Required top-level keys:
    - format
    - client
    - timesheet_meta
    - rows
    - totals
    """

    started = stage_start(
        logger,
        "validation",
        payload_size=len(raw_output or ""),
        payload_hash=hash_text(raw_output or ""),
    )
    try:
        parsed = json.loads(raw_output)
        if not isinstance(parsed, dict):
            raise ValueError("model_output_must_be_object")

        required = ["format", "client", "timesheet_meta", "rows", "totals"]
        missing = [k for k in required if k not in parsed]
        if missing:
            raise ValueError(f"model_output_missing_keys:{','.join(missing)}")

        if not isinstance(parsed.get("rows"), list):
            raise ValueError("model_output_rows_must_be_array")
        if not isinstance(parsed.get("client"), dict):
            raise ValueError("model_output_client_must_be_object")
        if not isinstance(parsed.get("timesheet_meta"), dict):
            raise ValueError("model_output_timesheet_meta_must_be_object")
        if not isinstance(parsed.get("totals"), dict):
            raise ValueError("model_output_totals_must_be_object")

        stage_complete(logger, "validation", started)
        return parsed
    except Exception as exc:
        stage_failure(
            logger,
            "validation",
            started,
            exc,
            failure_category=classify_failure(exc),
        )
        raise
