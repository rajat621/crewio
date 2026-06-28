"""Universal text + OCR extraction with intelligent routing and table reconstruction."""

from __future__ import annotations
import threading
import logging
import os
import re
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple
from types import SimpleNamespace

import cv2
import numpy as np
import pdfplumber

try:
    import numpy as _np
    from pdf2image import convert_from_path as _convert_from_path

    _OCR_OK = True
except ImportError:
    _np = None
    _convert_from_path = None
    _OCR_OK = False

from providers.ocr import get_ocr_provider

from schema import (
    ExtractionResult,
    InvoiceFinancials,
    InvoiceLayout,
    InvoiceRow,
    TimesheetFormat,
    TimesheetMetadata,
)

from pipeline.debug_utils import DebugExporter, ensure_debug
from pipeline.deduction_parser import extract_deduction_total
from pipeline.extraction_config import apply_runtime_overrides, apply_template_overrides, config_to_dict, load_extraction_config
from pipeline.extraction_metrics import record_extraction_metric, set_extraction_metrics_context
from pipeline.page_preprocessing import preprocess_page_for_ocr, preprocess_pages_for_ocr
from pipeline.ocr_box_repair import repair_ocr_box_geometry
from pipeline.scan_quality import score_scan_quality
from pipeline.semantic_filter import filter_labour_rows
from pipeline.structured_logging import log_event
from pipeline.profiler import new_request_collector, set_current, current
from pipeline.structured_logging import (
    classify_failure,
    should_sample_debug_artifacts,
    stage_complete,
    stage_failure,
    stage_start,
)
from pipeline.tables import (
    CellExtractor,
    CellExtractorConfig,
    GridReconstructor,
    GridReconstructorConfig,
    TableDetector,
    TableDetectorConfig,
    TableNormalizer,
    TableNormalizerConfig,
    TableType,
    merge_table_payloads,
    route_document_tables,
)
from pipeline.template_learning import TemplateLearningStore, build_template_fingerprint
from pipeline.template_profiles import detect_template_profile
from config_runtime import CONFIG

logger = logging.getLogger(__name__)


_OCR_META_CACHE: Dict[str, Dict[str, Any]] = {}
_OCR_META_CACHE_LOCK = threading.Lock()


def _env_int(name: str, default: int, minimum: int = 0) -> int:
    try:
        value = int(str(os.getenv(name, "")).strip())
    except Exception:
        value = default
    return max(minimum, value)


def _env_float(name: str, default: float, minimum: float = 0.0) -> float:
    try:
        value = float(str(os.getenv(name, "")).strip())
    except Exception:
        value = default
    return max(minimum, value)


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _table_ocr_budget_s() -> float:
    configured = min(
        float(CONFIG.timeouts.ocr_timeout_ms or 45000),
        float(CONFIG.timeouts.table_extraction_timeout_ms or 45000),
        max(5000.0, float(CONFIG.timeouts.backend_request_timeout_ms or 45000) - 8000.0),
    )
    budget_ms = _env_int("TABLE_OCR_HARD_BUDGET_MS", int(configured), minimum=5000)
    return max(5.0, float(budget_ms) / 1000.0)


def _budget_expired(started: float, budget_s: float) -> bool:
    return (time.time() - started) >= max(1.0, float(budget_s))


def _clean(v: Any) -> str:
    return " ".join(str(v).split()) if v is not None else ""


def _to_float(v: Any, default: float = 0.0) -> float:
    if v is None:
        return default
    if isinstance(v, (int, float)):
        return float(v)

    cleaned = re.sub(r"[^0-9.\-]", "", str(v))
    if not cleaned or cleaned in {".", "-"}:
        return default

    try:
        return float(cleaned)
    except Exception:
        return default


_INV_NO_RE = re.compile(r"Invoice\s+No[.\s#]*(\w+)", re.I)
_PERIOD_RE = re.compile(r"From\s+(\d{2}/\d{2}/\d{4})\s+to\s+(\d{2}/\d{2}/\d{4})", re.I)
_MONTH_RE = re.compile(r"(?:for the month of|month[:\s]+)\s*([A-Z]+\s+\d{4})", re.I)
_TRN_RE = re.compile(r"TRN[:\s]+(\d+)", re.I)
_SUB_RE = re.compile(r"SUB-CONTRACTOR\s*:\s*\S+\s+(.*?)(?:\n|P\.O\.|TRN)", re.I | re.S)
_TS_NO_RE = re.compile(r"Timesheet\s+No[.\s:]*(\S+)", re.I)
_PROJECT_RE = re.compile(r"\bP\d{3,8}[A-Z0-9]*\b", re.I)
_ATTENDANCE_TOKEN_RE = re.compile(r"\b(W|A|H|OFF)\b", re.I)
_DEDUCTION_KEYS = {"deduction", "penalty", "gas", "safety", "absent", "advance", "loan", "fine"}
_SKIP_FIRST = {"total", "additions", "deductions", "total deduction aed", "gross total aed", "net amount payable aed"}


def _extract_metadata(full_text: str) -> TimesheetMetadata:
    meta = TimesheetMetadata()

    m = _INV_NO_RE.search(full_text)
    if m:
        meta.source_invoice_no = m.group(1).strip()

    m = _TS_NO_RE.search(full_text)
    if m:
        meta.timesheet_no = m.group(1).strip()

    m = _PERIOD_RE.search(full_text)
    if m:
        meta.period_from = m.group(1)
        meta.period_to = m.group(2)

    m = _MONTH_RE.search(full_text)
    if m:
        meta.period_month = m.group(1).strip().upper()

    trns = _TRN_RE.findall(full_text)
    if trns:
        meta.client_trn = trns[0].strip()

    m = _SUB_RE.search(full_text)
    if m:
        meta.sub_contractor = " ".join(m.group(1).split()).strip()

    return meta


def _calculate_attendance_hours(cells: Sequence[str]) -> float:
    total = 0.0

    for cell in cells:
        val = str(cell).strip().upper()
        if not val or val in {"W", "A", "H", "OFF", "-"}:
            continue
        try:
            total += float(val)
        except Exception:
            continue

    return round(total, 2)


def _ocr_full_text(pdf_path: str) -> str:
    if (_convert_from_path is None) or (not _OCR_OK):
        return ""

    try:
        prof = current()
        with (prof or new_request_collector()).time_stage("rasterization"):
            pages = _convert_from_path(pdf_path, dpi=250)
        page_texts: List[str] = []

        ocr_provider = get_ocr_provider()
        if not ocr_provider.available():
            return ""

        with (prof or new_request_collector()).time_stage("preprocessing"):
            preprocessed_pages = preprocess_pages_for_ocr(pages, target_long_edge=2200)

        try:
            if prof:
                prof.incr("pages_processed", len(preprocessed_pages or []))
        except Exception:
            pass

        for page_idx, preprocessed in enumerate(preprocessed_pages, 1):
            log_event(
                logger,
                "performance_timing",
                metric="full_page_preprocess_ms",
                page=page_idx,
                duration_ms=int(preprocessed.timings_ms.get("total_ms", 0) or 0),
            )
            log_event(
                logger,
                "performance_timing",
                metric="page_orientation_rotation_ms",
                page=page_idx,
                duration_ms=int(
                    preprocessed.timings_ms.get("orientation_ms", 0)
                    + preprocessed.timings_ms.get("deskew_ms", 0)
                ),
            )
            tokens = ocr_provider.image_tokens(preprocessed.image)

            if not tokens:
                continue

            tokens.sort(key=lambda item: (item[0], item[1]))

            lines: List[str] = []
            current_y: Optional[float] = None
            current_line: List[Tuple[float, str]] = []

            for y, x, text in tokens:
                if current_y is None or abs(y - current_y) <= 18:
                    current_line.append((x, text))
                    current_y = y if current_y is None else (current_y + y) / 2
                else:
                    current_line.sort(key=lambda item: item[0])
                    lines.append(" ".join(text for _x, text in current_line))
                    current_line = [(x, text)]
                    current_y = y

            if current_line:
                current_line.sort(key=lambda item: item[0])
                lines.append(" ".join(text for _x, text in current_line))

            page_texts.append("\n".join(lines))

        return "\n".join(page_texts)

    except Exception as exc:
        logger.warning("OCR full-text failed: %s", exc)
        return ""


def _parse_mcc_summary_table(table: Sequence[Sequence[Any]]) -> Tuple[List[InvoiceRow], InvoiceFinancials]:
    rows: List[InvoiceRow] = []
    fin = InvoiceFinancials()
    h_idx = 0

    for i, row in enumerate(table):
        hdr = " ".join(_clean(c).upper() for c in (row or []) if c)
        if "TRADE" in hdr and "AMOUNT" in hdr:
            h_idx = i
            break

    for row in table[h_idx + 1 :]:
        if not row:
            continue

        row_vals = [_clean(v) for v in row]
        if not any(row_vals):
            continue

        c0 = row_vals[0].upper()
        c1 = row_vals[1] if len(row_vals) > 1 else ""
        last = row_vals[-1]

        # Always skip TOTAL row regardless of whether c1 is populated
        if c0 == "TOTAL":
            if fin.subtotal == 0.0:
                fin.subtotal = _to_float(last)
            continue

        if c0 in {"ADDITIONS", "DEDUCTIONS"} or (c0 == "" and c1):
            if any(dk in c1.lower() for dk in _DEDUCTION_KEYS):
                fin.deduction_breakdown[c1] = _to_float(last)
            continue

        if "TOTAL DEDUCTION" in c0:
            fin.total_deduction = _to_float(last)
            continue
        if "GROSS TOTAL" in c0:
            fin.gross_total = _to_float(last)
            continue
        if "NET AMOUNT" in c0:
            fin.net_payable = _to_float(last)
            continue
        if c0.lower() in _SKIP_FIRST:
            continue

        if len(row_vals) < 5:
            continue

        trade = row_vals[0]
        proj = row_vals[1]
        hours = _to_float(row_vals[2])
        rate = _to_float(row_vals[3])
        amount = _to_float(row_vals[4])

        if not trade or hours <= 0:
            continue

        # OCR decimal-corruption guard
        if hours > 0 and rate > 0:
            _expected = round(hours * rate, 2)
            if _expected > 0:
                _ratio = amount / _expected
                if _ratio < 0.1 or _ratio > 10:
                    amount = _expected

        rows.append(
            InvoiceRow(
                trade=trade.upper(),
                project_id=proj.upper() if proj else None,
                hours=hours,
                rate=rate,
                amount=amount,
            )
        )

    if fin.subtotal == 0.0:
        fin.subtotal = round(sum(r.amount for r in rows), 2)

    return rows, fin


_GENERIC_REJECT = (
    "TIMESHEET", "S#", "TRN", "INVOICE NO", "INVOICE DATE", "PREPARED BY",
    "APPROVED BY", "VAT REG", "PAGE ", "TOTAL HOURS", "NET RATE", "EMPLOYEE NAME",
    "H.I.NO", "H.I.NO.",
)

_GENERIC_METADATA_REJECT = (
    "PRINTDATE",
    "PREPARATIONDATE",
    "ISSUED TO",
    "EXECUTIVE NAME",
    "TIMESHEET",
    "TRN",
)

# Financial-summary labels that must NEVER become trade rows in any parser
_FINANCIAL_TRADE_BLOCK = frozenset({
    "TOTAL", "SUBTOTAL", "SUB TOTAL", "NET TOTAL", "GRAND TOTAL",
    "GROSS TOTAL", "NET AMOUNT", "NET AMOUNT PAYABLE", "VAT",
    "DEDUCTION", "DEDUCTIONS", "TOTAL DEDUCTION", "BALANCE", "SUMMARY",
})


def _is_financial_trade_exact(trade: str) -> bool:
    return str(trade or "").strip().upper() in _FINANCIAL_TRADE_BLOCK


def _aggregate_primary_rows(rows: Sequence[InvoiceRow]) -> List[InvoiceRow]:
    """
    Full-table aggregation (primary source):
      - if project_id exists, merge by (trade, project_id)
      - else merge by exact trade name only
    """
    aggregated: Dict[Tuple[str, str], InvoiceRow] = {}

    for row in rows or []:
        trade = _clean(row.trade).upper()
        if not trade or _is_financial_trade_exact(trade):
            continue

        project = _clean(row.project_id).upper() if row.project_id else ""
        key = (trade, project) if project else (trade, "")

        if key not in aggregated:
            aggregated[key] = InvoiceRow(
                trade=trade,
                project_id=project or None,
                employee_id=row.employee_id,
                hours=max(0.0, float(row.hours or 0.0)),
                rate=max(0.0, float(row.rate or 0.0)),
                amount=max(0.0, float(row.amount or 0.0)),
            )
            continue

        cur = aggregated[key]
        cur.hours = round(float(cur.hours or 0.0) + max(0.0, float(row.hours or 0.0)), 2)
        cur.amount = round(float(cur.amount or 0.0) + max(0.0, float(row.amount or 0.0)), 2)

        if cur.rate <= 0 and float(row.rate or 0.0) > 0:
            cur.rate = float(row.rate)

    result = list(aggregated.values())
    for row in result:
        if row.rate <= 0 and row.hours > 0 and row.amount > 0:
            row.rate = round(row.amount / row.hours, 4)
    return result


def _cross_validate_with_summary(
    primary_rows: Sequence[InvoiceRow],
    summary_rows: Sequence[InvoiceRow],
    warnings: List[str],
) -> List[InvoiceRow]:
    """
    Summary table is validation/correction layer only.
    It can repair OCR corruption and add missing trades, but does not use fuzzy matching.
    """
    out: Dict[Tuple[str, str], InvoiceRow] = {}
    corrections = 0

    for row in primary_rows or []:
        trade = _clean(row.trade).upper()
        if not trade or _is_financial_trade_exact(trade):
            continue
        project = _clean(row.project_id).upper() if row.project_id else ""
        out[(trade, project)] = InvoiceRow(
            trade=trade,
            project_id=row.project_id,
            employee_id=row.employee_id,
            hours=max(0.0, float(row.hours or 0.0)),
            rate=max(0.0, float(row.rate or 0.0)),
            amount=max(0.0, float(row.amount or 0.0)),
        )

    summary_map: Dict[Tuple[str, str], InvoiceRow] = {}
    for row in summary_rows or []:
        trade = _clean(row.trade).upper()
        if not trade or _is_financial_trade_exact(trade):
            continue
        if re.search(r"\d", trade):
            continue
        if any(tok in trade for tok in ("ID", "EMPLOYEE", "RATE", "AMOUNT", "MONTH", "NET", "TOTAL")):
            continue
        project = _clean(row.project_id).upper() if row.project_id else ""
        summary_map[(trade, project)] = row

    # Repair existing primary rows from summary layer.
    for (trade, project), row in list(out.items()):
        s = summary_map.get((trade, project)) or (summary_map.get((trade, "")) if project else None)
        if not s:
            continue

        # For exact trade matches, summary layer is the validation/correction source.
        # Replace corrupted primary values with summary values when present.
        if float(s.hours or 0.0) > 0 and abs(float(row.hours or 0.0) - float(s.hours or 0.0)) > 0.01:
            row.hours = float(s.hours)
            corrections += 1
        if float(s.rate or 0.0) > 0 and abs(float(row.rate or 0.0) - float(s.rate or 0.0)) > 0.01:
            row.rate = float(s.rate)
            corrections += 1
        if float(s.amount or 0.0) > 0 and abs(float(row.amount or 0.0) - float(s.amount or 0.0)) > 0.01:
            row.amount = float(s.amount)
            corrections += 1

        # OCR sanity: expected = hours * rate
        if row.hours > 0 and row.rate > 0:
            expected = round(row.hours * row.rate, 2)
            if row.amount > 0 and expected > 0:
                ratio = row.amount / expected
                if ratio < 0.1 or ratio > 10:
                    logger.info(
                        "VALIDATION_CORRECTION | trade=%s | old_amount=%s | expected=%s",
                        trade,
                        row.amount,
                        expected,
                    )
                    row.amount = expected
                    corrections += 1

        # Summary is allowed to repair notable mismatches for the same exact trade.
        summary_amount = max(0.0, float(s.amount or 0.0))
        if summary_amount > 0 and row.amount > 0:
            if abs(summary_amount - row.amount) > max(1.0, row.amount * 0.25):
                logger.info(
                    "VALIDATION_CORRECTION | trade=%s | old_amount=%s | summary_amount=%s",
                    trade,
                    row.amount,
                    summary_amount,
                )
                row.amount = summary_amount
                corrections += 1

    # Add missing trades from summary layer.
    for (trade, project), s in summary_map.items():
        if (trade, project) in out:
            continue
        out[(trade, project)] = InvoiceRow(
            trade=trade,
            project_id=project or None,
            employee_id=None,
            hours=max(0.0, float(s.hours or 0.0)),
            rate=max(0.0, float(s.rate or 0.0)),
            amount=max(0.0, float(s.amount or 0.0)),
        )
        corrections += 1
        logger.info("VALIDATION_CORRECTION | added_missing_trade=%s", trade)

    warnings.append(f"summary_validation_corrections:{corrections}")
    return list(out.values())


def _parse_generic_rows(full_text: str) -> List[InvoiceRow]:
    rows: List[InvoiceRow] = []

    for line in full_text.splitlines():
        ln = " ".join(line.split())
        logger.info("OCR_ROW_RAW | %s", ln)
        if len(ln) < 8:
            logger.info("ROW_REJECTED | reason=generic:too_short | row=%s", ln)
            continue

        ln_upper = ln.upper()
        if any(rej in ln_upper for rej in _GENERIC_REJECT):
            logger.info("ROW_REJECTED | reason=generic:header_or_metadata | row=%s", ln)
            continue
        if any(rej in ln_upper for rej in _GENERIC_METADATA_REJECT):
            logger.info("ROW_REJECTED | reason=generic:metadata_keyword | row=%s", ln)
            continue

        numbers = re.findall(r"\d{1,3}(?:,\d{3})*(?:\.\d+)?", ln)
        if len(numbers) < 2:
            logger.info("ROW_REJECTED | reason=generic:insufficient_numbers | row=%s", ln)
            continue

        proj = _PROJECT_RE.search(ln)
        words = ln.split()
        trade_words: List[str] = []
        for word in words:
            if re.match(r"^[A-Z]{1,3}\d+", word) or re.match(r"^\d", word):
                break
            trade_words.append(word)

        trade_name = " ".join(trade_words).strip()
        if not trade_name:
            logger.info("ROW_REJECTED | reason=generic:empty_trade | row=%s", ln)
            continue
        if not re.fullmatch(r"[A-Za-z][A-Za-z\s&./-]{1,40}", trade_name):
            logger.info("ROW_REJECTED | reason=generic:invalid_trade_text | row=%s", ln)
            continue
        if trade_name.upper() in _FINANCIAL_TRADE_BLOCK:
            logger.info("ROW_REJECTED | reason=generic:financial_trade | row=%s", ln)
            continue

        _hours = 0.0
        _rate = 0.0
        _amount = 0.0

        if len(numbers) >= 3:
            _hours = _to_float(numbers[0])
            _rate = _to_float(numbers[1])
            _amount = _to_float(numbers[2])
        else:
            # Handle compact OCR lines like: "Carpenter 10 50.00"
            # where hours may be missing but can be inferred.
            n1 = _to_float(numbers[0])
            n2 = _to_float(numbers[1])
            if n1 > 0 and n2 > 0 and n1 <= 100 and n2 >= n1:
                _rate = n1
                _amount = n2
                _hours = round(_amount / _rate, 2)
            elif n1 > 0 and n2 > 0 and n2 <= 100 and n1 > n2:
                _hours = n1
                _rate = n2
                _amount = round(_hours * _rate, 2)
            else:
                logger.info("ROW_REJECTED | reason=generic:ambiguous_two_number_row | row=%s", ln)
                continue

        if _hours <= 0 or _rate <= 0:
            logger.info("ROW_REJECTED | reason=generic:invalid_hours_or_rate | row=%s", ln)
            continue

        if _hours > 0 and _rate > 0:
            _expected = round(_hours * _rate, 2)
            if _expected > 0:
                _ratio = _amount / _expected
                if _ratio < 0.1 or _ratio > 10:
                    logger.warning(
                        "Amount sanity correction (generic) | trade=%s | extracted=%s | expected=%s",
                        trade_name, _amount, _expected,
                    )
                    _amount = _expected

        rows.append(
            InvoiceRow(
                trade=trade_name.upper(),
                project_id=proj.group(0).upper() if proj else None,
                hours=_hours,
                rate=_rate,
                amount=_amount,
            )
        )

    return rows


_ATTENDANCE_GRID_ROW_RE = re.compile(
    r"^\s*(?P<seq>\d+)\s+"
    r"(?P<emp_id>[A-Z]{1,3}\d{4,8})\s+"
    r"(?P<emp_name>.+?)\s+"
    r"(?P<trade>Tile\s*Mason|Steel\s*Fixer|Steelfixer|Carpenter|Helper|Mason|Plumber|Electrician|Painter|Welder|Labourer|Laborer|Foreman|Driver|Operator|Technician)\s+"
    r"(?P<rate>\d+(?:\.\d+)?)\s+"
    r"(?P<net_total>\d+(?:\.\d+)?)\s+"
    r"(?P<month>January|February|March|April|May|June|July|August|September|October|November|December)\b",
    re.I,
)

_SUMMARY_ROW_RE = re.compile(
    r"^\s*(?P<trade>Tile\s*Mason|Steel\s*Fixer|Steelfixer|Carpenter|Helper|Mason|Plumber|Electrician|Painter|Welder|Labourer|Laborer|Foreman|Driver|Operator|Technician)\s+"
    r"(?P<hours>\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s+"
    r"(?P<rate>\d+(?:\.\d+)?)\s+"
    r"(?P<amount>\d{1,3}(?:,\d{3})*(?:\.\d+)?)\b",
    re.I,
)


def _parse_attendance_grid_from_ocr_text(full_text: str) -> Tuple[List[InvoiceRow], InvoiceFinancials, List[str]]:
    attendance_rows: List[InvoiceRow] = []
    summary_rows: List[InvoiceRow] = []
    fin = InvoiceFinancials()
    warnings: List[str] = []
    attendance_seen = 0
    summary_seen = 0

    for raw_line in (full_text or "").splitlines():
        line = " ".join(raw_line.split())
        if not line:
            continue

        upper = line.upper()
        if upper.startswith(("S#", "ISSUED TO", "EXECUTIVE NAME", "PREPARED BY", "CHECKED BY", "APPROVED BY")):
            continue

        grid_match = _ATTENDANCE_GRID_ROW_RE.search(line)
        if grid_match:
            attendance_seen += 1
            trade = _clean(grid_match.group("trade")).upper()
            rate = _to_float(grid_match.group("rate"))
            net_total = _to_float(grid_match.group("net_total"))
            emp_id = _clean(grid_match.group("emp_id")).upper()
            if trade and rate > 0 and net_total > 0:
                amount = round(rate * net_total, 2)
                attendance_rows.append(
                    InvoiceRow(
                        trade=trade,
                        employee_id=emp_id,
                        hours=round(net_total, 2),
                        rate=round(rate, 2),
                        amount=amount,
                    )
                )
            continue

        summary_match = _SUMMARY_ROW_RE.search(line)
        if summary_match:
            summary_seen += 1
            trade = _clean(summary_match.group("trade")).upper()
            hours = _to_float(summary_match.group("hours"))
            rate = _to_float(summary_match.group("rate"))
            amount = _to_float(summary_match.group("amount"))
            if trade and hours > 0 and rate > 0 and amount > 0:
                expected = round(hours * rate, 2)
                if expected > 0 and abs(amount - expected) > max(2.0, expected * 0.2):
                    amount = expected
                summary_rows.append(
                    InvoiceRow(
                        trade=trade,
                        hours=round(hours, 2),
                        rate=round(rate, 2),
                        amount=round(amount, 2),
                    )
                )
            continue

        label_key = re.sub(r"[^A-Z]", "", upper)
        nums = re.findall(r"\d{1,3}(?:,\d{3})*(?:\.\d+)?", line)
        if label_key.startswith("TOTALDEDUCTIONAED"):
            fin.total_deduction = _to_float(nums[-1] if nums else line)
            continue
        if label_key.startswith("NETAMOUNTPAYABLEAED"):
            fin.net_payable = _to_float(nums[-1] if nums else line)
            continue
        if label_key.startswith("DEDUCTIONABSENTAMOUNT") and float(fin.total_deduction or 0.0) <= 0.0:
            fin.total_deduction = _to_float(nums[-1] if nums else line)
            continue
        if upper.startswith("TOTAL "):
            if nums:
                fin.subtotal = _to_float(nums[-1])
                if len(nums) > 1:
                    fin.gross_total = _to_float(nums[-1])
            continue

    if summary_rows:
        warnings.append(f"full_page_ocr_summary_rows:{len(summary_rows)}")
        warnings.append(f"full_page_ocr_attendance_rows_seen:{attendance_seen}")
        return summary_rows, fin, warnings

    if attendance_rows:
        warnings.append(f"full_page_ocr_attendance_rows:{len(attendance_rows)}")
        warnings.append(f"full_page_ocr_summary_rows_seen:{summary_seen}")
        return attendance_rows, fin, warnings

    return [], fin, warnings


def _extract_pdf_text_tables(pdf_path: str) -> Tuple[str, List[InvoiceRow], InvoiceFinancials, int, float]:
    rows: List[InvoiceRow] = []
    fin = InvoiceFinancials()
    full_text_parts: List[str] = []
    total_chars = 0
    page_count = 0
    textful_pages = 0

    prof = current()
    with (prof or new_request_collector()).time_stage("pdf_load"):
        with pdfplumber.open(pdf_path) as pdf:
            total_pages = len(pdf.pages)
            page_limit = max(1, int(CONFIG.resource_limits.max_pdf_pages or 1))
            process_pages = min(total_pages, page_limit)
            for page in pdf.pages[:process_pages]:
                page_count += 1
                page_text = page.extract_text() or ""
                full_text_parts.append(page_text)
                total_chars += len(page_text)
                if len(page_text.strip()) >= 40:
                    textful_pages += 1

                for tbl in page.extract_tables() or []:
                    if not tbl or len(tbl) < 2:
                        continue
                    hdr = " ".join(_clean(c).upper() for c in (tbl[0] or []) if c)
                    if "TRADE" in hdr and "AMOUNT" in hdr:
                        parsed_rows, parsed_fin = _parse_mcc_summary_table(tbl)
                        if parsed_rows:
                            rows = parsed_rows
                            fin = parsed_fin

    # record page counts in profiler metadata
    try:
        if prof:
            prof.set_meta("pages_processed", page_count)
            prof.set_meta("textful_pages", textful_pages)
    except Exception:
        pass

    if total_pages > process_pages:
        log_event(
            logger,
            "large_pdf_detected",
            pdf_path=pdf_path,
            total_pages=total_pages,
            processed_pages=process_pages,
            max_pdf_pages=page_limit,
        )
    scanned_ratio = 1.0 - (float(textful_pages) / float(page_count)) if page_count > 0 else 1.0
    return "\n".join(full_text_parts), rows, fin, total_chars, max(0.0, min(1.0, scanned_ratio))


def _downscale_for_ocr(image: np.ndarray) -> Tuple[np.ndarray, bool]:
    max_side = int(os.getenv("MAX_OCR_IMAGE_SIDE", "2600"))
    max_pixels = int(os.getenv("MAX_OCR_IMAGE_PIXELS", "9000000"))
    h, w = image.shape[:2]
    if h <= 0 or w <= 0:
        return image, False
    current_pixels = h * w
    scale_side = min(1.0, float(max_side) / float(max(h, w)))
    scale_pixels = min(1.0, (float(max_pixels) / float(current_pixels)) ** 0.5)
    scale = min(scale_side, scale_pixels)
    if scale >= 0.999:
        return image, False
    resized = cv2.resize(image, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
    return resized, True


def _downscale_for_layout_ocr(image: np.ndarray) -> Tuple[np.ndarray, bool]:
    max_side = _env_int("LAYOUT_OCR_MAX_IMAGE_SIDE", 1100, minimum=700)
    max_pixels = _env_int("LAYOUT_OCR_MAX_IMAGE_PIXELS", 1200000, minimum=400000)
    h, w = image.shape[:2]
    if h <= 0 or w <= 0:
        return image, False
    scale_side = min(1.0, float(max_side) / float(max(h, w)))
    scale_pixels = min(1.0, (float(max_pixels) / float(max(1, h * w))) ** 0.5)
    scale = min(scale_side, scale_pixels)
    if scale >= 0.999:
        return image, False
    resized = cv2.resize(image, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
    return resized, True


def _truncate_ocr_text_prioritized(text: str, limit: int) -> Tuple[str, bool]:
    if len(text or "") <= limit:
        return text, False
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    priority_keys = ("total", "subtotal", "deduction", "vat", "net", "trade", "amount", "project")
    priority = [ln for ln in lines if any(k in ln.lower() for k in priority_keys)]
    non_priority = [ln for ln in lines if ln not in priority]
    out: List[str] = []
    size = 0
    for block in (priority, non_priority):
        for ln in block:
            add = len(ln) + 1
            if size + add > limit:
                return "\n".join(out), True
            out.append(ln)
            size += add
    return "\n".join(out), True


def _build_cell_boxes_from_mask(mask: np.ndarray) -> List[Tuple[int, int, int, int]]:
    contours, _ = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    boxes: List[Tuple[int, int, int, int]] = []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        if w < 15 or h < 10:
            continue
        boxes.append((x, y, w, h))

    boxes.sort(key=lambda item: (item[1], item[0]))
    return boxes


def _build_cell_boxes_from_bounds(row_bounds: Sequence[int], col_bounds: Sequence[int]) -> List[Tuple[int, int, int, int]]:
    boxes: List[Tuple[int, int, int, int]] = []

    for r in range(len(row_bounds) - 1):
        y0 = int(row_bounds[r])
        y1 = int(row_bounds[r + 1])
        for c in range(len(col_bounds) - 1):
            x0 = int(col_bounds[c])
            x1 = int(col_bounds[c + 1])
            w = x1 - x0
            h = y1 - y0
            if w < 10 or h < 8:
                continue
            boxes.append((x0, y0, w, h))

    return boxes


def _batch_ocr_image(
    image: np.ndarray,
    ocr_engine: Any,
    min_confidence: float = 0.35,
) -> List[Dict[str, Any]]:
    """
    Run RapidOCR ONCE on the full image, returning cell-format dicts.

    This is the fast path: one OCR call per table image instead of one per cell.
    Returns list of {x, y, w, h, text, confidence} relative to `image`.
    """
    if ocr_engine is None or image is None or image.size == 0:
        return []

    prof = current()
    try:
        with (prof or new_request_collector()).time_stage("batch_ocr.call"):
            result, _ = ocr_engine(image)
    except Exception as exc:
        logger.warning("Batch OCR failed: %s", exc)
        return []

    if not result:
        return []

    effective_min_conf = max(0.0, float(min_confidence or 0.0))

    cells: List[Dict[str, Any]] = []
    with (prof or new_request_collector()).time_stage("batch_ocr.parse_tokens"):
        for item in result:
            box_pts, text, score = item[0], item[1], float(item[2] or 0.0)
            if not text or score < effective_min_conf:
                continue
            xs = [int(p[0]) for p in box_pts]
            ys = [int(p[1]) for p in box_pts]
            x0, y0 = min(xs), min(ys)
            x1, y1 = max(xs), max(ys)
            cells.append({
                "x": x0, "y": y0,
                "w": max(1, x1 - x0),
                "h": max(1, y1 - y0),
                "text": str(text).strip(),
                "confidence": score,
            })
    return cells


_LAYOUT_HEADER_ALIASES: Dict[str, Tuple[str, ...]] = {
    "trade": ("trade", "designation", "profession", "category", "labour", "labor"),
    "project": ("project", "project no", "projectno", "project id", "project code"),
    "employee": ("employee", "employee name", "worker", "worker name", "name", "id no", "id"),
    "hours": ("hour", "hours", "hrs", "no of hours", "total hours", "qty", "quantity"),
    "rate": ("rate", "unit price", "unitprice", "price", "hourly rate"),
    "amount": ("amount", "total amount", "net amount", "amount aed", "value", "total"),
}


def _layout_header_semantic(text: str) -> Optional[str]:
    normalized = re.sub(r"[^a-z0-9\s]", " ", str(text or "").lower())
    normalized = " ".join(normalized.split())
    if not normalized:
        return None
    for semantic, aliases in _LAYOUT_HEADER_ALIASES.items():
        for alias in aliases:
            if re.search(rf"\b{re.escape(alias)}\b", normalized):
                return semantic
    return None


def _cluster_ocr_tokens_into_lines(tokens: Sequence[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    usable = [
        t for t in tokens
        if _clean(t.get("text")) and float(t.get("confidence", 0.0) or 0.0) >= 0.25
    ]
    if not usable:
        return []

    heights = [float(t.get("h", 0) or 0) for t in usable if float(t.get("h", 0) or 0) > 0]
    median_h = float(np.median(heights)) if heights else 14.0
    y_threshold = max(8.0, min(28.0, median_h * 0.85))

    lines: List[List[Dict[str, Any]]] = []
    for token in sorted(usable, key=lambda item: (float(item.get("y", 0)), float(item.get("x", 0)))):
        cy = float(token.get("y", 0)) + float(token.get("h", 0)) / 2.0
        matched = False
        for line in lines:
            line_cy = float(np.mean([float(t.get("y", 0)) + float(t.get("h", 0)) / 2.0 for t in line]))
            if abs(cy - line_cy) <= y_threshold:
                line.append(token)
                matched = True
                break
        if not matched:
            lines.append([token])

    for line in lines:
        line.sort(key=lambda item: float(item.get("x", 0)))
    return lines


def _line_text(line: Sequence[Dict[str, Any]]) -> str:
    return " ".join(_clean(t.get("text")) for t in line if _clean(t.get("text")))


_LAYOUT_TRADE_RE = re.compile(
    r"\b(tile\s*mason|steel\s*fixer|steelfixer|steefixer|steelfixr|"
    r"mason|carpenter|helper|plumber|electrician|painter|welder|"
    r"foreman|driver|operator|labou?r|technician)\b",
    re.I,
)


def _canonical_layout_trade(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z\s]", " ", str(value or ""))
    cleaned = " ".join(cleaned.split()).upper()
    fixes = {
        "STEEFIXER": "STEELFIXER",
        "STEEL FIXER": "STEELFIXER",
        "STEELFIXR": "STEELFIXER",
        "STEEFIXR": "STEELFIXER",
    }
    return fixes.get(cleaned, cleaned)


def _reconstruct_summary_table_from_layout_lines(lines: Sequence[Sequence[Dict[str, Any]]]) -> List[List[str]]:
    rows: List[List[str]] = [["TRADE", "No. of hours", "UnitPrice", "Amount"]]
    in_summary_block = False
    for line in lines:
        text = _line_text(line)
        if not text:
            continue
        upper = text.upper()
        if re.search(r"\bTOTAL\b", upper):
            in_summary_block = True
            continue
        if not in_summary_block:
            continue
        if any(stop in upper for stop in ("TOTAL DEDUCTION", "NET PAYABLE", "GROSS TOTAL", "TRN")):
            continue

        match = _LAYOUT_TRADE_RE.search(text)
        if not match:
            continue
        trade = _canonical_layout_trade(match.group(0))
        nums = re.findall(r"\d{1,3}(?:,\d{3})*(?:\.\d+)?", text)
        values = [_to_float(n) for n in nums]
        values = [v for v in values if v > 0]
        if len(values) < 3:
            continue

        picked: Optional[Tuple[float, float, float]] = None
        min_rate = _env_float("LAYOUT_SUMMARY_MIN_RATE", 2.0, minimum=0.0)
        max_rate = _env_float("LAYOUT_SUMMARY_MAX_RATE", 30.0, minimum=min_rate)
        min_amount = _env_float("LAYOUT_SUMMARY_MIN_AMOUNT", 25.0, minimum=0.0)
        for idx in range(0, len(values) - 2):
            hours, rate, amount = values[idx], values[idx + 1], values[idx + 2]
            if hours <= 0 or rate < min_rate or rate > max_rate or amount < min_amount:
                continue
            if hours > 744 or rate > 10000 or amount > 1000000:
                continue
            expected = round(hours * rate, 2)
            if expected <= 0:
                continue
            if abs(expected - amount) <= max(2.0, expected * 0.08):
                picked = (hours, rate, amount)
                break
        if picked is None:
            continue
        hours, rate, amount = picked

        rows.append([trade, str(hours), str(rate), str(amount)])

    # Require at least two rows to avoid one-off random OCR lines becoming a table.
    return rows if len(rows) >= 3 else []


def _reconstruct_layout_table_from_tokens(
    tokens: Sequence[Dict[str, Any]],
    page_idx: int,
) -> Tuple[List[List[str]], str, float, Dict[str, Any]]:
    lines = _cluster_ocr_tokens_into_lines(tokens)
    if not lines:
        return [], "", 0.0, {"page": page_idx, "reason": "no_layout_ocr_lines"}

    raw_text = "\n".join(_line_text(line) for line in lines)
    confidences = [float(t.get("confidence", 0.0) or 0.0) for t in tokens if _clean(t.get("text"))]
    avg_conf = float(np.mean(confidences)) if confidences else 0.0

    summary_table = _reconstruct_summary_table_from_layout_lines(lines)
    if summary_table:
        return summary_table, raw_text, avg_conf, {
            "page": page_idx,
            "reason": "layout_ocr_summary_table_reconstructed",
            "columns": ["trade", "hours", "rate", "amount"],
            "rows": len(summary_table) - 1,
        }

    header_idx = -1
    header_semantics: Dict[int, str] = {}
    for idx, line in enumerate(lines[:40]):
        semantics: Dict[int, str] = {}
        for token in line:
            semantic = _layout_header_semantic(str(token.get("text") or ""))
            if semantic and semantic not in semantics.values():
                semantics[len(semantics)] = semantic
        semantic_values = set(semantics.values())
        if "trade" in semantic_values and (
            "amount" in semantic_values
            or ("hours" in semantic_values and "rate" in semantic_values)
        ):
            header_idx = idx
            break

    if header_idx < 0:
        return [], raw_text, 0.0, {
            "page": page_idx,
            "reason": "no_semantic_header",
            "line_count": len(lines),
        }

    header_line = lines[header_idx]
    columns: List[Tuple[float, str, str]] = []
    used_semantics = set()
    for token in header_line:
        text = _clean(token.get("text"))
        semantic = _layout_header_semantic(text)
        if not semantic or semantic in used_semantics:
            continue
        cx = float(token.get("x", 0)) + float(token.get("w", 0)) / 2.0
        columns.append((cx, semantic, text))
        used_semantics.add(semantic)

    if len(columns) < 3:
        return [], raw_text, 0.0, {
            "page": page_idx,
            "reason": "insufficient_semantic_columns",
            "column_count": len(columns),
        }

    columns.sort(key=lambda item: item[0])
    centers = [c[0] for c in columns]
    boundaries: List[float] = [-1.0]
    for left, right in zip(centers, centers[1:]):
        boundaries.append((left + right) / 2.0)
    boundaries.append(float("inf"))

    header_by_semantic = {
        "trade": "TRADE",
        "project": "ProjectNo.",
        "employee": "Employee",
        "hours": "No. of hours",
        "rate": "UnitPrice",
        "amount": "Amount",
    }
    table: List[List[str]] = [[header_by_semantic.get(semantic, label) for _, semantic, label in columns]]
    raw_lines: List[str] = [_line_text(line) for line in lines]

    for line in lines[header_idx + 1 : header_idx + 90]:
        text = _line_text(line)
        low = text.lower()
        if not text:
            continue
        if any(marker in low for marker in ("total deduction", "net payable", "grand total", "signature", "regards")):
            break

        cells = ["" for _ in columns]
        for token in line:
            token_text = _clean(token.get("text"))
            if not token_text:
                continue
            cx = float(token.get("x", 0)) + float(token.get("w", 0)) / 2.0
            col_idx = 0
            for idx in range(len(columns)):
                if boundaries[idx] <= cx < boundaries[idx + 1]:
                    col_idx = idx
                    break
            cells[col_idx] = f"{cells[col_idx]} {token_text}".strip()

        joined = " ".join(cells)
        has_alpha = bool(re.search(r"[A-Za-z]{2,}", joined))
        has_digit = bool(re.search(r"\d", joined))
        if has_alpha and has_digit:
            table.append(cells)

    if len(table) < 2:
        return [], "\n".join(raw_lines), 0.0, {
            "page": page_idx,
            "reason": "no_data_rows_after_header",
            "column_count": len(columns),
        }

    return table, "\n".join(raw_lines), avg_conf, {
        "page": page_idx,
        "reason": "layout_ocr_table_reconstructed",
        "columns": [semantic for _, semantic, _ in columns],
        "rows": len(table) - 1,
    }


def _semantic_rows_from_tokens(tokens: Sequence[Dict[str, Any]], return_debug: bool = False) -> List[InvoiceRow] | Tuple[List[InvoiceRow], Dict[str, Any]]:
    """Reconstruct semantic rows from OCR tokens without assuming column positions."""
    rows: List[InvoiceRow] = []
    if not tokens:
        semantic_input_metrics = {
            "tokens_received": 0,
            "clusters_created": 0,
            "logical_rows_created": 0,
        }
        record_extraction_metric(
            "SEMANTIC_INPUT_METRICS",
            semantic_input_metrics,
            logger=logger,
            stage="semantic_row_reconstruction",
        )
        record_extraction_metric(
            "SEMANTIC_OUTPUT_METRICS",
            {
                "rows_accepted": 0,
                "rows_rejected": 0,
                "top_rejection_reasons": {},
            },
            logger=logger,
            stage="semantic_row_reconstruction",
        )
        return rows

    lines = _cluster_ocr_tokens_into_lines(tokens)
    log_event(logger, "ROW_CLUSTER_CREATED", count=len(lines))
    semantic_input_metrics = {
        "tokens_received": len(tokens),
        "clusters_created": len(lines),
        "logical_rows_created": len(lines),
    }
    record_extraction_metric(
        "SEMANTIC_INPUT_METRICS",
        semantic_input_metrics,
        logger=logger,
        stage="semantic_row_reconstruction",
    )
    clusters_debug: List[Dict[str, Any]] = []
    rejected: List[Dict[str, Any]] = []

    EMP_ID_RE = re.compile(r"\b(?:OSAA|EMP|E|LAB)\d{1,6}\b", re.I)
    AMOUNT_RE = re.compile(r"\d{1,3}(?:,\d{3})*(?:\.\d+)?")

    for idx, line in enumerate(lines):
        text = _line_text(line)
        if not text:
            clusters_debug.append({"cluster_index": idx, "token_count": len(line), "texts": []})
            continue
        tokens_sorted = sorted(line, key=lambda t: float(t.get("x", 0)))
        cluster_texts = [t.get("text") for t in tokens_sorted]
        clusters_debug.append({"cluster_index": idx, "token_count": len(line), "texts": cluster_texts})
        log_event(logger, "ROW_CLUSTER_CREATED", cluster_index=idx, token_count=len(line), texts=cluster_texts)
        # detect fields
        emp_id = None
        for t in tokens_sorted:
            m = EMP_ID_RE.search(t.get("text") or "")
            if m:
                emp_id = m.group(0).strip()
                log_event(logger, "FIELD_DETECTED", field="employee_id", value=emp_id, snippet=text)
                break

        trade = None
        mtrade = _LAYOUT_TRADE_RE.search(text)
        if mtrade:
            trade = _canonical_layout_trade(mtrade.group(0))
            log_event(logger, "SEMANTIC_MATCH", field="trade", value=trade, snippet=text)

        # collect numeric tokens
        numbers: List[Tuple[float, Dict[str, Any]]] = []
        attendance_markers: List[str] = []
        for t in tokens_sorted:
            tt = (t.get("text") or "").strip()
            u = tt.upper()
            if u in {"H", "A", "W", "M", "OFF", "PH", "SL", "AL"}:
                attendance_markers.append(u)
                log_event(logger, "FIELD_DETECTED", field="attendance_marker", value=u, snippet=text)
                continue
            # numeric tokens
            num_match = AMOUNT_RE.search(tt.replace(",", ""))
            if num_match:
                try:
                    val = _to_float(num_match.group(0))
                except Exception:
                    continue
                numbers.append((val, t))

        # decide amount/rate/hours heuristically
        amount = 0.0
        rate = 0.0
        hours = 0.0

        nums = [n for n, _ in numbers]
        nums_sorted = sorted(nums)
        if nums_sorted:
            # amount candidate is the largest numeric
            amount = float(nums_sorted[-1])
            # rate candidate is next largest if available
            if len(nums_sorted) >= 2:
                rate = float(nums_sorted[-2])
            # hours candidate: prefer small numeric <= 744
            for v in nums_sorted:
                if 0 < v <= 744 and (hours == 0.0 or v < hours):
                    hours = float(v)

        # attendance-based hours override
        if attendance_markers and hours == 0.0:
            # treat each attendance marker as a worked day with default 8 hours
            hours = float(len([m for m in attendance_markers if m not in {"OFF"}]) * 8)

        # if hours not found but rate>0 and amount>0 compute hours
        if hours == 0.0 and rate > 0 and amount > 0:
            hours = round(amount / rate, 2)

        # employee name: longest alphabetic token group after removing trade and ids
        name_parts: List[str] = []
        for t in tokens_sorted:
            txt = _clean(t.get("text"))
            if not txt:
                continue
            if EMP_ID_RE.search(txt):
                continue
            if _LAYOUT_TRADE_RE.search(txt):
                continue
            if re.search(r"\d", txt):
                continue
            name_parts.append(txt)
        employee_name = " ".join(name_parts).strip() if name_parts else None
        if employee_name:
            log_event(logger, "FIELD_DETECTED", field="employee_name", value=employee_name, snippet=text)

        # build InvoiceRow if criteria met
        rejected_reasons: List[str] = []
        if not trade:
            rejected_reasons.append("missing_trade")
        if hours <= 0:
            rejected_reasons.append("missing_hours")
        if not (employee_name or emp_id):
            rejected_reasons.append("missing_employee")
        if amount == 0.0:
            rejected_reasons.append("missing_amount")

        if (employee_name or emp_id) and trade and hours > 0:
            row = InvoiceRow(
                trade=trade,
                hours=round(hours, 2),
                rate=round(rate, 2),
                amount=round(amount, 2),
                project_id=None,
                employee_id=emp_id,
                id_no=None,
                calculated_hours=0.0,
                hours_match=False,
                attendance_days=0,
                overtime_hours=0.0,
                deductions={},
                deduction_total=0.0,
                vat_rate=0.05,
                vat_amount=0.0,
                net_amount=0.0,
                original_hours=round(hours, 2),
                original_amount=round(amount, 2),
            )
            rows.append(row)
            log_event(logger, "ROW_ACCEPTED", trade=trade, employee_id=emp_id or "", hours=row.hours, amount=row.amount)
        else:
            # include detailed rejection info
            reason = ",".join(rejected_reasons) if rejected_reasons else "semantic_insufficient"
            log_event(
                logger,
                "ROW_REJECTED",
                cluster_id=idx,
                reason=reason,
                detected_trade=trade or "",
                detected_employee=emp_id or "",
                detected_hours=hours,
                detected_amount=amount,
                snippet=text,
            )
            rejected.append({"cluster_id": idx, "snippet": text, "reasons": rejected_reasons, "tokens": cluster_texts, "detected_trade": trade or "", "detected_employee": emp_id or "", "detected_hours": hours, "detected_amount": amount})

    # emit output stats
    emp_ids = sum(1 for r in rows if r.employee_id)
    trades = sum(1 for r in rows if r.trade)
    log_event(logger, "SEMANTIC_OUTPUT_STATS", rows_created=len(rows), rows_rejected=len(rejected), employee_ids_found=emp_ids, trades_found=trades)
    rejection_counter: Counter[str] = Counter()
    for item in rejected:
        reasons = item.get("reasons") or ["semantic_insufficient"]
        for reason in reasons:
            rejection_counter[str(reason or "semantic_insufficient")] += 1
    record_extraction_metric(
        "SEMANTIC_OUTPUT_METRICS",
        {
            "rows_accepted": len(rows),
            "rows_rejected": len(rejected),
            "top_rejection_reasons": dict(rejection_counter.most_common(8)),
        },
        logger=logger,
        stage="semantic_row_reconstruction",
    )
    debug_out = {"clusters": clusters_debug, "rejected": rejected, "reasons": []}
    if return_debug:
        return rows, debug_out
    return rows


def _extract_layout_ocr_tables_from_pages(
    pages: Sequence[Any],
    debug: DebugExporter,
) -> Tuple[List[List[List[str]]], List[str], float, str, Dict[str, Any]]:
    warnings: List[str] = []
    if not _env_flag("ENABLE_LAYOUT_OCR_FALLBACK", True):
        return [], ["layout_ocr_fallback_disabled"], 0.0, "", {}

    cell_extractor = CellExtractor(config=CellExtractorConfig(min_confidence=0.30))
    ocr_engine = getattr(cell_extractor, "_ocr_engine", None)
    if ocr_engine is None:
        return [], ["layout_ocr_fallback_unavailable"], 0.0, "", {}

    tables: List[List[List[str]]] = []
    text_parts: List[str] = []
    confidences: List[float] = []
    debug_pages: List[Dict[str, Any]] = []

    max_pages = max(1, int(CONFIG.resource_limits.max_ocr_images or 1))
    max_tokens = _env_int("LAYOUT_OCR_MAX_TOKENS", 350, minimum=50)
    layout_timeout_s = max(2.0, float(_env_int("LAYOUT_OCR_TIMEOUT_MS", 12000, minimum=1000)) / 1000.0)
    preprocessed_pages = preprocess_pages_for_ocr(list(pages)[:max_pages], target_long_edge=2200)
    tokens_all: List[Dict[str, Any]] = []
    for page_idx, page_result in enumerate(preprocessed_pages, 1):
        page_img = page_result.image if isinstance(page_result.image, np.ndarray) else cv2.cvtColor(_np.array(page_result.image), cv2.COLOR_RGB2BGR)
        page_img, _ = _downscale_for_layout_ocr(page_img)
        log_event(
            logger,
            "performance_timing",
            metric="layout_page_preprocess_ms",
            page=page_idx,
            duration_ms=int(page_result.timings_ms.get("total_ms", 0) or 0),
        )
        prof = current()
        with (prof or new_request_collector()).time_stage("threadpool.create"):
            layout_exec = ThreadPoolExecutor(max_workers=1)
        with (prof or new_request_collector()).time_stage("threadpool.submit"):
            future = layout_exec.submit(_batch_ocr_image, page_img, ocr_engine, 0.30)
        try:
            with (prof or new_request_collector()).time_stage("threadpool.wait"):
                tokens = future.result(timeout=layout_timeout_s)
        except FutureTimeoutError:
            future.cancel()
            warnings.append(f"layout_ocr_timeout:page_{page_idx}")
            log_event(logger, "timeout_degradation_activated", stage="layout_ocr_fallback", page=page_idx, timeout_s=layout_timeout_s)
            layout_exec.shutdown(wait=False, cancel_futures=True)
            continue
        finally:
            layout_exec.shutdown(wait=False, cancel_futures=True)
        repair_events: List[Dict[str, Any]] = []

        def _ocr_box_repair_event(event_name: str, payload: Dict[str, Any]) -> None:
            repair_events.append({"event": event_name, **payload})
            log_event(logger, event_name, page=page_idx, **payload)

        tokens, repair_debug = repair_ocr_box_geometry(
            tokens,
            image=page_img,
            ocr_engine=ocr_engine,
            min_confidence=0.30,
            source="layout_ocr_fallback",
            page_index=page_idx,
            event_logger=_ocr_box_repair_event,
        )
        repair_metrics = repair_debug.get("metrics", {}) if isinstance(repair_debug, dict) else {}
        record_extraction_metric(
            "OCR_REPAIR_METRICS",
            {
                "total_tokens_before": int(repair_metrics.get("total_tokens", 0) or 0),
                "total_tokens_after": int(repair_metrics.get("usable_tokens", 0) or 0),
                "oversized_tokens_before": int(repair_metrics.get("oversized_tokens", 0) or 0),
                "oversized_tokens_after": int(repair_metrics.get("oversized_tokens_after", 0) or 0),
                "reprocessed_tokens": int(repair_metrics.get("reprocessed_tokens", 0) or 0),
                "split_success_rate": float(repair_metrics.get("split_success_rate", 0.0) or 0.0),
            },
            logger=logger,
            stage="ocr_box_geometry_repair",
            extra={"page": page_idx, "source": "layout_ocr_fallback"},
        )
        debug_pages.append({
            "page": page_idx,
            "reason": "ocr_box_geometry_repair",
            "metrics": repair_debug.get("metrics", {}),
            "events": repair_events,
        })
        if len(tokens) > max_tokens:
            tokens = sorted(tokens, key=lambda item: float(item.get("confidence", 0.0) or 0.0), reverse=True)[:max_tokens]
            tokens.sort(key=lambda item: (float(item.get("y", 0)), float(item.get("x", 0))))
            warnings.append(f"layout_ocr_tokens_limited:{max_tokens}")
        # accumulate tokens for downstream semantic row reconstruction
        tokens_all.extend(tokens)
        table, raw_text, avg_conf, page_debug = _reconstruct_layout_table_from_tokens(tokens, page_idx)
        debug_pages.append(page_debug)
        if raw_text:
            text_parts.append(raw_text)
        if table:
            tables.append(table)
            warnings.append(f"layout_ocr_table_reconstructed:page_{page_idx}:rows_{len(table) - 1}")
            debug.json(f"page_{page_idx:02d}_layout_ocr_table", table)
        if avg_conf > 0:
            confidences.append(avg_conf)

    return tables, warnings, float(np.mean(confidences)) if confidences else 0.0, "\n".join(text_parts), {"layout_ocr_pages": debug_pages}, tokens_all


def _extract_table_engine(
    pdf_path: str,
    fmt: TimesheetFormat,
    debug: DebugExporter,
    config_overrides: Optional[Dict[str, Any]] = None,
    request_cache: Optional[Dict[str, Any]] = None,
) -> Tuple[List[List[List[str]]], List[str], float, str, Dict[str, Any]]:
    set_extraction_metrics_context(pdf_path=pdf_path)
    # Ensure we always have a debug object (may be NoOpDebug)
    debug = ensure_debug(debug)

    if not _OCR_OK:
        return [], ["RapidOCR/pdf2image not available; OCR pipeline skipped"], 0.0, "", {}

    config = load_extraction_config()
    config = apply_runtime_overrides(config, config_overrides)

    warnings: List[str] = []
    started = time.time()
    budget_s = _table_ocr_budget_s()

    # Keep OCR bounded; high DPI makes fractured table grids painfully slow.
    OCR_DPI = _env_int("OCR_RASTER_DPI", 200, minimum=120)
    max_ocr_pages = max(1, int(CONFIG.resource_limits.max_ocr_images or 1))
    cached_pages = list((request_cache or {}).get("preprocessed_pages") or []) if request_cache else []
    if cached_pages:
        pages = cached_pages
        log_event(logger, "ocr_cache_hit", pdf_path=pdf_path, artifact="preprocessed_pages", count=len(pages))
        try:
            prof = current()
            if prof:
                prof.incr("cache_hits", 1)
                prof.incr("pages_processed", len(pages or []))
        except Exception:
            pass
    else:
        prof = current()
        with (prof or new_request_collector()).time_stage("rasterization"):
            raster_start = time.time()
            pages = _convert_from_path(pdf_path, dpi=OCR_DPI, first_page=1, last_page=max_ocr_pages)
        log_event(
            logger,
            "performance_timing",
            metric="pdf_rasterize_ms",
            duration_ms=int((time.time() - raster_start) * 1000),
            pages=len(pages or []),
        )
        if request_cache is not None and pages:
            request_cache["rasterized_pages"] = list(pages)
        if pages:
            with (prof or new_request_collector()).time_stage("preprocessing"):
                preprocess_start = time.time()
                preprocessed_pages = preprocess_pages_for_ocr(
                    pages,
                    target_long_edge=_env_int("OCR_TARGET_LONG_EDGE", 2200, minimum=1200),
                    margin_pad_px=_env_int("OCR_MARGIN_PAD_PX", 14, minimum=0),
                    max_orientation_dim=_env_int("OCR_ORIENTATION_MAX_DIM", 1400, minimum=600),
                    max_deskew_angle_deg=float(config.skew.max_angle_deg),
                )
            log_event(
                logger,
                "performance_timing",
                metric="page_preprocess_total_ms",
                duration_ms=int((time.time() - preprocess_start) * 1000),
                pages=len(preprocessed_pages),
            )
            try:
                if prof:
                    prof.incr("pages_processed", len(preprocessed_pages or []))
                    # record per-page meta
                    metas = []
                    for item in preprocessed_pages:
                        metas.append({
                            "orientation_deg": item.orientation_deg,
                            "deskew_deg": item.deskew_deg,
                            "content_bbox": item.content_bbox,
                        })
                    prof.set_meta("preprocessed_pages_meta", metas)
            except Exception:
                pass
            pages = [item.image for item in preprocessed_pages]
            if request_cache is not None:
                request_cache["preprocessed_pages"] = list(pages)
                request_cache["preprocessed_page_meta"] = [
                    {
                        "orientation_deg": item.orientation_deg,
                        "deskew_deg": item.deskew_deg,
                        "content_bbox": item.content_bbox,
                        "timings_ms": dict(item.timings_ms),
                        "skipped_steps": list(item.skipped_steps),
                        "warnings": list(item.warnings),
                    }
                    for item in preprocessed_pages
                ]
    if len(pages) > max_ocr_pages:
        log_event(
            logger,
            "large_pdf_detected",
            pdf_path=pdf_path,
            ocr_pages_total=len(pages),
            ocr_pages_processed=max_ocr_pages,
            max_ocr_pages=max_ocr_pages,
        )
        warnings.append(f"ocr_pages_limited:{max_ocr_pages}/{len(pages)}")
        pages = pages[:max_ocr_pages]
    normalizer = TableNormalizer(config=TableNormalizerConfig())
    cell_extractor = CellExtractor(
        config=CellExtractorConfig(
            min_confidence=config.ocr.min_confidence,
            debug_dir=None,
            max_cell_area_px=_env_int("MAX_OCR_CELL_AREA_PX", 90000, minimum=10000),
        )
    )

    all_tables: List[List[List[str]]] = []
    confidences: List[float] = []
    ocr_text_parts: List[str] = []
    debug_tables: List[Dict[str, Any]] = []
    # forced_attendance_rows already initialized earlier
    quality_scores: List[float] = []
    downscaled_pages = 0
    layout_fallback_allowed = False
    max_tables_total = _env_int("MAX_OCR_TABLES_TOTAL", 8, minimum=1)
    max_tables_per_page = _env_int("MAX_OCR_TABLES_PER_PAGE", 4, minimum=1)
    max_cells_per_table = _env_int("MAX_OCR_CELLS_PER_TABLE", 80, minimum=4)
    # New adaptive table handling configuration
    grid_cell_threshold = _env_int("GRID_CELL_THRESHOLD", 100, minimum=4)
    max_table_cells = _env_int("MAX_TABLE_CELLS", 1000, minimum=4)
    enable_row_based_fallback = _env_flag("ENABLE_ROW_BASED_FALLBACK", True)
    # honor new global max table cells
    max_cells_per_table = max_table_cells
    min_table_width = _env_int("MIN_OCR_TABLE_WIDTH_PX", 180, minimum=1)
    min_table_height = _env_int("MIN_OCR_TABLE_HEIGHT_PX", 60, minimum=1)
    min_table_width_ratio = _env_float("MIN_OCR_TABLE_PAGE_WIDTH_RATIO", 0.28, minimum=0.0)
    min_table_height_ratio = _env_float("MIN_OCR_TABLE_PAGE_HEIGHT_RATIO", 0.035, minimum=0.0)
    tables_attempted = 0

    for page_idx, page in enumerate(pages, 1):
        if _budget_expired(started, budget_s):
            warnings.append("ocr_budget_exhausted:page_loop")
            log_event(logger, "timeout_degradation_activated", stage="ocr_table_engine", pdf_path=pdf_path, reason="page_budget")
            break
        if isinstance(page, np.ndarray):
            page_img = page.copy()
        else:
            page_img = cv2.cvtColor(_np.array(page), cv2.COLOR_RGB2BGR)
        page_img, was_downscaled = _downscale_for_ocr(page_img)
        if was_downscaled:
            downscaled_pages += 1

        quality = score_scan_quality(page_img)
        quality_scores.append(quality.score)
        warnings.extend([f"scan_quality:{issue}" for issue in quality.issues])

        if "clahe_clip_limit" in quality.tuning:
            config.preprocessing.clahe_clip_limit = float(quality.tuning["clahe_clip_limit"])
        if "denoise_h" in quality.tuning:
            config.preprocessing.denoise_h = int(quality.tuning["denoise_h"])
        if "deskew_max_angle_deg" in quality.tuning:
            config.skew.max_angle_deg = float(quality.tuning["deskew_max_angle_deg"])
        if "morph_open_iterations" in quality.tuning:
            config.morphology.open_iterations = int(quality.tuning["morph_open_iterations"])

        profile = detect_template_profile("", fmt)
        config = apply_template_overrides(config, profile.name)

        detector = TableDetector(
            config=TableDetectorConfig(
                min_table_area_ratio=0.002,
                line_scale_divisor=max(10, config.morphology.horizontal_kernel_width),
                morphology_iterations=config.morphology.open_iterations,
                deskew_max_angle_deg=config.skew.max_angle_deg,
                adaptive_block_size=config.preprocessing.adaptive_block_size,
                adaptive_c=config.preprocessing.adaptive_c,
                debug_dir=None,
            )
        )

        detected = detector.detect_tables(page_img)
        if detected.contours:
            layout_fallback_allowed = True

        debug.image(f"page_{page_idx:02d}_table_mask", detected.table_mask)

        page_h, page_w = page_img.shape[:2]
        page_contours = [
            c for c in detected.contours
            if c.w >= min_table_width
            and c.h >= min_table_height
            and (float(c.w) / float(max(1, page_w))) >= min_table_width_ratio
            and (float(c.h) / float(max(1, page_h))) >= min_table_height_ratio
        ]
        if len(page_contours) < len(detected.contours):
            warnings.append(f"small_table_fragments_skipped:{len(detected.contours) - len(page_contours)}")

        for table_idx, contour in enumerate(page_contours[:max_tables_per_page], 1):
            if tables_attempted >= max_tables_total:
                warnings.append(f"ocr_table_limit_reached:{max_tables_total}")
                break
            if _budget_expired(started, budget_s):
                warnings.append("ocr_budget_exhausted:table_loop")
                log_event(logger, "timeout_degradation_activated", stage="ocr_table_engine", pdf_path=pdf_path, reason="table_budget")
                break
            tables_attempted += 1
            x, y, w, h = contour.x, contour.y, contour.w, contour.h
            log_event(
                logger,
                "TABLE_DETECTED",
                page=page_idx,
                table=table_idx,
                bbox={"x": x, "y": y, "w": w, "h": h},
                area=int(w * h),
            )
            # Add padding around contour so first/top-border rows are not clipped.
            pad = 8
            y0 = max(0, y - pad)
            x0 = max(0, x - pad)
            y1 = min(page_img.shape[0], y + h + pad)
            x1 = min(page_img.shape[1], x + w + pad)

            crop = page_img[y0:y1, x0:x1]

            h_mask = detected.horizontal_mask[y0:y1, x0:x1]
            v_mask = detected.vertical_mask[y0:y1, x0:x1]

            boundary_recon = GridReconstructor(config=GridReconstructorConfig()).reconstruct(
                table_image=crop,
                ocr_cells=[],
                horizontal_mask=h_mask,
                vertical_mask=v_mask,
            )
            cell_boxes = _build_cell_boxes_from_bounds(
                boundary_recon.row_boundaries,
                boundary_recon.col_boundaries,
            )
            
            # Candidate summary helper
            def _emit_candidate_info(skip_reason: str = "none"):
                try:
                    rcount = max(len(boundary_recon.row_boundaries) - 1, 0)
                    ccount = max(len(boundary_recon.col_boundaries) - 1, 0)
                    warnings.append(
                        f"table_candidate:{page_idx}:{table_idx}:candidate_index={table_idx},row_count={rcount},column_count={ccount},cell_count={len(cell_boxes)},skip_reason={skip_reason}"
                    )
                except Exception:
                    warnings.append(f"table_candidate:{page_idx}:{table_idx}:cell_count={len(cell_boxes)},skip_reason={skip_reason}")

            # Decide strategy based on cell counts
            cell_count = len(cell_boxes)
            row_count = max(len(boundary_recon.row_boundaries) - 1, 0)
            col_count = max(len(boundary_recon.col_boundaries) - 1, 0)

            # Default strategy
            table_strategy = "grid"
            # If extremely large, reject
            if cell_count > max_table_cells:
                _emit_candidate_info(f"reject_too_many_cells(>{max_table_cells})")
                warnings.append(f"table_skipped:too_many_cells:{page_idx}:{table_idx}:{cell_count}")
                log_event(
                    logger,
                    "TABLE_REJECTED",
                    page=page_idx,
                    table=table_idx,
                    reason="too_many_cells",
                    cell_count=cell_count,
                )
                continue
            # If moderate size and above grid threshold, switch to row-based fallback
            if cell_count >= grid_cell_threshold and cell_count <= max_table_cells and enable_row_based_fallback:
                table_strategy = "row_fallback"
                log_event(logger, "TABLE_STRATEGY", page=page_idx, table=table_idx, table_strategy=table_strategy, cell_count=cell_count)
                warnings.append(f"table_strategy:row_fallback:{page_idx}:{table_idx}:{cell_count}")
                # Build row boxes by clustering y-centers of detected cell boxes
                try:
                    ys = [int(b[1] + b[3] / 2) for b in cell_boxes]
                    heights = [int(b[3]) for b in cell_boxes] or [10]
                    median_h = int(np.median(heights)) if heights else 10
                    paired = sorted(zip(ys, cell_boxes), key=lambda x: x[0])
                    row_groups = []
                    cur_group = []
                    last_y = None
                    for y_center, box in paired:
                        if last_y is None:
                            cur_group = [box]
                            last_y = y_center
                            continue
                        if abs(y_center - last_y) <= max(8, median_h // 2):
                            cur_group.append(box)
                        else:
                            row_groups.append(cur_group)
                            cur_group = [box]
                        last_y = y_center
                    if cur_group:
                        row_groups.append(cur_group)
                    # Create row-wise bounding boxes
                    row_boxes = []
                    for grp in row_groups:
                        xs = [b[0] for b in grp]
                        ys_ = [b[1] for b in grp]
                        ws = [b[2] for b in grp]
                        hs = [b[3] for b in grp]
                        x_min = min(xs)
                        y_min = min(ys_)
                        x_max = max([x + w for x,_,w,_ in grp])
                        y_max = max([y + h for _,y,_,h in grp])
                        row_boxes.append((x_min, y_min, x_max - x_min, y_max - y_min))
                    # Replace cell_boxes with row_boxes for extraction
                    if row_boxes:
                        cell_boxes = row_boxes
                        cell_count = len(cell_boxes)
                    # Perform a token-based row reconstruction using OCR provider to avoid per-cell OCR
                    try:
                        prov = get_ocr_provider()
                        if prov and prov.available():
                            tokens = prov.image_tokens(crop) or []
                            # tokens are list of (y, x, text)
                            tokens_sorted = sorted(tokens, key=lambda t: (t[0], t[1]))
                            # cluster by y coordinate
                            rows_tokens = []
                            cur_row = []
                            last_y = None
                            for y, x, txt in tokens_sorted:
                                if last_y is None:
                                    cur_row = [(x, txt)]
                                    last_y = y
                                    continue
                                if abs(y - last_y) <= max(8, median_h // 2):
                                    cur_row.append((x, txt))
                                else:
                                    rows_tokens.append(cur_row)
                                    cur_row = [(x, txt)]
                                last_y = y
                            if cur_row:
                                rows_tokens.append(cur_row)


                            # build normalized table rows: split tokens into multiple pseudo-columns
                            normalized_rows = []
                            for grp in rows_tokens:
                                grp_sorted = sorted(grp, key=lambda it: it[0])
                                words = [t for _, t in grp_sorted]
                                # heuristically split into up to 6 columns to help classifiers/parsers
                                max_cols = 6
                                if not words:
                                    continue
                                # simple chunking
                                chunk_size = max(1, len(words) // max_cols)
                                cells = [" ".join(words[i:i+chunk_size]) for i in range(0, len(words), chunk_size)]
                                # ensure at most max_cols
                                if len(cells) > max_cols:
                                    cells = cells[:max_cols]
                                normalized_rows.append(cells)

                            if normalized_rows:
                                all_tables.append(normalized_rows)
                                # append text parts
                                for r in normalized_rows:
                                    ocr_text_parts.append(" ".join(r))
                                # try to directly parse attendance rows from normalized rows to avoid classifier failure
                                try:
                                    parsed = _parse_attendance_rows(normalized_rows, layout, table_index=table_idx)
                                    if parsed:
                                        forced_attendance_rows.extend(parsed)
                                except Exception:
                                    pass
                                # skip downstream cell OCR for this table
                                debug_tables.append({"page": page_idx, "table": table_idx, "strategy": "row_fallback_tokens", "cell_count": cell_count})
                                continue
                    except Exception:
                        # fall back to original behavior if token-based fails
                        pass
                except Exception:
                    # If clustering fails, emit candidate and continue with grid
                    _emit_candidate_info("row_fallback_cluster_fail")
                    table_strategy = "grid"
            else:
                log_event(logger, "TABLE_STRATEGY", page=page_idx, table=table_idx, table_strategy=table_strategy, cell_count=cell_count)
                warnings.append(f"table_strategy:{table_strategy}:{page_idx}:{table_idx}:{cell_count}")
            if len(cell_boxes) > max_cells_per_table:
                warnings.append(f"table_skipped:too_many_cells:{page_idx}:{table_idx}:{len(cell_boxes)}")
                log_event(
                    logger,
                    "TABLE_REJECTED",
                    page=page_idx,
                    table=table_idx,
                    reason="too_many_cells",
                    cell_count=len(cell_boxes),
                )
                continue
            if cell_boxes:
                heights = [box[3] for box in cell_boxes]
                widths = [box[2] for box in cell_boxes]
                median_h = float(np.median(heights)) if heights else 0.0
                median_w = float(np.median(widths)) if widths else 0.0
                if median_h > _env_int("MAX_MEDIAN_CELL_HEIGHT_PX", 220, minimum=40) or median_w < _env_int("MIN_MEDIAN_CELL_WIDTH_PX", 18, minimum=1):
                    warnings.append(f"table_skipped:fragmented_grid:{page_idx}:{table_idx}")
                    log_event(
                        logger,
                        "TABLE_REJECTED",
                        page=page_idx,
                        table=table_idx,
                        reason="fragmented_grid",
                        median_cell_height=median_h,
                        median_cell_width=median_w,
                    )
                    continue
            if not cell_boxes:
                warnings.append(f"page_{page_idx}_table_{table_idx}:no_cell_grid")
                log_event(
                    logger,
                    "TABLE_REJECTED",
                    page=page_idx,
                    table=table_idx,
                    reason="no_cell_grid",
                )
                continue

            if not _env_flag("ENABLE_CELL_OCR_TABLES", False):
                warnings.append(f"table_skipped:cell_ocr_disabled:{page_idx}:{table_idx}")
                log_event(
                    logger,
                    "TABLE_REJECTED",
                    page=page_idx,
                    table=table_idx,
                    reason="cell_ocr_disabled",
                )
                continue

            cell_timeout_s = max(2.0, float(_env_int("CELL_OCR_TABLE_TIMEOUT_MS", 12000, minimum=1000)) / 1000.0)
            prof = current()
            with (prof or new_request_collector()).time_stage("threadpool.create"):
                cell_exec = ThreadPoolExecutor(max_workers=1)
            with (prof or new_request_collector()).time_stage("threadpool.submit"):
                cell_future = cell_exec.submit(cell_extractor.extract_cells, crop, cell_boxes[:max_cells_per_table])
            try:
                with (prof or new_request_collector()).time_stage("threadpool.wait"):
                    rel_cells = cell_future.result(timeout=cell_timeout_s)
            except FutureTimeoutError:
                cell_future.cancel()
                warnings.append(f"table_skipped:cell_ocr_timeout:{page_idx}:{table_idx}")
                log_event(
                    logger,
                    "TABLE_REJECTED",
                    page=page_idx,
                    table=table_idx,
                    reason="cell_ocr_timeout",
                    timeout_s=cell_timeout_s,
                )
                cell_exec.shutdown(wait=False, cancel_futures=True)
                continue
            finally:
                cell_exec.shutdown(wait=False, cancel_futures=True)

            if not any(c.get("text") for c in rel_cells):
                warnings.append(f"page_{page_idx}_table_{table_idx}:no_cell_ocr_text")
                log_event(
                    logger,
                    "TABLE_REJECTED",
                    page=page_idx,
                    table=table_idx,
                    reason="no_cell_ocr_text",
                    cell_count=len(rel_cells),
                )
                continue

            recon = GridReconstructor(config=GridReconstructorConfig()).reconstruct(
                table_image=crop,
                ocr_cells=rel_cells,
                horizontal_mask=h_mask,
                vertical_mask=v_mask,
            )

            normalized = normalizer.normalize(recon.table)
            if normalized:
                all_tables.append(normalized)

            for row in normalized:
                ocr_text_parts.append(" ".join(str(c) for c in row if c))

            rel_conf = [float(c.get("confidence", 0.0) or 0.0) for c in rel_cells if c.get("text")]
            if rel_conf:
                confidences.append(float(np.mean(rel_conf)))

            abs_cells: List[Dict[str, Any]] = []
            for cell in rel_cells:
                abs_cell = dict(cell)
                abs_cell["x"] = int(cell.get("x", 0) + x0)
                abs_cell["y"] = int(cell.get("y", 0) + y0)
                abs_cells.append(abs_cell)

            debug.image(f"page_{page_idx:02d}_table_{table_idx:02d}_detected", crop)
            debug.table_preview(
                f"page_{page_idx:02d}_table_{table_idx:02d}_grid",
                crop,
                recon.row_boundaries,
                recon.col_boundaries,
            )
            debug.ocr_overlay(f"page_{page_idx:02d}_table_{table_idx:02d}_ocr_cells", page_img, abs_cells)
            debug.json(f"page_{page_idx:02d}_table_{table_idx:02d}_normalized", normalized)

            debug_tables.append(
                {
                    "page": page_idx,
                    "table": table_idx,
                    "bbox": {"x": x, "y": y, "w": w, "h": h},
                    "row_boundaries": recon.row_boundaries,
                    "col_boundaries": recon.col_boundaries,
                    "cell_count": len(rel_cells),
                    "cells": abs_cells,
                    "avg_confidence": float(np.mean(rel_conf)) if rel_conf else 0.0,
                }
            )

    if not all_tables and layout_fallback_allowed and not _budget_expired(started, budget_s):
        layout_tables, layout_warnings, layout_conf, layout_text, layout_debug, layout_tokens = _extract_layout_ocr_tables_from_pages(pages, debug)
        if layout_tables:
            all_tables.extend(layout_tables)
            if layout_conf > 0:
                confidences.append(layout_conf)
        if layout_text:
            ocr_text_parts.append(layout_text)
        if layout_warnings:
            warnings.extend(layout_warnings)
        if layout_debug:
            debug_tables.append({"layout_ocr_fallback": layout_debug})
            if layout_tokens:
                # expose tokens for downstream semantic reconstruction
                debug_payload.setdefault("layout_ocr_tokens_count", 0)
                debug_payload["layout_ocr_tokens_count"] = debug_payload.get("layout_ocr_tokens_count", 0) + len(layout_tokens)
                # Diagnostics: SEMANTIC_INPUT_STATS and OCR_TOKEN_SAMPLE
                total_tokens = len(layout_tokens)
                pages = len(preprocessed_pages)
                ys = sorted({int(t.get("y", 0)) for t in layout_tokens})
                unique_y_bands = len(ys)
                detected_employee_ids = 0
                detected_trade_tokens = 0
                EMP_ID_RE = re.compile(r"\b(?:OSAA|EMP|E|LAB)\d{1,6}\b", re.I)
                for t in layout_tokens:
                    txt = str(t.get("text") or "")
                    if EMP_ID_RE.search(txt):
                        detected_employee_ids += 1
                    if _LAYOUT_TRADE_RE.search(txt):
                        detected_trade_tokens += 1
                log_event(logger, "SEMANTIC_INPUT_STATS", total_tokens=total_tokens, pages=pages, unique_y_bands=unique_y_bands, detected_employee_ids=detected_employee_ids, detected_trade_tokens=detected_trade_tokens)
                # sample first 50 tokens
                sample = []
                for t in layout_tokens[:50]:
                    sample.append({"text": t.get("text"), "x": int(t.get("x", 0)), "y": int(t.get("y", 0)), "w": int(t.get("w", 0)), "h": int(t.get("h", 0))})
                log_event(logger, "OCR_TOKEN_SAMPLE", tokens=sample)

                # If tokens fewer than expected, emit TOKEN_COLLECTION_FAILURE
                if total_tokens < 50:
                    log_event(logger, "TOKEN_COLLECTION_FAILURE", total_tokens=total_tokens)

                # if no tables found and rows empty, attempt semantic row reconstruction from tokens
                if not all_tables:
                    semantic_rows, semantic_debug = _semantic_rows_from_tokens(layout_tokens, return_debug=True)
                    if semantic_rows:
                        warnings.append("structured_rows_required:layout_ocr_semantic_fallback")
                        forced_attendance_rows.extend(semantic_rows)
                    # dump debug JSON to temp/semantic_debug.json if large token count but few rows
                    if total_tokens > 100 and len(semantic_rows) < 2:
                        try:
                            debug_dir_path = Path("temp")
                            debug_dir_path.mkdir(parents=True, exist_ok=True)
                            fname = "semantic_debug.json"
                            out = {
                                "tokens": layout_tokens,
                                "clusters": semantic_debug.get("clusters"),
                                "accepted_rows": [r.__dict__ for r in semantic_rows],
                                "rejected_rows": semantic_debug.get("rejected"),
                                "reasons": semantic_debug.get("reasons"),
                            }
                            with open(debug_dir_path / fname, "w", encoding="utf-8") as fh:
                                json.dump(out, fh, ensure_ascii=False, indent=2, default=str)
                            log_event(logger, "semantic_debug_dumped", path=str(debug_dir_path / fname), tokens=total_tokens, rows_found=len(semantic_rows))
                        except Exception:
                            logger.exception("Failed to write semantic debug file")
    elif not all_tables and not layout_fallback_allowed:
        warnings.append("layout_ocr_fallback_skipped:no_table_contours")

    if not all_tables:
        warnings.append("No structured table reconstructed from OCR pipeline")

    avg_conf = float(np.mean(confidences)) if confidences else 0.0
    debug_payload = {
        "tables": debug_tables,
        "scan_quality_avg": float(np.mean(quality_scores)) if quality_scores else 0.0,
        "config": config_to_dict(config),
        "downscaled_pages": downscaled_pages,
    }
    if downscaled_pages > 0:
        log_event(logger, "ocr_truncation_activated", pdf_path=pdf_path, downscaled_pages=downscaled_pages)
    return all_tables, warnings, avg_conf, "\n".join(ocr_text_parts), debug_payload


def _rows_from_normalized_tables(
    tables: Sequence[Sequence[Sequence[str]]],
    layout: InvoiceLayout,
    warnings: List[str],
) -> Tuple[List[InvoiceRow], InvoiceFinancials, Optional[float]]:
    from pipeline.semantic_filter import classify_row, RowType
    
    prof = current()
    with (prof or new_request_collector()).time_stage("row_extraction.rows_from_normalized_tables"):
        rows: List[InvoiceRow] = []
        fin = InvoiceFinancials()
        summary_hours: Optional[float] = None
        rejected_count = 0

        for table in tables:
            for row in table:
                cells = [_clean(c) for c in row]
                if not any(cells):
                    continue

                row_text = " | ".join(cells)
                logger.info("OCR_ROW_RAW | %s", row_text)

                def _log_rejected(reason: str) -> None:
                    logger.info("ROW_REJECTED | reason=%s | row=%s", reason, cells)

                # ===== SEMANTIC FILTER: Classify row type =====
                row_type = classify_row(cells)
                if row_type != RowType.VALID_LABOUR_ROW:
                    rejected_count += 1
                    _log_rejected(f"semantic:{row_type.name}")
                    continue
                # ===== END SEMANTIC FILTER =====

                upper = [c.upper() for c in cells]
                joined_upper = " ".join(upper)

                if "TOTAL DEDUCTION" in joined_upper:
                    fin.total_deduction = max(fin.total_deduction, _to_float(cells[-1]))
                    continue
                if "GROSS TOTAL" in joined_upper:
                    fin.gross_total = max(fin.gross_total, _to_float(cells[-1]))
                    continue
                if "NET AMOUNT" in joined_upper:
                    fin.net_payable = max(fin.net_payable, _to_float(cells[-1]))
                    continue
                if "TOTAL" in joined_upper and "HOUR" in joined_upper:
                    summary_hours = _to_float(cells[-1], summary_hours or 0.0)
                    continue

                if any(key in joined_upper.lower() for key in _DEDUCTION_KEYS):
                    amount = _to_float(cells[-1])
                    if amount > 0:
                        fin.total_deduction += amount
                        fin.deduction_breakdown[cells[0] or "deduction"] = amount
                    continue

                numbers = [_to_float(c) for c in cells if re.search(r"\d", c)]
                numbers = [n for n in numbers if n > 0]

                if len(numbers) < 2:
                    _log_rejected("insufficient_numeric_tokens")
                    continue

                # --- Trade detection: find a known trade anywhere in the row (not just first cell) ---
                joined_row = " ".join(cells)
                _TRADE_ANY_RE = re.compile(
                    r"(Tile\s*Mason|Steel\s*Fixer|Steelfixer|Carpenter|Helper|Mason|Plumber|Electrician|Painter|Welder|Labourer|Laborer|Foreman|Driver|Operator|Technician)",
                    re.I,
                )
                trade_m = _TRADE_ANY_RE.search(joined_row)
                trade = trade_m.group(0).strip() if trade_m else ""
                if trade:
                    logger.info("TRADE_DETECTED | trade=%s | row=%s", trade, cells)
                else:
                    _log_rejected("generic:empty_trade_anywhere")
                    continue

                project = ""
                for token in cells:
                    m = _PROJECT_RE.search(token)
                    if m:
                        project = m.group(0).upper()
                        break

                # --- Employee detection: find employee name or id anywhere in the row ---
                employee = ""
                # Look for id-like tokens first (e.g., S#1234, EMP1234, numeric ids)
                id_re = re.compile(r"\b[A-Z]{1,3}\d{4,8}\b|\bEMP\d{3,8}\b|\b\d{6,8}\b", re.I)
                for token in cells:
                    if id_re.search(token):
                        employee = token.strip()
                        break
                # Fallback: pick first alphabetic token cluster that isn't the trade
                if not employee:
                    for i, token in enumerate(cells):
                        if re.search(r"[A-Za-z]", token) and (trade.lower() not in token.lower()):
                            parts = [token.strip()]
                            if i + 1 < len(cells) and re.search(r"[A-Za-z]", cells[i + 1]):
                                parts.append(cells[i + 1].strip())
                                if i + 2 < len(cells) and re.search(r"[A-Za-z]", cells[i + 2]):
                                    parts.append(cells[i + 2].strip())
                            employee = " ".join(parts).strip()
                            break

                if employee:
                    logger.info("EMPLOYEE_DETECTED | emp=%s | row=%s", employee, cells)
                else:
                    _log_rejected("generic:missing_employee")
                    continue

                # Numeric selection strategy: prefer trailing rate/amount pairs.
                amount = numbers[-1]
                rate = numbers[-2] if len(numbers) >= 2 else 0.0

                attendance_hours = _calculate_attendance_hours(cells[1:])
                hours = attendance_hours if attendance_hours > 0 else (numbers[-3] if len(numbers) >= 3 else 0.0)
                overtime = 0.0

                for token in cells:
                    u = token.upper()
                    if "OT" in u or "O/T" in u or "OVERTIME" in u:
                        overtime = max(overtime, _to_float(token))

                # OCR decimal-corruption guard: if hours*rate is available but amount
                # differs by more than one order of magnitude, auto-correct.
                if hours > 0 and rate > 0:
                    _expected = round(hours * rate, 2)
                    if _expected > 0:
                        _ratio = amount / _expected
                        if _ratio < 0.1 or _ratio > 10:
                            logger.warning(
                                "Amount sanity correction (table) | trade=%s | extracted=%s | expected=%s",
                                trade, amount, _expected,
                            )
                            amount = _expected

                row_item = InvoiceRow(
                    trade=trade.upper(),
                    project_id=project or None,
                    employee_id=None if layout == InvoiceLayout.PROJECT_BASED else (employee or (cells[1] if len(cells) > 1 else None)),
                    hours=round(hours, 2),
                    rate=round(rate, 2),
                    amount=round(amount, 2),
                    original_hours=round(hours, 2),
                    original_amount=round(amount, 2),
                    calculated_hours=round(attendance_hours, 2),
                    attendance_days=sum(1 for c in cells if c.upper() in {"W", "H", "OFF"}),
                    overtime_hours=round(overtime, 2),
                )
                logger.info("ROW_ACCEPTED | trade=%s | emp=%s | row=%s", row_item.trade, row_item.employee_id, cells)
                rows.append(row_item)

        deduped: Dict[Tuple[str, float, float, float], InvoiceRow] = {}
        for r in rows:
            key = (r.trade, r.hours, r.rate, r.amount)
            deduped[key] = r

        result_rows = list(deduped.values())

        if fin.subtotal == 0.0:
            fin.subtotal = round(sum(r.amount for r in result_rows), 2)

        if fin.total_deduction > fin.subtotal and fin.subtotal > 0:
            warnings.append("Deduction total appears larger than subtotal")

        if rejected_count > 0:
            warnings.append(f"semantic_filter: Rejected {rejected_count} metadata/header rows")

        return result_rows, fin, summary_hours


def _validate_rows(rows: List[InvoiceRow], fin: InvoiceFinancials, warnings: List[str], summary_hours: Optional[float]) -> None:
    if not rows:
        return
    repairs_applied = False
    for row in rows:
        # preserve originals if not already set
        if getattr(row, "original_hours", None) is None:
            row.original_hours = float(row.hours or 0.0)
        if getattr(row, "original_amount", None) is None:
            row.original_amount = float(row.amount or 0.0)

        calc_hours = row.calculated_hours if row.calculated_hours > 0 else (round(row.amount / row.rate, 2) if row.rate else 0.0)
        row.hours_match = abs(calc_hours - row.hours) <= 1.0
        if not row.hours_match:
            warnings.append(f"Hours mismatch detected for {row.trade}: row={row.hours} calc={calc_hours}")

        # numeric sanity checks and repair
        if row.rate > 0 and row.hours > 0:
            expected_amount = round(row.hours * row.rate, 2)
            # only trigger when difference is significant (>15%)
            if expected_amount > 0 and abs(expected_amount - row.amount) > max(1.0, expected_amount * 0.15):
                log_event(logger, "NUMERIC_SANITY_CHECK", trade=row.trade, hours=row.hours, rate=row.rate, amount=row.amount, expected_amount=expected_amount)
                repaired = False
                # Try multipliers/divisors to account for dropped zeros/decimals
                amt = float(row.amount or 0.0)
                # tolerance for approximate equality (5%)
                tol = max(1.0, expected_amount * 0.05)
                if abs(amt * 10 - expected_amount) <= tol:
                    row.amount = round(amt * 10, 2)
                    repaired = True
                    log_event(logger, "AMOUNT_REPAIRED", trade=row.trade, factor=10, old_amount=amt, new_amount=row.amount)
                elif abs(amt * 100 - expected_amount) <= tol:
                    row.amount = round(amt * 100, 2)
                    repaired = True
                    log_event(logger, "AMOUNT_REPAIRED", trade=row.trade, factor=100, old_amount=amt, new_amount=row.amount)
                elif abs(amt / 10 - expected_amount) <= tol:
                    row.amount = round(amt / 10, 2)
                    repaired = True
                    log_event(logger, "AMOUNT_REPAIRED", trade=row.trade, factor=0.1, old_amount=amt, new_amount=row.amount)

                # If amount/ rate gives a better hours estimate, repair hours
                if not repaired:
                    # try adjusting hours from amount if amount appears trustworthy
                    if row.rate > 0:
                        hours_from_amount = round(row.amount / row.rate, 2) if row.rate else row.hours
                        if abs(hours_from_amount - row.hours) > max(1.0, row.hours * 0.15):
                            # store original hours and apply repair
                            old_hours = float(row.hours or 0.0)
                            row.original_hours = old_hours
                            row.hours = hours_from_amount
                            repaired = True
                            log_event(logger, "HOURS_REPAIRED", trade=row.trade, old_hours=old_hours, new_hours=row.hours)

                if repaired:
                    repairs_applied = True
                    warnings.append(f"numeric_repair_applied:{row.trade}")
                    log_event(logger, "NUMERIC_REPAIR_APPLIED", trade=row.trade, new_amount=row.amount, new_hours=row.hours)
                else:
                    warnings.append(f"low_confidence_amount:{row.trade}")

        if row.deduction_total > 0 and row.deductions:
            ded_sum = round(sum(float(v) for v in row.deductions.values()), 2)
            if abs(ded_sum - row.deduction_total) > 0.5:
                warnings.append(f"Deduction mismatch in {row.trade}")

    # attach repair flag to warnings for downstream handling
    if repairs_applied:
        warnings.append("NUMERIC_SANITY_CHECK:REPAIRS_APPLIED")
    return repairs_applied

    if summary_hours is not None:
        sum_hours = round(sum(r.hours for r in rows), 2)
        if abs(sum_hours - summary_hours) > 1.0:
            warnings.append(f"Summary hours mismatch: rows={sum_hours} summary={summary_hours}")

    if fin.total_deduction > 0:
        row_ded_sum = round(sum(r.deduction_total for r in rows), 2)
        if row_ded_sum > 0 and abs(row_ded_sum - fin.total_deduction) > 1.0:
            warnings.append(
                f"Deduction mismatch: rows={row_ded_sum} summary={fin.total_deduction}"
            )


def _hard_validate_rows(rows: Sequence[InvoiceRow], warnings: List[str]) -> List[InvoiceRow]:
    valid: List[InvoiceRow] = []
    metadata_terms = {
        "INVOICE", "TIMESHEET", "TRN", "TEL", "PHONE", "EMAIL", "ADDRESS",
        "PREPARED", "APPROVED", "CLIENT", "COMPANY", "SUBCONTRACTOR",
        "SUB-CONTRACTOR", "PAGE", "DATE",
    }
    for r in rows or []:
        trade = _clean(r.trade).upper()
        if not trade:
            log_event(logger, "ROW_REJECTED", reason="hard_validation:empty_trade", row=str(r))
            continue
        if _is_financial_trade_exact(trade):
            log_event(logger, "ROW_REJECTED", reason="hard_validation:financial_trade", row=str(r))
            continue
        if any(term in trade for term in metadata_terms):
            log_event(logger, "ROW_REJECTED", reason="hard_validation:metadata_trade", row=str(r))
            continue
        if len(trade) > 60 or re.search(r"\d", trade):
            log_event(logger, "ROW_REJECTED", reason="hard_validation:invalid_trade_text", row=str(r))
            continue
        letters = len(re.findall(r"[A-Z]", trade))
        if letters < 3 or letters / max(len(trade.replace(" ", "")), 1) < 0.65:
            log_event(logger, "ROW_REJECTED", reason="hard_validation:noise_trade", row=str(r))
            continue
        if float(r.hours or 0.0) <= 0 or float(r.hours or 0.0) > 744:
            log_event(logger, "ROW_REJECTED", reason="hard_validation:absurd_hours", row=str(r))
            continue
        if float(r.rate or 0.0) <= 0 or float(r.rate or 0.0) > 10000:
            log_event(logger, "ROW_REJECTED", reason="hard_validation:absurd_rate", row=str(r))
            continue
        # Reject rows with absurd numeric values
        if float(r.amount or 0.0) <= 0 or float(r.amount or 0.0) > 500000:
            log_event(logger, "ROW_REJECTED", reason="hard_validation:non_positive_or_absurd_amount", row=str(r))
            continue
        if float(r.hours or 0.0) < 0 or float(r.hours or 0.0) > 400:
            log_event(logger, "ROW_REJECTED", reason="hard_validation:absurd_hours", row=str(r))
            continue
        if float(r.rate or 0.0) < 0 or float(r.rate or 0.0) > 500:
            log_event(logger, "ROW_REJECTED", reason="hard_validation:absurd_rate", row=str(r))
            continue
        expected_amount = round(float(r.hours or 0.0) * float(r.rate or 0.0), 2)
        if expected_amount > 0:
            ratio = float(r.amount or 0.0) / expected_amount
            if ratio < 0.1 or ratio > 10:
                log_event(
                    logger,
                    "VALIDATION_CORRECTION",
                    trade=trade,
                    reason="hard_validation:amount_decimal_corruption",
                    old_amount=float(r.amount or 0.0),
                    expected_amount=expected_amount,
                )
                r.amount = expected_amount
                warnings.append(f"amount_corrected:{trade}")
            elif abs(float(r.amount or 0.0) - expected_amount) > max(2.0, expected_amount * 0.15):
                warnings.append(f"low_confidence_amount:{trade}")
        valid.append(r)

    warnings.append(f"hard_validation_rows:{len(valid)}")
    return valid


def _should_use_ocr_pipeline(total_chars: int, has_text_rows: bool, full_text: str, fmt: TimesheetFormat) -> bool:
    attendance_hits = len(_ATTENDANCE_TOKEN_RE.findall(full_text or ""))
    low_text = total_chars < 700
    attendance_heavy = attendance_hits >= 20

    if low_text:
        return True
    if attendance_heavy and not has_text_rows:
        return True
    if fmt in {TimesheetFormat.BKC, TimesheetFormat.GENERIC} and not has_text_rows and total_chars < 1200:
        return True

    return False


def _should_skip_ocr_post_pdfplumber(full_text: str, rows: Sequence[InvoiceRow], scanned_ratio: float) -> bool:
    if not full_text or not rows:
        return False
    printable = sum(1 for c in full_text if c.isprintable())
    printable_ratio = printable / max(1, len(full_text))
    return printable_ratio >= 0.90 and float(scanned_ratio) <= 0.25


def extract_text_pdf(
    pdf_path: str,
    fmt: TimesheetFormat,
    layout: InvoiceLayout,
    config_overrides: Optional[Dict[str, Any]] = None,
    debug_mode: bool = False,
    run_id: Optional[str] = None,
    request_cache: Optional[Dict[str, Any]] = None,
    retry_downstream_only: bool = False,
    retry_reason: Optional[str] = None,
) -> ExtractionResult:
    set_extraction_metrics_context(run_id=run_id or "", pdf_path=pdf_path)

    warnings: List[str] = []
    timing: Dict[str, int] = {}
    used_ocr = False
    confidence = 0.0
    summary_hours: Optional[float] = None
    debug_payload: Dict[str, Any] = {}
    fallback_text = ""
    # Ensure forced attendance rows list exists before any references
    forced_attendance_rows: List[InvoiceRow] = []

    debug_dir = None
    if debug_mode:
        run_token = str(run_id or int(time.time()))
        debug_dir = str(Path("storage") / "debug" / f"extract_{run_token}")
    debug = DebugExporter(enabled=debug_mode, output_dir=debug_dir)

    profile_store = TemplateLearningStore(str(Path("storage") / "template_learning_profiles.json"))
    # initialize profiler for this request (near-zero overhead if disabled)
    profiler = new_request_collector()
    set_current(profiler)

    # Log startup/runtime choices for later verification
    try:
        try:
            # check optimized engine importable
            from pipeline import table_engine_optimized as _opt_test  # type: ignore
            engine_available = "optimized"
        except Exception:
            engine_available = "baseline"

        ocr_provider_name = str(CONFIG.providers.ocr_provider or "unknown")
        cfg_now = load_extraction_config()
        preprocessing_enabled = bool(getattr(cfg_now.skew, "enabled", True))

        logger.info("Startup: table_engine=%s ocr_provider=%s preprocessing=%s", engine_available, ocr_provider_name, preprocessing_enabled)
        try:
            if current():
                current().set_meta("table_engine_available", engine_available)
                current().set_meta("ocr_provider", ocr_provider_name)
                current().set_meta("preprocessing_enabled", preprocessing_enabled)
        except Exception:
            pass
    except Exception:
        pass

    started = time.time()
    table_stage_started = stage_start(logger, "table_extraction", pdf_path=pdf_path, run_id=run_id or "")

    try:
        t_text_start = time.time()
        with (current() or profiler).time_stage("pdf_load"):
            full_text, text_rows, text_fin, total_chars, scanned_ratio = _extract_pdf_text_tables(pdf_path)
        timing["text_extract_ms"] = int((time.time() - t_text_start) * 1000)
        rows = text_rows
        fin = text_fin

        if profile_store and full_text:
            learned = profile_store.match(build_template_fingerprint(full_text[:400]))
            if learned and isinstance(learned.get("config_overrides"), dict):
                config_overrides = learned.get("config_overrides")
                warnings.append("Applied learned template profile")

        route_to_ocr = _should_use_ocr_pipeline(total_chars, bool(rows), full_text, fmt)
        if route_to_ocr and _should_skip_ocr_post_pdfplumber(full_text, rows, scanned_ratio):
            route_to_ocr = False
            warnings.append("ocr_skipped:pdf_text_quality_high")
            if current():
                current().incr("ocr_skipped_pdfplumber", 1)
            log_event(
                logger,
                "stage_complete",
                stage="ocr_decision",
                run_id=run_id or "",
                pdf_path=pdf_path,
                ocr_skipped=True,
                reason="pdf_text_quality_high",
                scanned_ratio=round(float(scanned_ratio), 4),
                rows_detected=len(rows),
            )

        if route_to_ocr:
            used_ocr = True
            t_ocr_start = time.time()
            cached_tables = list((request_cache or {}).get("normalized_tables") or []) if request_cache else []
            cached_ocr_text = str((request_cache or {}).get("ocr_table_text") or "") if request_cache else ""
            cached_engine_debug = dict((request_cache or {}).get("table_engine_debug") or {}) if request_cache else {}
            cached_table_warnings = list((request_cache or {}).get("table_warnings") or []) if request_cache else []
            cached_avg_conf = float((request_cache or {}).get("ocr_avg_conf") or 0.0) if request_cache else 0.0
            if cached_tables and (cached_ocr_text or (request_cache or {}).get("table_extraction_completed")):
                tables = cached_tables
                table_warnings = cached_table_warnings
                avg_conf = cached_avg_conf
                ocr_table_text = cached_ocr_text
                engine_debug = cached_engine_debug
                log_event(logger, "ocr_cache_hit", pdf_path=pdf_path, artifact="normalized_tables", table_count=len(tables))
                log_event(logger, "cached_table_reuse", pdf_path=pdf_path, table_count=len(tables), retry_reason=str(retry_reason or ""))
                log_event(logger, "skipped_duplicate_ocr", pdf_path=pdf_path, reason="cached_tables_available")
                if retry_downstream_only:
                    log_event(logger, "parser_retry_only", pdf_path=pdf_path, reason=str(retry_reason or "retry"))
            else:
                ocr_timeout_s = max(3.0, float(CONFIG.timeouts.ocr_timeout_ms) / 1000.0)
                full_ocr_attempts = int((request_cache or {}).get("full_ocr_attempts") or 0) if request_cache else 0
                if retry_downstream_only and request_cache is not None and full_ocr_attempts >= 1:
                    log_event(logger, "skipped_duplicate_ocr", pdf_path=pdf_path, reason="retry_downstream_only")
                    tables, table_warnings, avg_conf, ocr_table_text, engine_debug = [], ["parser_retry_only:no_cached_tables"], 0.0, "", {}
                    used_ocr = False
                elif request_cache is not None and full_ocr_attempts >= 2:
                    log_event(logger, "skipped_duplicate_ocr", pdf_path=pdf_path, reason="ocr_retry_limit_reached")
                    tables, table_warnings, avg_conf, ocr_table_text, engine_debug = [], ["ocr_retry_limit_reached"], 0.0, "", {}
                    used_ocr = False
                else:
                    if request_cache is not None:
                        request_cache["full_ocr_attempts"] = full_ocr_attempts + 1
                        prof = current()
                        with (prof or new_request_collector()).time_stage("threadpool.create"):
                            _ocr_exec = ThreadPoolExecutor(max_workers=1)
                        # time the full table engine (rasterize, preprocess, OCR, tables)
                        def _run_table_engine():
                            set_extraction_metrics_context(run_id=run_id or "", pdf_path=pdf_path)
                            with (current() or profiler).time_stage("table_engine_total"):
                                try:
                                    from pipeline.table_engine_optimized import optimized_extract_table_engine
                                    logger.info("Runtime: invoking optimized table engine")
                                    try:
                                        if current():
                                            current().set_meta("table_engine_chosen", "optimized")
                                    except Exception:
                                        pass
                                    return optimized_extract_table_engine(pdf_path, fmt, debug, config_overrides, request_cache)
                                except Exception as exc:
                                    logger.info("Runtime: optimized engine unavailable, falling back: %s", exc)
                                    try:
                                        if current():
                                            current().set_meta("table_engine_chosen", "baseline")
                                            current().set_meta("table_engine_fallback_reason", str(exc))
                                    except Exception:
                                        pass
                                    # fallback to original
                                    return _extract_table_engine(pdf_path, fmt, debug, config_overrides, request_cache)

                        with (prof or new_request_collector()).time_stage("threadpool.submit"):
                            _future = _ocr_exec.submit(_run_table_engine)
                    try:
                        with (prof or new_request_collector()).time_stage("threadpool.wait"):
                            tables, table_warnings, avg_conf, ocr_table_text, engine_debug = _future.result(timeout=ocr_timeout_s)
                        if request_cache is not None:
                            request_cache["table_extraction_completed"] = True
                            request_cache["normalized_tables"] = list(tables or [])
                            request_cache["ocr_table_text"] = str(ocr_table_text or "")
                            request_cache["table_engine_debug"] = dict(engine_debug or {})
                            request_cache["table_warnings"] = list(table_warnings or [])
                            request_cache["ocr_avg_conf"] = float(avg_conf or 0.0)
                    except FutureTimeoutError:
                        _future.cancel()
                        tables, table_warnings, avg_conf, ocr_table_text, engine_debug = [], ["ocr_timeout_degraded"], 0.0, "", {}
                        used_ocr = False
                        warnings.append("review_recommended:ocr_timeout")
                        if request_cache is not None:
                            request_cache["ocr_failed"] = True
                            request_cache["ocr_failure_reason"] = "timeout"
                        log_event(
                            logger,
                            "timeout_degradation_activated",
                            stage="ocr",
                            pdf_path=pdf_path,
                            timeout_s=ocr_timeout_s,
                        )
                    finally:
                        _ocr_exec.shutdown(wait=False, cancel_futures=True)
            timing["ocr_table_engine_ms"] = int((time.time() - t_ocr_start) * 1000)
            stage_complete(
                logger,
                "table_extraction",
                table_stage_started,
                run_id=run_id or "",
                tables_detected=len(tables or []),
                warnings=len(table_warnings or []),
            )
            debug_payload["table_engine"] = engine_debug
            warnings.extend(table_warnings)

            if tables:
                table_payloads = route_document_tables(tables=tables, layout=layout)

                attendance_payloads = []
                summary_payloads = []
                financial_payloads = []
                metadata_payloads = []

                for payload in table_payloads:
                    log_event(
                        logger,
                        "TABLE_CLASSIFIED",
                        table_index=payload.table_index,
                        table_type=payload.table_type.value,
                        confidence=payload.confidence,
                    )
                    log_event(
                        logger,
                        "TABLE_PARSER_SELECTED",
                        table_index=payload.table_index,
                        parser=payload.parser_name,
                        table_type=payload.table_type.value,
                    )

                    if payload.table_type in {TableType.ATTENDANCE_TABLE, TableType.OVERTIME_TABLE}:
                        attendance_payloads.append(payload)
                    elif payload.table_type == TableType.PROJECT_SUMMARY_TABLE:
                        summary_payloads.append(payload)
                    elif payload.table_type in {
                        TableType.FINANCIAL_SUMMARY_TABLE,
                        TableType.DEDUCTION_SUMMARY_TABLE,
                        TableType.TOTALS_FOOTER_TABLE,
                    }:
                        financial_payloads.append(payload)
                    elif payload.table_type == TableType.METADATA_TABLE:
                        metadata_payloads.append(payload)

                    if payload.table_type in {
                        TableType.FINANCIAL_SUMMARY_TABLE,
                        TableType.DEDUCTION_SUMMARY_TABLE,
                        TableType.TOTALS_FOOTER_TABLE,
                    }:
                        log_event(
                            logger,
                            "financial_summary_detected",
                            table_index=payload.table_index,
                            subtotal=payload.financials.subtotal,
                            total_deduction=payload.financials.total_deduction,
                            total_vat=payload.financials.total_vat,
                            net_payable=payload.financials.net_payable,
                        )
                        if payload.financials.total_deduction > 0:
                            log_event(
                                logger,
                                "deduction_detected",
                                table_index=payload.table_index,
                                amount=payload.financials.total_deduction,
                                source="financial_summary_table",
                            )

                    if debug.enabled and debug.base_dir:
                        debug.json(
                            f"tables/table_{payload.table_index:03d}_parsed",
                            {
                                "table_index": payload.table_index,
                                "table_type": payload.table_type.value,
                                "confidence": payload.confidence,
                                "parser": payload.parser_name,
                                "rows_count": len(payload.rows),
                                "financials": {
                                    "subtotal": payload.financials.subtotal,
                                    "total_vat": payload.financials.total_vat,
                                    "total_deduction": payload.financials.total_deduction,
                                    "gross_total": payload.financials.gross_total,
                                    "net_payable": payload.financials.net_payable,
                                    "deduction_breakdown": payload.financials.deduction_breakdown,
                                },
                                "source_text": payload.source_text,
                            },
                        )

                log_event(
                    logger,
                    "TABLE_ROUTING_SUMMARY",
                    attendance_tables=len(attendance_payloads),
                    summary_tables=len(summary_payloads),
                    financial_tables=len(financial_payloads),
                    metadata_tables=len(metadata_payloads),
                )

                attendance_rows_raw: List[InvoiceRow] = []
                for p in attendance_payloads:
                    attendance_rows_raw.extend(p.rows or [])
                # include any rows parsed directly during row_fallback token handling
                if forced_attendance_rows:
                    attendance_rows_raw.extend(forced_attendance_rows)
                log_event(
                    logger,
                    "ATTENDANCE_ROWS_EXTRACTED",
                    count=len(attendance_rows_raw),
                    rows=[
                        {
                            "trade": r.trade,
                            "employee_id": r.employee_id,
                            "project_id": r.project_id,
                            "hours": r.hours,
                            "rate": r.rate,
                            "amount": r.amount,
                        }
                        for r in attendance_rows_raw
                    ],
                )

                primary_rows = _aggregate_primary_rows(attendance_rows_raw or rows)
                log_event(
                    logger,
                    "AGGREGATION_COMPLETE",
                    primary_input=len(attendance_rows_raw or rows),
                    aggregated_count=len(primary_rows),
                    aggregated_rows=[
                        {
                            "trade": r.trade,
                            "employee_id": r.employee_id,
                            "project_id": r.project_id,
                            "hours": r.hours,
                            "rate": r.rate,
                            "amount": r.amount,
                        }
                        for r in primary_rows
                    ],
                )

                merge_result = merge_table_payloads(
                    base_rows=primary_rows or rows,
                    base_financials=fin,
                    payloads=table_payloads,
                )
                fin = merge_result.financials

                # Summary-table extraction used for validation/correction layer only.
                summary_rows: List[InvoiceRow] = []
                for p in summary_payloads:
                    summary_rows.extend(p.rows or [])
                log_event(
                    logger,
                    "SUMMARY_ROWS_EXTRACTED",
                    count=len(summary_rows),
                    rows=[
                        {
                            "trade": r.trade,
                            "hours": r.hours,
                            "rate": r.rate,
                            "amount": r.amount,
                        }
                        for r in summary_rows
                    ],
                )

                merged_primary_rows = _aggregate_primary_rows(merge_result.rows or primary_rows or rows)
                validated_rows = _cross_validate_with_summary(merged_primary_rows, summary_rows, warnings)
                rows = _hard_validate_rows(validated_rows or merged_primary_rows or rows, warnings)
                log_event(
                    logger,
                    "VALIDATION_COMPLETE",
                    validated_count=len(rows),
                )

                # Keep financial rows aligned with validated normalized rows.
                row_subtotal = round(sum(float(r.amount or 0.0) for r in rows), 2)
                if fin.subtotal <= 0.0 or abs(fin.subtotal - row_subtotal) > max(3.0, row_subtotal * 0.35):
                    logger.info(
                        "VALIDATION_CORRECTION | subtotal_rebased_from_rows | old=%s | new=%s",
                        fin.subtotal,
                        row_subtotal,
                    )
                    fin.subtotal = row_subtotal

                has_summary_table = merge_result.debug.get("selected_financial_summary_table") is not None
                fin.summary_detected = bool(has_summary_table)
                if has_summary_table:
                    warnings.append("financial_source:financial_summary_table")

                log_event(
                    logger,
                    "financial_state",
                    stage="merge_complete",
                    run_id=run_id or "",
                    pdf_path=pdf_path,
                    subtotal=float(fin.subtotal or 0.0),
                    deduction=float(fin.total_deduction or 0.0),
                    deduction_vat=float(fin.deduction_vat or 0.0),
                    adjusted_subtotal=float(fin.adjusted_subtotal or 0.0),
                    vat=float(fin.total_vat or 0.0),
                    net_total=float(fin.net_payable or 0.0),
                    deduction_source=str(fin.deduction_source or ""),
                    summary_detected=bool(fin.summary_detected),
                )

                log_event(
                    logger,
                    "TABLE_MERGE_COMPLETE",
                    merged_rows=len(rows),
                    payload_count=merge_result.debug.get("payload_count", 0),
                    selected_financial_summary_table=merge_result.debug.get("selected_financial_summary_table"),
                )
                debug_payload["table_merge"] = merge_result.debug

            if ocr_table_text:
                max_ocr_text_chars = max(1000, int(os.getenv("MAX_OCR_TEXT_CHARS", "45000")))
                ocr_table_text, was_truncated = _truncate_ocr_text_prioritized(ocr_table_text, max_ocr_text_chars)
                if was_truncated:
                    warnings.append("ocr_text_truncated")
                    log_event(
                        logger,
                        "ocr_truncation_activated",
                        pdf_path=pdf_path,
                        max_ocr_text_chars=max_ocr_text_chars,
                    )
                full_text = f"{full_text}\n{ocr_table_text}".strip()

            if not rows:
                # Heuristic row-fallback: when normalized tables exist but _rows_from_normalized_tables
                # produced no accepted rows, attempt a permissive parse from normalized tables.
                def _heuristic_rows_from_normalized(tables):
                    out_rows = []
                    for table in tables:
                        for row in table:
                            cells = [_clean(c) for c in row]
                            if not any(cells):
                                continue
                            joined = " ".join(cells)
                            # find last numeric token as amount
                            nums = [re.sub(r"[^0-9\.\,]", "", tok) for tok in re.findall(r"\d+[\.,]?\d{0,2}", joined)]
                            amount = float(nums[-1].replace(',', '.')) if nums else 0.0
                            # find trade by scanning known trade keywords
                            trade = ""
                            trade_re = re.compile(r"(Tile\s*Mason|Steel\s*Fixer|Steelfixer|Carpenter|Helper|Mason|Plumber|Electrician|Painter|Welder|Labourer|Laborer|Foreman|Driver|Operator|Technician)", re.I)
                            m = trade_re.search(joined)
                            if m:
                                trade = m.group(0).strip()
                            # find employee-like token: two-word cluster with letters
                            employee = None
                            for tok in cells:
                                if tok and re.search(r"[A-Za-z]", tok) and not tok.isupper() and len(tok.split()) >= 2:
                                    employee = tok
                                    break
                            if trade and amount > 0:
                                # best-effort hours/rate detection
                                numbers = [float(re.sub(r"[^0-9\.]", "", t).replace(',', '.')) for t in re.findall(r"\d+[\.,]?\d{0,2}", joined)]
                                rate = numbers[-2] if len(numbers) >= 2 else 0.0
                                hours = numbers[-3] if len(numbers) >= 3 else 0.0
                                out_rows.append(
                                    InvoiceRow(
                                        trade=trade.upper(),
                                        project_id=None,
                                        employee_id=None if layout == InvoiceLayout.PROJECT_BASED else (employee or None),
                                        hours=round(hours, 2),
                                        rate=round(rate, 2),
                                        amount=round(amount, 2),
                                        calculated_hours=round(hours, 2),
                                        attendance_days=0,
                                        overtime_hours=0.0,
                                    )
                                )
                    return out_rows

                # attempt heuristic fallback only when normalized tables present
                heuristic_accepted = []
                if (request_cache or {}).get('normalized_tables'):
                    norm_tables = (request_cache or {}).get('normalized_tables') or []
                    # require sufficient OCR tokens to avoid false positives
                    ocr_token_count = sum(len([c for row in table for c in row if c and re.search(r"\w", str(c))]) for table in norm_tables)
                    if ocr_token_count >= 20:
                        try:
                            heuristic_accepted = _heuristic_rows_from_normalized(norm_tables)
                        except Exception:
                            heuristic_accepted = []
                if heuristic_accepted:
                    rows = _aggregate_primary_rows(heuristic_accepted)
                    warnings.append('structured_rows_required:row_fallback_heuristic')
                    log_event(logger, 'ROW_FALLBACK_HEURISTIC_USED', pdf_path=pdf_path, run_id=run_id or '', accepted=len(rows))
                else:
                    fallback_text = _ocr_full_text(pdf_path)
                if not rows:
                    if fallback_text:
                        full_text = f"{full_text}\n{fallback_text}".strip()
                        fallback_rows, fallback_fin, fallback_warnings = _parse_attendance_grid_from_ocr_text(fallback_text)
                        if fallback_rows:
                            rows = _aggregate_primary_rows(fallback_rows)
                            fin = fallback_fin if float(fallback_fin.total_deduction or 0.0) > 0 or float(fallback_fin.net_payable or 0.0) > 0 else fin
                            warnings.extend(fallback_warnings)
                            warnings.append("structured_rows_required:full_page_ocr_text_fallback")
                        else:
                            fallback_generic_rows = _parse_generic_rows(fallback_text)
                            if fallback_generic_rows:
                                rows = _aggregate_primary_rows(fallback_generic_rows)
                                warnings.append("structured_rows_required:generic_full_text_fallback")
                            else:
                                warnings.append("structured_rows_required:no_generic_ocr_row_fallback")
                    else:
                        warnings.append("structured_rows_required:no_generic_ocr_row_fallback")
            elif used_ocr and len(rows) < 4:
                fallback_text = _ocr_full_text(pdf_path)
                if fallback_text:
                    full_text = f"{full_text}\n{fallback_text}".strip()
                    fallback_rows, fallback_fin, fallback_warnings = _parse_attendance_grid_from_ocr_text(fallback_text)
                    if len(fallback_rows) > len(rows):
                        rows = _aggregate_primary_rows(fallback_rows)
                        if float(fallback_fin.total_deduction or 0.0) > 0 or float(fallback_fin.net_payable or 0.0) > 0 or float(fallback_fin.subtotal or 0.0) > 0:
                            fin = fallback_fin
                        warnings.extend(fallback_warnings)
                        warnings.append("structured_rows_replaced:full_page_ocr_text_better")

            confidence = max(0.58, min(0.92, avg_conf if avg_conf > 0 else 0.7))
        else:
            confidence = 0.98 if rows else 0.6

        if not rows and not used_ocr:
            warnings.append("structured_rows_required:no_full_page_ocr_row_fallback")

        meta = _extract_metadata(full_text)
        deduction_result = extract_deduction_total(
            rows=rows,
            existing_total=fin.total_deduction,
            full_text=full_text,
            used_ocr=used_ocr,
            has_summary_table=("financial_source:financial_summary_table" in warnings),
            existing_breakdown=fin.deduction_breakdown,
        )
        fin.total_deduction = deduction_result.total_deduction
        fin.deduction_source = deduction_result.source
        if deduction_result.breakdown:
            fin.deduction_breakdown = deduction_result.breakdown
        log_event(
            logger,
            "FINANCIALS_EXTRACTED",
            run_id=run_id or "",
            pdf_path=pdf_path,
            source=deduction_result.source,
            amount=fin.total_deduction,
            matched_line=deduction_result.matched_line or "",
            used_ocr=used_ocr,
        )
        if deduction_result.source != "none":
            warnings.append(f"deduction_source:{deduction_result.source}")

        repairs = _validate_rows(rows, fin, warnings, summary_hours)
        if repairs:
            # penalize confidence slightly when numeric repairs were applied
            confidence = max(0.0, confidence - 0.05)

        attendance_validation = [
            {
                "trade": r.trade,
                "hours": r.hours,
                "calculated_hours": r.calculated_hours,
                "hours_match": r.hours_match,
                "overtime_hours": r.overtime_hours,
            }
            for r in rows
        ]
        debug_payload["attendance_validation"] = attendance_validation
        debug_payload["confidence_breakdown"] = {
            "route": "ocr" if used_ocr else "pdfplumber",
            "final_confidence": confidence,
        }

        if fin.subtotal == 0.0:
            fin.subtotal = round(sum(r.amount for r in rows), 2)
        if fin.gross_total == 0.0:
            fin.gross_total = round(fin.subtotal - fin.total_deduction, 2)
        if fin.net_payable == 0.0:
            fin.net_payable = round(fin.gross_total, 2)

        elapsed_ms = int((time.time() - started) * 1000)
        timing["total_ms"] = elapsed_ms

        log_event(
            logger,
            "extraction_complete",
            run_id=run_id or "",
            pdf_path=pdf_path,
            rows=len(rows),
            used_ocr=used_ocr,
            confidence=confidence,
            timings=timing,
        )

        # Emit AI_PROFILE summary if enabled
        prof = current() or profiler
        if prof and getattr(prof, "enabled", False):
            try:
                summary = prof.report()
                print(summary)
                log_event(logger, "ai_profile_summary", pdf_path=pdf_path, summary=summary)
            except Exception:
                pass
        # unset current profiler
        try:
            set_current(None)
        except Exception:
            pass

        if profile_store and rows:
            fingerprint = build_template_fingerprint(full_text[:400])
            profile_store.learn_success(name=fmt.value, fingerprint=fingerprint, config_overrides=config_overrides or {})

        if debug.enabled and debug.base_dir and should_sample_debug_artifacts():
            debug_payload.update(
                {
                    "timings": timing,
                    "warnings": warnings,
                    "file": pdf_path,
                }
            )
            debug.json("extraction_debug_report", debug_payload)
            warnings.append(f"debug_report:{str(debug.base_dir / 'extraction_debug_report.json')}")

        # Determine FINAL_ROW_SOURCE
        try:
            final_row_source = "ocr_table"
            if locals().get("semantic_rows") or ("structured_rows_required:layout_ocr_semantic_fallback" in warnings):
                final_row_source = "semantic"
            elif any("row_fallback" in w for w in warnings):
                final_row_source = "heuristic"
            elif used_ocr and all_tables:
                final_row_source = "ocr_table"
            elif not used_ocr and rows:
                final_row_source = "vision"
            elif used_ocr and rows and ("financial_source:financial_summary_table" in warnings):
                final_row_source = "hybrid"
        except Exception:
            final_row_source = "ocr_table"

        log_event(logger, "FINAL_ROW_SOURCE", source=final_row_source)

        print(f"FINAL_ROW_SOURCE: {final_row_source}")

        return ExtractionResult(
            success=len(rows) > 0,
            format=fmt,
            layout=layout,
            rows=rows,
            financials=fin,
            metadata=meta,
            confidence=confidence,
            used_ocr=used_ocr,
            used_vision=False,
            raw_text=full_text,
            warnings=warnings,
            processing_time_ms=elapsed_ms,
        )

    except Exception as exc:
        stage_failure(
            logger,
            "table_extraction",
            table_stage_started,
            exc,
            pdf_path=pdf_path,
            run_id=run_id or "",
            failure_category=classify_failure(exc),
        )
        logger.exception("text_extractor failed: %s", exc)
        try:
            set_current(None)
        except Exception:
            pass
        return ExtractionResult(
            success=False,
            format=fmt,
            layout=layout,
            rows=[],
            financials=InvoiceFinancials(),
            metadata=TimesheetMetadata(),
            confidence=0.0,
            error=str(exc),
            processing_time_ms=int((time.time() - started) * 1000),
        )
