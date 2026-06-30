"""
extractor.py

Enterprise-compatible extraction adapter.

This module keeps legacy public APIs while switching to:
- deterministic local extraction pipeline (`pipeline.run.run_extraction`)
- local Ollama semantic normalization (Qwen2.5 7B Instruct)
- strict JSON-only semantic output contracts

No paid APIs are used.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from providers.llm import get_llm_provider
from pipeline.run import run_extraction
from pipeline.vision_runner import extract_using_vision as _extract_using_vision_result
from pipeline.vision_runner import scanned_or_image_pdf
from pipeline.structured_logging import classify_failure, get_trace_context, log_event
from validation import validate_strict_model_payload
from config_runtime import CONFIG

logger = logging.getLogger(__name__)


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _semantic_enabled_for_mode(mode: str) -> bool:
    if mode == "deterministic_only":
        return False
    if mode in {"hybrid", "semantic_full"}:
        return bool(CONFIG.feature_flags.enable_semantic_extraction)
    return bool(CONFIG.feature_flags.enable_semantic_extraction)


def _is_pdf_readable(pdf_path: str) -> bool:
    try:
        from pypdf import PdfReader

        reader = PdfReader(pdf_path)
        return len(reader.pages) > 0
    except Exception:
        return False


def _clean(v: Any) -> str:
    return " ".join(str(v or "").split())


def _to_float(v: Any, default: float = 0.0) -> float:
    if v is None:
        return default
    if isinstance(v, (int, float)):
        return float(v)
    cleaned = re.sub(r"[^0-9.\-]", "", str(v))
    try:
        return float(cleaned) if cleaned else default
    except ValueError:
        return default


def _normalize_optional_id(value: Any) -> Optional[str]:
    cleaned = _clean(value)
    return cleaned if cleaned else None


def _normalize_trade(value: Any) -> str:
    return _clean(value).upper()


def _is_non_trade_row(trade: str) -> bool:
    blocked = {
        "TOTAL",
        "SUBTOTAL",
        "GRAND TOTAL",
        "NET TOTAL",
        "NET AMOUNT",
        "NET AMOUNT PAYABLE",
        "GROSS TOTAL",
        "DEDUCTION",
        "DEDUCTIONS",
        "TOTAL DEDUCTION",
        "VAT",
        "BALANCE",
        "SUMMARY",
    }
    return _normalize_trade(trade) in blocked


def merge_rows(rows: List[Dict[str, Any]], fmt: str = "unknown") -> List[Dict[str, Any]]:
    merged: Dict[Tuple[str, str, str], Dict[str, Any]] = {}

    for row in rows or []:
        trade = _normalize_trade(row.get("trade"))
        if not trade or _is_non_trade_row(trade):
            continue

        project_id = _normalize_optional_id(row.get("project_id"))
        employee_id = _normalize_optional_id(row.get("employee_id"))
        hours = max(0.0, _to_float(row.get("hours")))
        rate = max(0.0, _to_float(row.get("rate")))
        amount = max(0.0, _to_float(row.get("amount")))

        if fmt == "mcc":
            key = (trade, project_id or "", "")
        elif fmt == "bkc":
            key = (trade, "", employee_id or "")
        else:
            key = (trade, project_id or "", employee_id or "")

        if key not in merged:
            merged[key] = {
                "trade": trade,
                "project_id": project_id,
                "employee_id": employee_id,
                "hours": hours,
                "rate": rate,
                "amount": amount,
            }
            continue

        cur = merged[key]
        cur["hours"] = round(_to_float(cur.get("hours")) + hours, 2)
        cur["amount"] = round(_to_float(cur.get("amount")) + amount, 2)
        if _to_float(cur.get("rate")) <= 0 and rate > 0:
            cur["rate"] = rate

    out = list(merged.values())
    for row in out:
        if _to_float(row.get("rate")) <= 0 and _to_float(row.get("hours")) > 0 and _to_float(row.get("amount")) > 0:
            row["rate"] = round(_to_float(row.get("amount")) / _to_float(row.get("hours")), 4)
    return out


def _detect_format_from_rows(rows: List[Dict[str, Any]]) -> str:
    has_project = any(_normalize_optional_id(r.get("project_id")) for r in rows or [])
    has_employee = any(_normalize_optional_id(r.get("employee_id")) for r in rows or [])
    if has_project and not has_employee:
        return "mcc"
    if has_employee and not has_project:
        return "bkc"
    if has_project and has_employee:
        return "generic"
    return "unknown"


def _result_to_payload(result_obj: Any) -> Dict[str, Any]:
    d = result_obj.to_dict()
    rows = [
        {
            "trade": _normalize_trade(r.get("trade")),
            "project_id": _normalize_optional_id(r.get("project_id")),
            "employee_id": _normalize_optional_id(r.get("employee_id")),
            "hours": _to_float(r.get("hours")),
            "rate": _to_float(r.get("rate")),
            "amount": _to_float(r.get("amount")),
        }
        for r in (d.get("rows") or [])
    ]

    fmt = str(d.get("format") or "unknown").lower()
    if fmt not in {"mcc", "bkc", "generic", "unknown"}:
        fmt = "unknown"

    meta = d.get("metadata") or {}
    financials = d.get("financials") or {}

    payload = {
        "format": fmt,
        "client": {
            "name": _clean(meta.get("client_name")),
            "trn": _normalize_optional_id(meta.get("client_trn")),
            "po_box": _normalize_optional_id(meta.get("client_po_box")),
            "address": _normalize_optional_id(meta.get("client_address")),
            "tel": _normalize_optional_id(meta.get("client_tel")),
            "fax": _normalize_optional_id(meta.get("client_fax")),
            "email": None,
        },
        "timesheet_meta": {
            "invoice_no": _normalize_optional_id(meta.get("source_invoice_no")),
            "period_from": _normalize_optional_id(meta.get("period_from")),
            "period_to": _normalize_optional_id(meta.get("period_to")),
            "invoice_month": _normalize_optional_id(meta.get("period_month")),
            "preparation_date": None,
            "timesheet_no": _normalize_optional_id(meta.get("timesheet_no")),
        },
        "rows": merge_rows(rows, fmt=fmt),
        "totals": {
            "subtotal": round(_to_float(financials.get("subtotal")), 2),
            "deductions": round(_to_float(financials.get("total_deduction")), 2),
            "deduction_breakdown": dict(financials.get("deduction_breakdown") or {}),
            "net_total": round(_to_float(financials.get("net_payable")), 2),
        },
        "confidence_score": round(_to_float(d.get("confidence")), 4),
        "warnings": list(d.get("warnings") or []),
    }

    if payload["format"] == "unknown":
        payload["format"] = _detect_format_from_rows(payload["rows"])

    return payload


def _semantic_chunk(result_payload: Dict[str, Any], raw_text: str) -> str:
    rows = list(result_payload.get("rows") or [])
    filtered_rows: List[Dict[str, Any]] = []
    for row in rows:
        trade = _clean((row or {}).get("trade"))
        hours = _to_float((row or {}).get("hours"))
        rate = _to_float((row or {}).get("rate"))
        amount = _to_float((row or {}).get("amount"))
        if not trade:
            continue
        if amount <= 0.0 and not (hours > 0.0 and rate > 0.0):
            continue
        filtered_rows.append(
            {
                "trade": trade,
                "project_id": _normalize_optional_id((row or {}).get("project_id")),
                "employee_id": _normalize_optional_id((row or {}).get("employee_id")),
                "hours": hours,
                "rate": rate,
                "amount": amount,
            }
        )

    seen_lines = set()
    compact_lines: List[str] = []
    decorative = {"page", "invoice", "timesheet", "www", "http", "fax", "tel", "logo"}
    for line in (raw_text or "").splitlines():
        clean_line = _clean(line)
        if not clean_line:
            continue
        low = clean_line.lower()
        if low in seen_lines:
            continue
        if len(clean_line) <= 3:
            continue
        if sum(ch.isdigit() for ch in clean_line) == 0 and any(tok in low for tok in decorative):
            continue
        seen_lines.add(low)
        compact_lines.append(clean_line)

    compact_text = "\n".join(compact_lines)
    max_semantic_chars = max(1200, int(os.getenv("MAX_SEMANTIC_RAW_TEXT_CHARS", "4500")))
    semantic_excerpt = compact_text[:max_semantic_chars]
    if len(compact_text) > max_semantic_chars:
        log_event(
            logger,
            "semantic_payload_truncated",
            max_semantic_raw_text_chars=max_semantic_chars,
            before_chars=len(compact_text),
            after_chars=len(semantic_excerpt),
        )
    chunk = {
        "detected_format": result_payload.get("format"),
        "client": result_payload.get("client"),
        "timesheet_meta": result_payload.get("timesheet_meta"),
        "rows": filtered_rows[:200],
        "totals": result_payload.get("totals"),
        "raw_text_excerpt": semantic_excerpt,
    }
    log_event(
        logger,
        "semantic_payload_reduced",
        rows_in=len(rows),
        rows_out=len(filtered_rows),
        raw_text_chars=len(raw_text or ""),
        compact_chars=len(compact_text),
    )
    return json.dumps(chunk, ensure_ascii=True)


def _ollama_semantic_refine(seed_payload: Dict[str, Any], semantic_chunk: str) -> Optional[Dict[str, Any]]:
    system_prompt = (
        "You normalize timesheet extraction into strict JSON only. "
        "Never output markdown or explanations. "
        "Return one valid JSON object with keys: format, client, timesheet_meta, rows, totals."
    )

    user_prompt = (
        "Use this structured chunk and normalize to schema exactly. "
        "Preserve all rows and financial values when already present. "
        "If unknown value, use null.\n\n"
        f"CHUNK={semantic_chunk}"
    )

    attempts = max(0, int(CONFIG.circuit_breaker.max_retries)) + 1
    for attempt in range(attempts):
        try:
            provider = get_llm_provider()
            parsed = provider.chat_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                num_predict=1800,
            )
            if isinstance(parsed, dict) and parsed.get("skipped") is True:
                return None
            return validate_strict_model_payload(json.dumps(parsed, ensure_ascii=True))
        except Exception as exc:
            failure_category = classify_failure(exc)
            logger.warning("Ollama semantic refine failed: %s", exc)
            log_event(
                logger,
                "stage_failure",
                stage="semantic_normalization",
                failure_category=failure_category,
                provider="ollama",
                breaker_state="unknown",
                retry_count=attempt,
                fallback_activated=True,
                trace_id=get_trace_context().get("trace_id", ""),
            )
            if attempt >= (attempts - 1):
                break
    return None


def _merge_semantic_overlay(base_payload: Dict[str, Any], overlay: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(base_payload)

    overlay_client = overlay.get("client") or {}
    overlay_meta = overlay.get("timesheet_meta") or {}

    merged["client"] = {
        **(base_payload.get("client") or {}),
        **{k: v for k, v in overlay_client.items() if _clean(v)},
    }
    merged["timesheet_meta"] = {
        **(base_payload.get("timesheet_meta") or {}),
        **{k: v for k, v in overlay_meta.items() if _clean(v)},
    }

    base_rows = list(base_payload.get("rows") or [])
    overlay_rows = overlay.get("rows") if isinstance(overlay.get("rows"), list) else []

    # Rows must stay grounded in deterministic table extraction. The local LLM
    # may normalize matching rows, but it must never create invoice rows from
    # raw OCR text when the structured extractor found none.
    rows = base_rows
    if base_rows and overlay_rows:
        base_keys = {
            (
                _normalize_trade(r.get("trade")),
                _clean(r.get("project_id")),
                _clean(r.get("employee_id")),
            )
            for r in base_rows
        }
        grounded_rows = [
            r
            for r in overlay_rows
            if (
                _normalize_trade((r or {}).get("trade")),
                _clean((r or {}).get("project_id")),
                _clean((r or {}).get("employee_id")),
            )
            in base_keys
        ]
        if grounded_rows:
            rows = grounded_rows

    merged["rows"] = merge_rows(rows, fmt=base_payload.get("format") or "unknown")

    base_totals = dict(base_payload.get("totals") or {})
    overlay_totals = dict(overlay.get("totals") or {})

    # Deterministic financial controls remain authoritative, overlay can fill gaps only.
    subtotal = _to_float(base_totals.get("subtotal"))
    deductions = _to_float(base_totals.get("deductions"))
    net_total = _to_float(base_totals.get("net_total"))

    if subtotal <= 0:
        subtotal = _to_float(overlay_totals.get("subtotal"))
    if deductions <= 0:
        deductions = _to_float(overlay_totals.get("deductions"))
    if net_total <= 0:
        net_total = _to_float(overlay_totals.get("net_total"))

    merged["totals"] = {
        "subtotal": round(subtotal, 2),
        "deductions": round(deductions, 2),
        "deduction_breakdown": base_totals.get("deduction_breakdown") or overlay_totals.get("deduction_breakdown") or {},
        "net_total": round(net_total, 2),
    }

    if merged.get("format") == "unknown":
        merged["format"] = _detect_format_from_rows(merged.get("rows") or [])

    return merged


def apply_semantic_overlay_to_result(result: Any) -> Any:
    """
    Apply local Ollama semantic normalization directly to an ExtractionResult.

    This intentionally does not add rows when deterministic table extraction
    found none. It is safe to call from Flask endpoints before validation and
    rendering.
    """
    mode = str(CONFIG.extraction.mode or "hybrid").lower()
    if not _semantic_enabled_for_mode(mode):
        result.warnings.append("semantic_skipped:disabled")
        return result

    payload = _result_to_payload(result)
    rows = list(payload.get("rows") or [])
    totals = payload.get("totals") or {}
    if not rows:
        result.warnings.append("semantic_skipped:no_grounded_rows")
        return result

    deterministic_ready = (
        _to_float(payload.get("confidence_score")) >= max(0.0, float(CONFIG.extraction.semantic_confidence_threshold or 0.6))
        and bool(rows)
        and _to_float(totals.get("subtotal")) > 0.0
        and _to_float(totals.get("net_total")) >= 0.0
    )

    if _env_flag("EXTRACTION_FAST_MODE", True) and deterministic_ready:
        result.warnings.append("semantic_skipped:fast_mode")
        return result

    semantic_input = _semantic_chunk(payload, getattr(result, "raw_text", "") or "")
    overlay = _ollama_semantic_refine(payload, semantic_input)
    if not overlay:
        result.warnings.append("semantic_skipped:no_overlay")
        return result

    merged = _merge_semantic_overlay(payload, overlay)
    meta = merged.get("timesheet_meta") or {}
    client = merged.get("client") or {}
    totals = merged.get("totals") or {}

    if not result.metadata.source_invoice_no and _clean(meta.get("invoice_no")):
        result.metadata.source_invoice_no = _clean(meta.get("invoice_no"))
    if not result.metadata.timesheet_no and _clean(meta.get("timesheet_no")):
        result.metadata.timesheet_no = _clean(meta.get("timesheet_no"))
    if not result.metadata.period_month and _clean(meta.get("invoice_month")):
        result.metadata.period_month = _clean(meta.get("invoice_month"))
    if not result.metadata.period_from and _clean(meta.get("period_from")):
        result.metadata.period_from = _clean(meta.get("period_from"))
    if not result.metadata.period_to and _clean(meta.get("period_to")):
        result.metadata.period_to = _clean(meta.get("period_to"))
    if not result.metadata.client_name and _clean(client.get("name")):
        result.metadata.client_name = _clean(client.get("name"))
    if not result.metadata.client_trn and _clean(client.get("trn")):
        result.metadata.client_trn = _clean(client.get("trn"))

    if float(result.financials.subtotal or 0.0) <= 0.0:
        result.financials.subtotal = _to_float(totals.get("subtotal"))
    if float(result.financials.total_deduction or 0.0) <= 0.0:
        result.financials.total_deduction = _to_float(totals.get("deductions"))
    if float(result.financials.net_payable or 0.0) <= 0.0:
        result.financials.net_payable = _to_float(totals.get("net_total"))

    result.warnings.append("semantic_provider:ollama")
    if not rows and merged.get("rows"):
        result.warnings.append("semantic_rows_rejected:not_grounded")
    return result


def extract_using_vision(pdf_path: str) -> Dict[str, Any]:
    """Compatibility wrapper for local Vision-LLM extraction."""
    result = _extract_using_vision_result(pdf_path=pdf_path)
    return _result_to_payload(result) | {
        "success": bool(result.success and result.rows),
        "used_vision": True,
        "warnings": list(result.warnings or []),
        "error": result.error,
    }


def extract_timesheet(
    pdf_path: str,
    api_key: Optional[str] = None,
    force_vision: bool = False,
) -> Dict[str, Any]:
    """
    Backward-compatible public API.

    `api_key` and `force_vision` are retained for compatibility but ignored.
    """
    _ = api_key  # Retained for compatibility
    _ = force_vision  # Retained for compatibility

    if not os.path.exists(pdf_path):
        return {"success": False, "error": f"File not found: {pdf_path}"}

    if not _is_pdf_readable(pdf_path):
        return {"success": False, "error": "Corrupted or unreadable PDF"}

    try:
        result = run_extraction(pdf_path=pdf_path)
        payload = _result_to_payload(result)

        mode = str(CONFIG.extraction.mode or "hybrid").lower()
        enable_semantic = _semantic_enabled_for_mode(mode)
        semantic_experimental = mode == "semantic_full"
        fast_mode_enabled = _env_flag("EXTRACTION_FAST_MODE", True)

        totals = payload.get("totals") or {}
        subtotal = _to_float(totals.get("subtotal"))
        deductions = _to_float(totals.get("deductions"))
        net_total = _to_float(totals.get("net_total"))
        rows = list(payload.get("rows") or [])
        if not rows and enable_semantic:
            enable_semantic = False
            payload.setdefault("warnings", []).append("semantic_skipped:no_grounded_rows")

        deterministic_ready = (
            _to_float(payload.get("confidence_score")) >= max(0.0, float(CONFIG.extraction.semantic_confidence_threshold or 0.6))
            and bool(rows)
            and subtotal > 0.0
            and deductions >= 0.0
            and net_total >= 0.0
        )
        if fast_mode_enabled and enable_semantic and deterministic_ready:
            enable_semantic = False
            payload.setdefault("warnings", []).append("semantic_skipped:fast_mode")
            log_event(
                logger,
                "stage_complete",
                stage="semantic_fast_mode",
                extraction_mode=mode,
                skipped=True,
                reason="deterministic_confidence_high",
            )

        log_event(
            logger,
            "stage_start",
            stage="semantic_normalization",
            extraction_mode=mode,
            provider="ollama",
            fallback_activated=False,
            semantic_experimental=semantic_experimental,
        )

        if enable_semantic:
            semantic_input = _semantic_chunk(payload, getattr(result, "raw_text", "") or "")
            overlay = _ollama_semantic_refine(payload, semantic_input)
            if overlay:
                payload = _merge_semantic_overlay(payload, overlay)
                log_event(
                    logger,
                    "stage_complete",
                    stage="semantic_normalization",
                    extraction_mode=mode,
                    provider="ollama",
                    fallback_activated=False,
                    semantic_experimental=semantic_experimental,
                )
            else:
                log_event(
                    logger,
                    "stage_complete",
                    stage="semantic_normalization",
                    extraction_mode=mode,
                    provider="ollama",
                    fallback_activated=True,
                    semantic_experimental=semantic_experimental,
                )
        else:
            log_event(
                logger,
                "stage_complete",
                stage="semantic_normalization",
                extraction_mode=mode,
                provider="disabled",
                fallback_activated=True,
                semantic_experimental=semantic_experimental,
            )

        totals = payload.get("totals") or {}
        subtotal = _to_float(totals.get("subtotal"))
        deductions = _to_float(totals.get("deductions"))
        net_total = _to_float(totals.get("net_total"))

        if subtotal <= 0 and payload.get("rows"):
            subtotal = round(sum(_to_float(r.get("amount")) for r in payload.get("rows", [])), 2)
            totals["subtotal"] = subtotal

        if net_total <= 0:
            totals["net_total"] = round(max(0.0, subtotal - deductions), 2)

        payload["totals"] = totals

        return {
            "success": bool(result.success and len(payload.get("rows") or []) > 0),
            **payload,
        }
    except Exception as exc:
        logger.exception("extract_timesheet failed")
        return {"success": False, "error": str(exc)}

def extract_document(pdf_path: str, config: dict, observability: dict = None) -> dict:
    """Main entry for document extraction with OCR optimization safeguards."""
    # Use optimized text extraction (with skip/caching/fallback)
    text, ocr_meta = extract_text_pdf(pdf_path, config, observability)
    # If ocr_meta indicates fallback or skip, emit observability event
    if ocr_meta.get("ocr_skipped"):
        log_event("ocr_skipped", {"pdf_path": pdf_path})
    if ocr_meta.get("ocr_used"):
        log_event("ocr_used", {"pdf_path": pdf_path})
    # ...existing extraction logic using 'text'...
