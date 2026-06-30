"""
ocr_extractor.py

STEP 2c — OCR extraction.

This is the FINAL FALLBACK only. It runs when:
  - Gemini Vision fails
  - Gemini returns invalid JSON
  - Gemini returns zero employees
  - Gemini API times out

Per spec: OCR should NOT run when Vision succeeds.

Uses RapidOCR + OpenCV for offline extraction.
Returns NormalizedInvoice.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

from normalized_output import (
    NormalizedDeductions,
    NormalizedInvoice,
    NormalizedInvoiceRow,
    repair_row,
    sanity_check_row,
)

logger = logging.getLogger(__name__)


_TRADE_RE = re.compile(
    r"\b(tile\s*mason|steel\s*fix(?:er)?|mason|carpenter|helper|plumber|"
    r"electrician|painter|welder|scaff(?:older)?|foreman|driver|operator|"
    r"labou?r(?:er)?|technician)\b",
    re.I,
)
_PROJECT_RE = re.compile(r"\bP\d{3,8}[A-Z0-9]*\b", re.I)
_AMOUNT_RE = re.compile(r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?")
_DEDUCTION_KEYS = {
    "total deduction", "total absent amount", "absent amount",
    "absent deduction", "food deduction", "mess", "gas", "transport",
    "advance", "loan", "penalty",
}
_SUBTOTAL_KEYS = {"subtotal", "sub total", "gross total", "total amount"}
_NET_KEYS = {"net payable", "net amount payable", "net amount", "amount payable"}
_VAT_KEYS = {"vat", "vat amount"}


def _to_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = re.sub(r"[^0-9.\-]", "", str(value).replace(",", ""))
    try:
        return float(cleaned) if cleaned and cleaned != "." else 0.0
    except ValueError:
        return 0.0


def _render_pages(pdf_path: str, dpi: int = 250) -> List[Any]:
    """Render PDF pages using pdf2image."""
    try:
        from pdf2image import convert_from_path
        import numpy as np
        import cv2

        pages = convert_from_path(pdf_path, dpi=dpi, first_page=1, last_page=10)
        result = []
        for p in pages:
            arr = np.array(p.convert("RGB"))
            result.append(cv2.cvtColor(arr, cv2.COLOR_RGB2BGR))
        return result
    except Exception as exc:
        logger.warning("OCR page render failed: %s", exc)
        return []


def _run_ocr_on_image(image: Any) -> List[Dict[str, Any]]:
    """
    Run RapidOCR on a single page image.
    Returns list of {text, x, y, w, h, confidence} tokens.
    """
    tokens: List[Dict[str, Any]] = []

    try:
        from rapidocr_onnxruntime import RapidOCR
        engine = RapidOCR()
        result, _ = engine(image)
        if not result:
            return tokens
        for item in result:
            box_pts, text, score = item[0], item[1], float(item[2] or 0.0)
            if not text or score < 0.3:
                continue
            xs = [int(p[0]) for p in box_pts]
            ys = [int(p[1]) for p in box_pts]
            tokens.append({
                "text": str(text).strip(),
                "x": min(xs),
                "y": min(ys),
                "w": max(xs) - min(xs),
                "h": max(ys) - min(ys),
                "confidence": score,
            })
    except Exception as exc:
        logger.warning("RapidOCR failed: %s", exc)

    return tokens


def _cluster_tokens_into_lines(
    tokens: Sequence[Dict[str, Any]],
) -> List[List[Dict[str, Any]]]:
    """Group OCR tokens into horizontal lines by Y proximity."""
    if not tokens:
        return []

    sorted_tokens = sorted(tokens, key=lambda t: (t["y"], t["x"]))
    heights = [t["h"] for t in sorted_tokens if t["h"] > 0]
    import statistics
    median_h = statistics.median(heights) if heights else 14.0
    threshold = max(6.0, median_h * 0.7)

    lines: List[List[Dict[str, Any]]] = []
    for token in sorted_tokens:
        cy = token["y"] + token["h"] / 2.0
        placed = False
        for line in lines:
            line_cy = sum(t["y"] + t["h"] / 2.0 for t in line) / len(line)
            if abs(cy - line_cy) <= threshold:
                line.append(token)
                placed = True
                break
        if not placed:
            lines.append([token])

    for line in lines:
        line.sort(key=lambda t: t["x"])

    return sorted(lines, key=lambda line: line[0]["y"])


def _line_text(line: List[Dict[str, Any]]) -> str:
    return " ".join(t["text"] for t in line if t.get("text"))


def _extract_financials_from_lines(
    lines: List[List[Dict[str, Any]]],
) -> Dict[str, float]:
    """Scan OCR lines for financial totals using semantic keyword matching."""
    fin: Dict[str, float] = {}
    for line in lines:
        text = _line_text(line)
        norm = " ".join(text.lower().split())
        amounts = [_to_float(m) for m in _AMOUNT_RE.findall(text) if _to_float(m) > 0]
        if not amounts:
            continue
        last = amounts[-1]
        if any(k in norm for k in _DEDUCTION_KEYS) and "total_deduction" not in fin:
            fin["total_deduction"] = last
        elif any(k in norm for k in _SUBTOTAL_KEYS) and "subtotal" not in fin:
            fin["subtotal"] = last
        elif any(k in norm for k in _NET_KEYS) and "net_payable" not in fin:
            fin["net_payable"] = last
        elif any(k in norm for k in _VAT_KEYS) and "vat" not in fin:
            fin["vat"] = last
    return fin


def _parse_labour_lines(
    lines: List[List[Dict[str, Any]]],
) -> List[NormalizedInvoiceRow]:
    """
    Extract labour rows from OCR lines using semantic pattern matching.
    Generalizes to any layout — no hardcoded column positions.
    """
    rows: List[NormalizedInvoiceRow] = []

    # Skip lines that are header/financial markers
    _SKIP_PATTERNS = re.compile(
        r"\b(total|subtotal|vat|net|invoice|timesheet|trn|trnno|"
        r"date|month|prepared|approved|signature|page)\b",
        re.I,
    )

    for line in lines:
        text = _line_text(line)
        if not text or len(text) < 5:
            continue
        if _SKIP_PATTERNS.search(text):
            continue

        # Must contain a recognizable trade
        trade_match = _TRADE_RE.search(text)
        if not trade_match:
            continue

        trade = trade_match.group(0).strip().upper()

        # Extract all numbers
        numbers = [_to_float(m) for m in _AMOUNT_RE.findall(text)]
        numbers = [n for n in numbers if n > 0]

        if len(numbers) < 2:
            continue

        # Heuristic assignment: largest = amount, second-largest = rate, smallest <= 744 = hours
        amount = max(numbers)
        remaining = [n for n in numbers if n != amount]
        rate = max(remaining) if remaining else 0.0
        hours_candidates = [n for n in numbers if 0 < n <= 744]
        hours = min(hours_candidates) if hours_candidates else 0.0

        if amount <= 0:
            continue

        # Find project code
        project = ""
        proj_match = _PROJECT_RE.search(text)
        if proj_match:
            project = proj_match.group(0)

        row = NormalizedInvoiceRow(
            description=trade,
            quantity=round(hours, 2),
            rate=round(rate, 4),
            amount=round(amount, 2),
            project=project,
        )

        violations = sanity_check_row(row)
        if violations:
            continue

        row, repairs = repair_row(row)
        rows.append(row)

    return rows


def extract_ocr(pdf_path: str) -> NormalizedInvoice:
    """
    FINAL FALLBACK extraction using RapidOCR.

    Only called when Vision (Gemini) fails entirely.
    Renders pages, runs OCR, clusters tokens into lines,
    then extracts labour rows and financials semantically.

    Returns NormalizedInvoice.
    """
    invoice = NormalizedInvoice()
    invoice.extraction_source = "ocr"

    logger.info("ocr_extract starting (final fallback) pdf=%s", pdf_path)

    pages = _render_pages(pdf_path, dpi=250)
    if not pages:
        invoice.error = "OCR_NO_PAGES_RENDERED"
        return invoice

    all_rows: List[NormalizedInvoiceRow] = []
    all_lines: List[List[Dict[str, Any]]] = []

    for page_idx, page_img in enumerate(pages, 1):
        tokens = _run_ocr_on_image(page_img)
        if not tokens:
            invoice.warnings.append(f"ocr_page_{page_idx}:no_tokens")
            continue

        lines = _cluster_tokens_into_lines(tokens)
        all_lines.extend(lines)

        page_rows = _parse_labour_lines(lines)
        all_rows.extend(page_rows)
        logger.info("ocr_extract page=%d tokens=%d rows=%d", page_idx, len(tokens), len(page_rows))

    # Aggregate duplicate trades
    aggregated = _aggregate_rows(all_rows)

    # Extract financials
    fin = _extract_financials_from_lines(all_lines)

    invoice.invoice_rows = aggregated
    invoice.deductions = fin.get("total_deduction", 0.0)
    invoice.deduction_detail = NormalizedDeductions(total=invoice.deductions)

    row_subtotal = round(sum(r.amount for r in aggregated), 2)
    invoice.subtotal = fin.get("subtotal") or row_subtotal
    invoice.vat = fin.get("vat") or 0.0

    adjusted = max(0.0, invoice.subtotal - invoice.deductions)
    if invoice.vat <= 0:
        invoice.vat = round(adjusted * invoice.vat_rate, 4)

    invoice.net_total = fin.get("net_payable") or round(adjusted + invoice.vat, 2)
    invoice.gross_total = round(invoice.subtotal + invoice.vat, 2)

    invoice.confidence = 0.65 if aggregated else 0.2
    if aggregated:
        invoice.warnings.append("extraction_source:ocr_fallback")

    logger.info(
        "ocr_extract complete rows=%d subtotal=%.2f confidence=%.2f",
        len(aggregated), invoice.subtotal, invoice.confidence,
    )
    return invoice


def _aggregate_rows(rows: List[NormalizedInvoiceRow]) -> List[NormalizedInvoiceRow]:
    """Merge duplicate trade rows (same trade + project)."""
    merged: Dict[Tuple[str, str], NormalizedInvoiceRow] = {}
    for row in rows:
        key = (row.description, row.project)
        if key not in merged:
            merged[key] = NormalizedInvoiceRow(
                description=row.description,
                quantity=row.quantity,
                rate=row.rate,
                amount=row.amount,
                project=row.project,
            )
        else:
            cur = merged[key]
            cur.quantity = round(cur.quantity + row.quantity, 2)
            cur.amount = round(cur.amount + row.amount, 2)
            if cur.rate <= 0 and row.rate > 0:
                cur.rate = row.rate
    return list(merged.values())


from typing import Tuple