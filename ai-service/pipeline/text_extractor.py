"""Universal text + OCR extraction with intelligent routing and table reconstruction."""

from __future__ import annotations

import logging
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np
import pdfplumber

try:
    import numpy as _np
    from pdf2image import convert_from_path as _convert_from_path
    from rapidocr_onnxruntime import RapidOCR as _RapidOCR

    _OCR_OK = True
except ImportError:
    _np = None
    _convert_from_path = None
    _RapidOCR = None
    _OCR_OK = False

from schema import (
    ExtractionResult,
    InvoiceFinancials,
    InvoiceLayout,
    InvoiceRow,
    TimesheetFormat,
    TimesheetMetadata,
)

from pipeline.debug_utils import DebugExporter
from pipeline.deduction_parser import extract_deduction_total
from pipeline.extraction_config import apply_runtime_overrides, apply_template_overrides, config_to_dict, load_extraction_config
from pipeline.scan_quality import score_scan_quality
from pipeline.semantic_filter import filter_labour_rows
from pipeline.structured_logging import log_event
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

logger = logging.getLogger(__name__)


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
    if not _OCR_OK:
        return ""

    try:
        ocr = _RapidOCR()
        pages = _convert_from_path(pdf_path, dpi=250)
        page_texts: List[str] = []

        for image in pages:
            result, _ = ocr(_np.array(image))
            if not result:
                continue

            tokens = []
            for box, text, _score in result:
                if not text:
                    continue
                y = sum(point[1] for point in box) / 4
                x = sum(point[0] for point in box) / 4
                tokens.append((y, x, text))

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


def _extract_pdf_text_tables(pdf_path: str) -> Tuple[str, List[InvoiceRow], InvoiceFinancials, int]:
    rows: List[InvoiceRow] = []
    fin = InvoiceFinancials()
    full_text_parts: List[str] = []
    total_chars = 0

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            full_text_parts.append(page_text)
            total_chars += len(page_text)

            for tbl in page.extract_tables() or []:
                if not tbl or len(tbl) < 2:
                    continue
                hdr = " ".join(_clean(c).upper() for c in (tbl[0] or []) if c)
                if "TRADE" in hdr and "AMOUNT" in hdr:
                    parsed_rows, parsed_fin = _parse_mcc_summary_table(tbl)
                    if parsed_rows:
                        rows = parsed_rows
                        fin = parsed_fin

    return "\n".join(full_text_parts), rows, fin, total_chars


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

    try:
        result, _ = ocr_engine(image)
    except Exception as exc:
        logger.warning("Batch OCR failed: %s", exc)
        return []

    if not result:
        return []

    effective_min_conf = max(0.0, float(min_confidence or 0.0))

    cells: List[Dict[str, Any]] = []
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


def _extract_table_engine(
    pdf_path: str,
    fmt: TimesheetFormat,
    debug: DebugExporter,
    config_overrides: Optional[Dict[str, Any]] = None,
) -> Tuple[List[List[List[str]]], List[str], float, str, Dict[str, Any]]:
    if not _OCR_OK:
        return [], ["RapidOCR/pdf2image not available; OCR pipeline skipped"], 0.0, "", {}

    config = load_extraction_config()
    config = apply_runtime_overrides(config, config_overrides)

    # Keep 300 DPI for accurate morphology and cell-level OCR.
    OCR_DPI = 300
    pages = _convert_from_path(pdf_path, dpi=OCR_DPI)
    normalizer = TableNormalizer(config=TableNormalizerConfig())
    cell_extractor = CellExtractor(
        config=CellExtractorConfig(
            min_confidence=config.ocr.min_confidence,
            debug_dir=None,
        )
    )

    all_tables: List[List[List[str]]] = []
    warnings: List[str] = []
    confidences: List[float] = []
    ocr_text_parts: List[str] = []
    debug_tables: List[Dict[str, Any]] = []
    quality_scores: List[float] = []

    for page_idx, page in enumerate(pages, 1):
        page_img = cv2.cvtColor(_np.array(page), cv2.COLOR_RGB2BGR)

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

        debug.image(f"page_{page_idx:02d}_table_mask", detected.table_mask)

        for table_idx, contour in enumerate(detected.contours, 1):
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

            rel_cells = cell_extractor.extract_cells(crop, cell_boxes)

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

    if not all_tables:
        warnings.append("No structured table reconstructed from OCR pipeline")

    avg_conf = float(np.mean(confidences)) if confidences else 0.0
    debug_payload = {
        "tables": debug_tables,
        "scan_quality_avg": float(np.mean(quality_scores)) if quality_scores else 0.0,
        "config": config_to_dict(config),
    }
    return all_tables, warnings, avg_conf, "\n".join(ocr_text_parts), debug_payload


def _rows_from_normalized_tables(
    tables: Sequence[Sequence[Sequence[str]]],
    layout: InvoiceLayout,
    warnings: List[str],
) -> Tuple[List[InvoiceRow], InvoiceFinancials, Optional[float]]:
    from pipeline.semantic_filter import classify_row, RowType
    
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

            trade = cells[0]
            if not trade or trade.upper() in _FINANCIAL_TRADE_BLOCK or trade.lower() in _SKIP_FIRST:
                _log_rejected("financial_or_invalid_trade")
                continue

            project = ""
            for token in cells:
                m = _PROJECT_RE.search(token)
                if m:
                    project = m.group(0).upper()
                    break

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
                employee_id=None if layout == InvoiceLayout.PROJECT_BASED else (cells[1] if len(cells) > 1 else None),
                hours=round(hours, 2),
                rate=round(rate, 2),
                amount=round(amount, 2),
                calculated_hours=round(attendance_hours, 2),
                attendance_days=sum(1 for c in cells if c.upper() in {"W", "H", "OFF"}),
                overtime_hours=round(overtime, 2),
            )
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

    for row in rows:
        calc_hours = row.calculated_hours if row.calculated_hours > 0 else (round(row.amount / row.rate, 2) if row.rate else 0.0)
        row.hours_match = abs(calc_hours - row.hours) <= 1.0
        if not row.hours_match:
            warnings.append(f"Hours mismatch detected for {row.trade}: row={row.hours} calc={calc_hours}")

        if row.rate > 0 and row.hours > 0:
            expected_amount = round(row.hours * row.rate, 2)
            if abs(expected_amount - row.amount) > 1.0:
                warnings.append(
                    f"Amount mismatch for {row.trade}: amount={row.amount} expected={expected_amount}"
                )

        if row.deduction_total > 0 and row.deductions:
            ded_sum = round(sum(float(v) for v in row.deductions.values()), 2)
            if abs(ded_sum - row.deduction_total) > 0.5:
                warnings.append(f"Deduction mismatch in {row.trade}")

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
        if float(r.amount or 0.0) <= 0 or float(r.amount or 0.0) > 1000000:
            log_event(logger, "ROW_REJECTED", reason="hard_validation:non_positive_amount", row=str(r))
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


def extract_text_pdf(
    pdf_path: str,
    fmt: TimesheetFormat,
    layout: InvoiceLayout,
    config_overrides: Optional[Dict[str, Any]] = None,
    debug_mode: bool = False,
    run_id: Optional[str] = None,
) -> ExtractionResult:
    started = time.time()

    rows: List[InvoiceRow] = []
    fin = InvoiceFinancials()
    warnings: List[str] = []
    confidence = 0.5
    used_ocr = False
    full_text = ""
    summary_hours: Optional[float] = None
    timing: Dict[str, int] = {}
    debug_payload: Dict[str, Any] = {}

    cfg = load_extraction_config()
    cfg = apply_runtime_overrides(cfg, config_overrides)
    if debug_mode:
        cfg.debug.enabled = True
    debug = DebugExporter(enabled=cfg.debug.enabled, output_dir=cfg.debug.output_dir)

    learning_root = Path(cfg.debug.output_dir or (Path(__file__).resolve().parents[1] / "storage" / "debug"))
    learning_root.mkdir(parents=True, exist_ok=True)
    profile_store = TemplateLearningStore(str(learning_root / "template_learning.json"))

    try:
        t_text_start = time.time()
        full_text, text_rows, text_fin, total_chars = _extract_pdf_text_tables(pdf_path)
        timing["text_extract_ms"] = int((time.time() - t_text_start) * 1000)
        rows = text_rows
        fin = text_fin

        if profile_store and full_text:
            learned = profile_store.match(build_template_fingerprint(full_text[:400]))
            if learned and isinstance(learned.get("config_overrides"), dict):
                config_overrides = learned.get("config_overrides")
                warnings.append("Applied learned template profile")

        route_to_ocr = _should_use_ocr_pipeline(total_chars, bool(rows), full_text, fmt)

        if route_to_ocr:
            used_ocr = True
            t_ocr_start = time.time()
            tables, table_warnings, avg_conf, ocr_table_text, engine_debug = _extract_table_engine(
                pdf_path,
                fmt,
                debug,
                config_overrides=config_overrides,
            )
            timing["ocr_table_engine_ms"] = int((time.time() - t_ocr_start) * 1000)
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
                full_text = f"{full_text}\n{ocr_table_text}".strip()

            if not rows:
                warnings.append("structured_rows_required:no_generic_ocr_row_fallback")

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

        _validate_rows(rows, fin, warnings, summary_hours)

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

        if profile_store and rows:
            fingerprint = build_template_fingerprint(full_text[:400])
            profile_store.learn_success(name=fmt.value, fingerprint=fingerprint, config_overrides=config_overrides or {})

        if debug.enabled and debug.base_dir:
            debug_payload.update(
                {
                    "timings": timing,
                    "warnings": warnings,
                    "file": pdf_path,
                }
            )
            debug.json("extraction_debug_report", debug_payload)
            warnings.append(f"debug_report:{str(debug.base_dir / 'extraction_debug_report.json')}")

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
        logger.exception("text_extractor failed: %s", exc)

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
