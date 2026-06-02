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

        if c0 == "TOTAL" and not c1:
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


def _parse_generic_rows(full_text: str) -> List[InvoiceRow]:
    rows: List[InvoiceRow] = []

    for line in full_text.splitlines():
        ln = " ".join(line.split())
        if len(ln) < 8:
            continue

        ln_upper = ln.upper()
        if any(rej in ln_upper for rej in _GENERIC_REJECT):
            continue

        numbers = re.findall(r"\d{1,3}(?:,\d{3})*(?:\.\d+)?", ln)
        if len(numbers) < 3:
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
            continue

        rows.append(
            InvoiceRow(
                trade=trade_name.upper(),
                project_id=proj.group(0).upper() if proj else None,
                hours=_to_float(numbers[0]),
                rate=_to_float(numbers[1]),
                amount=_to_float(numbers[2]),
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

    cells: List[Dict[str, Any]] = []
    for item in result:
        box_pts, text, score = item[0], item[1], float(item[2] or 0.0)
        if not text or score < min_confidence:
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

    # Performance gain comes from batch OCR (1 call per table vs N per cell).
    # Keep 300 DPI for accurate morphological line detection.
    OCR_DPI = 300
    pages = _convert_from_path(pdf_path, dpi=OCR_DPI)
    normalizer = TableNormalizer(config=TableNormalizerConfig())

    # Shared OCR engine — instantiate ONCE and reuse across all tables
    _shared_ocr = _RapidOCR() if _RapidOCR else None

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
                "table_detected",
                page=page_idx,
                table=table_idx,
                bbox={"x": x, "y": y, "w": w, "h": h},
                area=int(w * h),
            )
            crop = page_img[y : y + h, x : x + w]

            h_mask = detected.horizontal_mask[y : y + h, x : x + w]
            v_mask = detected.vertical_mask[y : y + h, x : x + w]

            # --- BATCH OCR: run once per table crop (not per cell) ---
            rel_cells = _batch_ocr_image(crop, _shared_ocr, min_confidence=config.ocr.min_confidence)
            if not rel_cells:
                # Low-quality scan: retry with lower confidence threshold
                rel_cells = _batch_ocr_image(crop, _shared_ocr, min_confidence=0.1)

            # Always record raw batch-OCR text so attendance tokens (W/H/A/OFF)
            # are preserved in ocr_text_parts even if grid normalization filters them out.
            if rel_cells:
                raw_tokens = " ".join(c["text"] for c in rel_cells if c.get("text"))
                if raw_tokens:
                    ocr_text_parts.append(raw_tokens)

            if not rel_cells:
                # Fallback: grid boundaries from masks only (no OCR text)
                t_mask = cv2.bitwise_or(h_mask, v_mask)
                recon_fallback = GridReconstructor(config=GridReconstructorConfig()).reconstruct(
                    table_image=crop, ocr_cells=[],
                    horizontal_mask=h_mask, vertical_mask=v_mask,
                )
                # Still push an empty-but-structured table
                normalized = normalizer.normalize(recon_fallback.table)
                if normalized:
                    all_tables.append(normalized)
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
                abs_cell["x"] = int(cell.get("x", 0) + x)
                abs_cell["y"] = int(cell.get("y", 0) + y)
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

        # Full-page OCR pass — ensures any text that didn't land in a table crop
        # (headers, attendance markers, etc.) is still captured in ocr_text_parts.
        page_wide_cells = _batch_ocr_image(page_img, _shared_ocr, min_confidence=0.3)
        if page_wide_cells:
            page_tokens = " ".join(c["text"] for c in page_wide_cells if c.get("text"))
            if page_tokens:
                ocr_text_parts.append(page_tokens)

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

            # ===== SEMANTIC FILTER: Classify row type =====
            row_type = classify_row(cells)
            if row_type != RowType.VALID_LABOUR_ROW:
                rejected_count += 1
                logger.debug(f"Rejected row (type={row_type.name}): {cells[:3]}")
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
                continue

            trade = cells[0]
            if not trade or trade.lower() in _SKIP_FIRST:
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

                for payload in table_payloads:
                    log_event(
                        logger,
                        "table_classified",
                        table_index=payload.table_index,
                        table_type=payload.table_type.value,
                        confidence=payload.confidence,
                    )
                    log_event(
                        logger,
                        "table_parser_selected",
                        table_index=payload.table_index,
                        parser=payload.parser_name,
                        table_type=payload.table_type.value,
                    )

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

                labour_tables = [
                    tables[p.table_index]
                    for p in table_payloads
                    if p.table_type in {TableType.ATTENDANCE_TABLE, TableType.PROJECT_SUMMARY_TABLE, TableType.OVERTIME_TABLE}
                ]
                labour_rows: List[InvoiceRow] = []
                labour_fin = InvoiceFinancials()
                if labour_tables:
                    labour_rows, labour_fin, labour_summary_hours = _rows_from_normalized_tables(labour_tables, layout, warnings)
                    summary_hours = labour_summary_hours

                merge_result = merge_table_payloads(
                    base_rows=labour_rows or rows,
                    base_financials=labour_fin if (labour_fin.subtotal > 0 or labour_fin.total_deduction > 0) else fin,
                    payloads=table_payloads,
                )
                rows = merge_result.rows or rows
                fin = merge_result.financials

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
                    "table_merge_complete",
                    merged_rows=len(rows),
                    payload_count=merge_result.debug.get("payload_count", 0),
                    selected_financial_summary_table=merge_result.debug.get("selected_financial_summary_table"),
                )
                debug_payload["table_merge"] = merge_result.debug

            if ocr_table_text:
                full_text = f"{full_text}\n{ocr_table_text}".strip()

            if not rows:
                ocr_text = _ocr_full_text(pdf_path)
                if ocr_text:
                    full_text = ocr_text
                    rows = _parse_generic_rows(ocr_text)
                    warnings.append("Fallback generic OCR parser used")

            confidence = max(0.58, min(0.92, avg_conf if avg_conf > 0 else 0.7))
        else:
            confidence = 0.98 if rows else 0.6

        if not rows and not used_ocr:
            ocr_text = _ocr_full_text(pdf_path)
            if ocr_text:
                used_ocr = True
                rows = _parse_generic_rows(ocr_text)
                full_text = ocr_text
                confidence = 0.68
                warnings.append("OCR extraction used")

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
            "deduction_extracted",
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