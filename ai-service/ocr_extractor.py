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
from PIL import Image

from orientation import correct_pages
from trade_normalizer import build_trade_canonicalizer

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
_MONTH_RE = re.compile(
    r"\b(january|february|march|april|may|june|july|august|september|october|november|december)\b",
    re.I,
)
_HEADER_LINE_RE = re.compile(
    r"(timesheet|prepared|print date|issued to|employee name|emp name|id\.no|s#|page)",
    re.I,
)
_SUMMARY_LINE_RE = re.compile(r"\b(total|summary|workers?|hrs?|hours?)\b", re.I)
_ATTENDANCE_SIGNATURE_RE = re.compile(r"\b(present|absent|attendance|overtime|ot|days\s*worked)\b", re.I)
_FINANCIAL_LINE_RE = re.compile(
    r"\b(vat|subtotal|sub total|gross total|net total|net payable|amount payable|total amount|deduction|advance|penalty|accommodation|transport|food|mess|gas|loan)\b",
    re.I,
)
_EMPLOYEE_ID_RE = re.compile(r"^(?:[A-Z]{1,4}\d{3,12}|\d{4,12}|[A-Z]{2,}\d{2,})$", re.I)
_PROJECT_CODE_RE = re.compile(r"^(?:[A-Z]{2,8}|P\d{2,8}[A-Z0-9]*)$", re.I)

_DEDUCTION_KEY_MAP = {
    "advance": "advance",
    "advance deduction": "advance",
    "penalty": "penalty",
    "accommodation": "accommodation",
    "transport": "transport",
    "food": "food",
    "mess": "mess",
    "gas": "gas",
    "loan": "loan",
    "other deduction": "other",
    "deduction": "other",
}
_SUBTOTAL_KEYS = ("subtotal", "sub total", "gross total", "total amount")
_NET_KEYS = ("net payable", "net amount payable", "net total", "net amount", "amount payable")
_VAT_KEYS = ("vat", "vat amount")
_MONTH_NAMES = {
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
}


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


def _normalize_text(text: str) -> str:
    return " ".join(str(text or "").strip().split())


def _token_text(token: Dict[str, Any]) -> str:
    return str(token.get("text") or "").strip()


def _token_is_numeric(token: Dict[str, Any]) -> bool:
    text = _token_text(token)
    return bool(text and _AMOUNT_RE.fullmatch(text.replace(",", "")))


def _token_is_day_marker(token: Dict[str, Any]) -> bool:
    text = _token_text(token).lower()
    return text in {"p", "a", "h", "w", "o", "off", "m", "l", "s"}


def _token_is_month(token: Dict[str, Any]) -> bool:
    return _token_text(token).lower() in _MONTH_NAMES


def _token_is_employee_code(token: Dict[str, Any]) -> bool:
    text = _token_text(token)
    if not text or text.lower() in _MONTH_NAMES:
        return False
    if len(text) > 14:
        return False
    return bool(_EMPLOYEE_ID_RE.fullmatch(text)) and any(ch.isdigit() for ch in text)


def _token_is_project_code(token: Dict[str, Any]) -> bool:
    text = _token_text(token)
    if not text or text.lower() in _MONTH_NAMES:
        return False
    if len(text) > 8:
        return False
    if text.isalpha() and text != text.upper():
        return False
    return bool(_PROJECT_CODE_RE.fullmatch(text))


def _line_tokens_text(tokens: Sequence[Dict[str, Any]]) -> str:
    return _normalize_text(" ".join(_token_text(t) for t in tokens if _token_text(t)))


def _classify_line(tokens: Sequence[Dict[str, Any]]) -> str:
    text = _line_tokens_text(tokens)
    if not text:
        return "empty"
    lower = text.lower()
    if _HEADER_LINE_RE.search(lower):
        return "header"
    if _FINANCIAL_LINE_RE.search(lower):
        return "financial"
    if _SUMMARY_LINE_RE.search(lower) and not any(_token_is_employee_code(t) for t in tokens):
        return "summary"
    if any(_token_is_employee_code(t) for t in tokens):
        return "employee"
    return "other"


def _split_alpha_tail(tokens: Sequence[Dict[str, Any]], end_index: int) -> str:
    tail: List[str] = []
    idx = end_index
    while idx >= 0:
        text = _token_text(tokens[idx])
        if not text:
            idx -= 1
            continue
        if _token_is_numeric(tokens[idx]) or _token_is_month(tokens[idx]):
            break
        if text.isalpha() or re.fullmatch(r"[A-Za-z][A-Za-z\-']*", text):
            tail.append(text)
        elif tail:
            break
        idx -= 1
    if not tail:
        return ""
    return " ".join(reversed(tail[:3]))


def _token_index_after_phrase(tokens: Sequence[Dict[str, Any]], phrase: str) -> int:
    """Return the index immediately after the first occurrence of phrase."""
    phrase = _normalize_text(phrase).lower()
    if not phrase:
        return -1

    pieces: List[Tuple[int, int, int]] = []
    cursor = 0
    parts: List[str] = []
    for index, token in enumerate(tokens):
        text = _token_text(token)
        if not text:
            continue
        if parts:
            cursor += 1
        start = cursor
        cursor += len(text)
        parts.append(text)
        pieces.append((start, cursor, index))

    haystack = _normalize_text(" ".join(parts)).lower()
    match = haystack.find(phrase)
    if match < 0:
        return -1
    end = match + len(phrase)
    for start, stop, index in pieces:
        if stop > end:
            return index
    return len(tokens)


def _choose_row_numbers(numbers: List[float]) -> Tuple[float, float, float]:
    cleaned = [n for n in numbers if n > 0]
    if not cleaned:
        return 0.0, 0.0, 0.0

    best: Optional[Tuple[float, float, float]] = None
    best_score = float("inf")

    from itertools import permutations

    candidates = cleaned[:4] if len(cleaned) > 3 else cleaned
    if len(candidates) >= 3:
        for a, b, c in permutations(candidates, 3):
            if a <= 0 or b <= 0 or c <= 0:
                continue
            if a > 400 or b > 1000 or c > 1_000_000:
                continue
            expected = a * b
            ratio = abs(c - expected) / max(expected, 1.0)
            score = ratio
            if c < expected * 0.4 or c > expected * 2.5:
                score += 1.0
            if score < best_score:
                best_score = score
                best = (a, b, c)

    if best is None:
        if len(cleaned) >= 3:
            return cleaned[0], cleaned[1], cleaned[2]
        if len(cleaned) == 2:
            return cleaned[0], cleaned[1], round(cleaned[0] * cleaned[1], 2)
        return cleaned[0], 0.0, 0.0

    return best


def _find_numeric_block(tokens: Sequence[Dict[str, Any]], start_index: int) -> List[float]:
    block: List[float] = []
    for token in tokens[start_index:]:
        if _token_is_month(token):
            break
        text = _token_text(token)
        if not text:
            continue
        if _token_is_numeric(token):
            block.append(_to_float(text))
            continue
        if _token_is_day_marker(token):
            continue
        if block and text.isalpha() and len(block) >= 2:
            break
    return block


def _extract_deductions_from_text(text: str, deductions: Dict[str, float]) -> None:
    normalized = _normalize_text(text)
    lower = normalized.lower()
    compact = re.sub(r"[^a-z0-9]+", "", lower)
    amounts = [_to_float(match) for match in _AMOUNT_RE.findall(normalized)]
    amount = next((value for value in reversed(amounts) if value > 0), 0.0)
    if amount <= 0:
        return

    if "totaldeduction" in compact:
        deductions.setdefault("total", amount)
        return

    label_category = None
    label_checks = (
        ("advance deduction", "advance"),
        ("other deduction", "other"),
        ("absent penalty", "absent"),
        ("safety items", "other"),
        ("safety", "other"),
        ("accommodation", "accommodation"),
        ("transport", "transport"),
        ("food", "food"),
        ("mess", "mess"),
        ("gas", "gas"),
        ("loan", "loan"),
        ("advance", "advance"),
        ("penalty", "penalty"),
        ("absent", "absent"),
    )
    for label, category in label_checks:
        if label.replace(" ", "") in compact or label in lower:
            label_category = category
            break

    if label_category is None:
        if any(key.replace(" ", "") in compact for key in _VAT_KEYS):
            deductions.setdefault("vat", amount)
            return
        if any(key.replace(" ", "") in compact for key in _SUBTOTAL_KEYS):
            deductions.setdefault("subtotal", amount)
            return
        if any(key.replace(" ", "") in compact for key in _NET_KEYS):
            deductions.setdefault("net_payable", amount)
            return
        if "vat" in lower:
            deductions.setdefault("vat", amount)
            return
        if "deduction" not in lower:
            return
        label_category = "other"

    deductions[label_category] = deductions.get(label_category, 0.0) + amount


def _extract_financials_from_lines(
    lines: List[List[Dict[str, Any]]],
) -> Tuple[Dict[str, float], Dict[str, float]]:
    """Extract totals and deduction breakdown from OCR lines."""
    fin: Dict[str, float] = {}
    breakdown: Dict[str, float] = {}
    for line in lines:
        text = _line_text(line)
        if not text:
            continue
        lower = text.lower()
        _extract_deductions_from_text(text, breakdown)

        amounts = [_to_float(m) for m in _AMOUNT_RE.findall(text) if _to_float(m) > 0]
        if not amounts:
            continue
        last = amounts[-1]

        if any(k in lower for k in _SUBTOTAL_KEYS) and "subtotal" not in fin:
            fin["subtotal"] = last
        elif any(k in lower for k in _NET_KEYS) and "net_payable" not in fin:
            fin["net_payable"] = last
        elif any(k in lower for k in _VAT_KEYS) and "vat" not in fin:
            fin["vat"] = last

    if "total" not in breakdown:
        breakdown_total = 0.0
        for key, value in breakdown.items():
            if key not in {"vat", "subtotal", "net_payable"}:
                breakdown_total += value
        breakdown["total"] = round(breakdown_total, 2)
    return fin, breakdown


def _render_pages(pdf_path: str, dpi: int = 250) -> List[Any]:
    """Render PDF pages using pdf2image."""
    try:
        from pdf2image import convert_from_path
        import numpy as np
        import cv2

        max_pages = max(1, int(os.getenv("OCR_MAX_PAGES", "8")))
        max_side = max(1200, int(os.getenv("OCR_MAX_IMAGE_SIDE", "2400")))

        pages = convert_from_path(pdf_path, dpi=dpi, first_page=1, last_page=max_pages)
        pages = correct_pages(pages)

        result = []
        for p in pages:
            p = p.convert("RGB")
            w, h = p.size
            scale = min(max_side / max(w, 1), max_side / max(h, 1), 1.0)
            if scale < 1.0:
                p = p.resize((int(w * scale), int(h * scale)))
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


def _row_bbox(line: Sequence[Dict[str, Any]]) -> Tuple[int, int, int, int]:
    xs = [int(t.get("x", 0)) for t in line if t.get("text")]
    ys = [int(t.get("y", 0)) for t in line if t.get("text")]
    x2s = [int(t.get("x", 0)) + int(t.get("w", 0)) for t in line if t.get("text")]
    y2s = [int(t.get("y", 0)) + int(t.get("h", 0)) for t in line if t.get("text")]
    if not xs or not ys:
        return 0, 0, 0, 0
    return min(xs), min(ys), max(x2s), max(y2s)


def _row_center_ratio(line: Sequence[Dict[str, Any]], page_height: int) -> float:
    if page_height <= 0:
        return 0.0
    _, top, _, bottom = _row_bbox(line)
    return ((top + bottom) / 2.0) / float(page_height)


def _row_has_keywords(line: Sequence[Dict[str, Any]], keywords: Sequence[str]) -> bool:
    text = _line_text(list(line)).lower()
    return any(keyword.lower() in text for keyword in keywords)


def _row_has_financial_terms(line: Sequence[Dict[str, Any]]) -> bool:
    text = _line_text(list(line)).lower().replace(" ", "")
    return any(
        term in text
        for term in (
            "subtotal",
            "grosstotal",
            "nettotal",
            "netamount",
            "netpayable",
            "amountpayable",
            "totaldeduction",
            "deduction",
            "deductions",
            "vat",
            "totalamount",
            "total",
        )
    )


def _sort_tokens_by_x(line: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted([token for token in line if _token_text(token)], key=lambda token: (int(token.get("x", 0)), int(token.get("y", 0))))


def _extract_billing_summary_columns(line: Sequence[Dict[str, Any]]) -> Tuple[str, float, float, float]:
    """Return (trade, hours, rate, amount) using OCR geometry only."""
    sorted_tokens = _sort_tokens_by_x(line)
    if not sorted_tokens:
        return "", 0.0, 0.0, 0.0

    numeric_tokens = [token for token in sorted_tokens if _token_is_numeric(token)]
    if len(numeric_tokens) < 2:
        return "", 0.0, 0.0, 0.0

    first_numeric_x = int(numeric_tokens[0].get("x", 0))
    trade_tokens = [token for token in sorted_tokens if int(token.get("x", 0)) < first_numeric_x and not _token_is_numeric(token)]
    trade_raw = _line_tokens_text(trade_tokens) or _line_tokens_text(sorted_tokens[: max(1, len(sorted_tokens) - len(numeric_tokens))])

    hours = _to_float(_token_text(numeric_tokens[0]))
    rate = _to_float(_token_text(numeric_tokens[1])) if len(numeric_tokens) > 1 else 0.0
    if len(numeric_tokens) > 2:
        amount_text = "".join(_token_text(token) for token in numeric_tokens[2:])
        amount = _to_float(amount_text)
    else:
        amount = round(hours * rate, 2)
    return trade_raw, hours, rate, amount


def _parse_labour_lines(
    lines: List[List[Dict[str, Any]]],
) -> List[NormalizedInvoiceRow]:
    """
    Extract employee-level labour rows from OCR lines using token order,
    line classification, and numeric consistency checks.
    """
    rows: List[NormalizedInvoiceRow] = []
    canon = build_trade_canonicalizer()

    for line in lines:
        text = _line_text(line)
        if not text or len(text) < 5:
            continue
        if _classify_line(line) in {"header", "financial"}:
            continue

        if _SUMMARY_LINE_RE.search(text) and not any(_token_is_employee_code(t) for t in line):
            continue

        numeric_tokens = [token for token in line if _token_is_numeric(token)]
        if len(numeric_tokens) < 2:
            continue

        first_numeric_idx = next((idx for idx, token in enumerate(line) if _token_is_numeric(token)), -1)
        if first_numeric_idx < 0:
            continue

        prelude = line[:first_numeric_idx]
        trade_match = _TRADE_RE.search(text)
        trade_raw = trade_match.group(0) if trade_match else _split_alpha_tail(prelude, len(prelude) - 1)
        trade = canon(trade_raw)
        if not trade:
            continue

        if _SUMMARY_LINE_RE.search(text) and trade and not trade_match:
            continue

        trade_end_idx = _token_index_after_phrase(line, trade_raw)
        if trade_end_idx < 0:
            trade_end_idx = first_numeric_idx

        row_numbers = _find_numeric_block(line, trade_end_idx)
        if not row_numbers:
            continue

        if len(row_numbers) >= 6:
            trailing_numbers = [number for number in row_numbers if number > 0][-3:]
            if len(trailing_numbers) == 3:
                trailing_hours, trailing_rate, trailing_amount = trailing_numbers
                if trailing_amount >= 100 and trailing_amount >= trailing_hours and trailing_amount >= trailing_rate:
                    row_numbers = trailing_numbers

        hours, rate, amount = _choose_row_numbers(row_numbers)
        if hours <= 0 or amount <= 0:
            continue

        if rate > 1000 or hours > 400 or amount > 1_000_000:
            continue

        expected = round(hours * rate, 2) if rate > 0 else 0.0
        if rate > 0 and expected > 0:
            ratio = amount / max(expected, 1.0)
            if ratio < 0.35 or ratio > 2.8:
                continue

        project = ""
        employee_id = ""
        code_tokens = [token for token in prelude if _token_is_employee_code(token) or _token_is_project_code(token)]
        if code_tokens:
            employee_candidate = _token_text(code_tokens[0])
            if _token_is_employee_code(code_tokens[0]):
                employee_id = employee_candidate
                project_candidate = next((
                    _token_text(token)
                    for token in prelude[1:]
                    if _token_is_project_code(token) and _token_text(token) != employee_candidate
                ), "")
                project = project_candidate or project
            elif _token_is_project_code(code_tokens[0]):
                project = _token_text(code_tokens[0])

        if not project:
            proj_match = _PROJECT_RE.search(text)
            if proj_match:
                project = proj_match.group(0)

        row = NormalizedInvoiceRow(
            description=trade,
            quantity=round(hours, 2),
            rate=round(rate, 4),
            amount=round(amount, 2),
            employee_id=employee_id,
            project=project,
            row_kind="employee",
        )

        violations = sanity_check_row(row)
        if violations:
            continue

        if not row.description or _FINANCIAL_LINE_RE.search(row.description):
            continue

        if row.amount <= 0 or row.quantity <= 0:
            continue

        row, repairs = repair_row(row)
        rows.append(row)

    return rows


def _parse_billing_summary_lines(
    lines: List[List[Dict[str, Any]]],
) -> List[NormalizedInvoiceRow]:
    """Parse billing summary rows before attendance rows when present."""
    rows: List[NormalizedInvoiceRow] = []
    canon = build_trade_canonicalizer()

    page_height = max(
        (int(t.get("y", 0)) + int(t.get("h", 0)) for line in lines for t in line if t.get("text")),
        default=0,
    )

    header_index = -1
    for index, line in enumerate(lines):
        if _row_has_keywords(line, ("trade", "hour", "hours", "rate", "amount", "deduction", "net amount")):
            header_index = index
            break

    for index, line in enumerate(lines):
        text = _line_text(line)
        if not text or len(text) < 4:
            continue
        if _classify_line(line) == "financial" and not _TRADE_RE.search(text):
            continue
        if any(_token_is_employee_code(token) for token in line):
            continue
        if _ATTENDANCE_SIGNATURE_RE.search(text):
            continue

        first_numeric_idx = next((idx for idx, token in enumerate(line) if _token_is_numeric(token)), -1)
        if first_numeric_idx < 0:
            continue

        prelude = [token for token in line[:first_numeric_idx] if _token_text(token)]
        if len(prelude) > 4:
            continue

        if sum(1 for token in line if _token_is_day_marker(token)) >= 12:
            continue

        if header_index >= 0 and index <= header_index:
            continue
        if header_index < 0 and _row_center_ratio(line, page_height) < 0.45:
            continue

        trade_raw, hours, rate, amount = _extract_billing_summary_columns(line)
        trade_match = _TRADE_RE.search(text)
        if trade_match and not trade_raw:
            trade_raw = trade_match.group(0)
        trade = canon(trade_raw)
        if not trade:
            continue

        if _row_has_financial_terms(line) and not trade_match:
            continue

        if hours <= 0 or amount <= 0:
            continue
        if rate > 1000 or amount > 1_000_000:
            continue

        expected = round(hours * rate, 2) if rate > 0 else 0.0
        if rate > 0 and expected > 0:
            ratio = amount / max(expected, 1.0)
            if ratio < 0.5 or ratio > 2.0:
                continue

        row = NormalizedInvoiceRow(
            description=trade,
            quantity=round(hours, 2),
            rate=round(rate, 4),
            amount=round(amount, 2),
            row_kind="billing_summary",
        )

        rows.append(row)

    return rows


def _parse_trade_summaries(
    lines: List[List[Dict[str, Any]]],
) -> List[NormalizedInvoiceRow]:
    """Extract trade-summary rows only when employee rows are absent."""
    rows: List[NormalizedInvoiceRow] = []
    canon = build_trade_canonicalizer()

    page_height = max(
        (int(t.get("y", 0)) + int(t.get("h", 0)) for line in lines for t in line if t.get("text")),
        default=0,
    )

    for line in lines:
        text = _line_text(line)
        if not text:
            continue
        lower = text.lower().replace(" ", "")
        if any(
            marker in lower
            for marker in (
                "preparedby",
                "approvedby",
                "checkedby",
                "executivename",
                "tradeemployeename",
                "issuedto",
                "printdate",
            )
        ):
            continue
        if _FINANCIAL_LINE_RE.search(text):
            continue

        numbers = [_to_float(t["text"]) for t in line if _token_is_numeric(t)]
        numbers = [n for n in numbers if n > 0]
        if len(numbers) < 3:
            continue

        trade_match = _TRADE_RE.search(text)
        trade_raw = trade_match.group(0) if trade_match else _split_alpha_tail(line, len(line) - 1)
        trade = canon(trade_raw)
        if not trade:
            continue

        compact_summary = len(numbers) == 3 and not any(_token_is_employee_code(token) for token in line)
        if not compact_summary and not _SUMMARY_LINE_RE.search(text):
            continue

        if compact_summary and _row_center_ratio(line, page_height) > 0.62:
            continue

        if compact_summary:
            if not trade_match:
                continue
            amount, rate, hours = numbers[0], numbers[1], numbers[2]
        else:
            hours = max(numbers)
            rate = numbers[1] if len(numbers) > 1 else 0.0
            amount = numbers[0] if len(numbers) > 2 else hours * rate

        if hours > (1000 if compact_summary else 400):
            continue

        row = NormalizedInvoiceRow(
            description=trade,
            quantity=round(hours, 2),
            rate=round(rate, 4),
            amount=round(amount, 2),
            row_kind="trade_summary",
        )
        if row.amount <= 0 or row.quantity <= 0:
            continue
        if compact_summary:
            rows.append(row)
            continue

        if not sanity_check_row(row):
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

    dpi = max(
        120,
        int(
            os.getenv(
                "OCR_RASTER_DPI",
                os.getenv("OCR_DPI", "250"),
            )
        ),
    )
    pages = _render_pages(pdf_path, dpi=dpi)
    if not pages:
        invoice.error = "OCR_NO_PAGES_RENDERED"
        return invoice

    all_rows: List[NormalizedInvoiceRow] = []
    billing_rows: List[NormalizedInvoiceRow] = []
    all_summary_rows: List[NormalizedInvoiceRow] = []
    all_lines: List[List[Dict[str, Any]]] = []

    for page_idx, page_img in enumerate(pages, 1):
        tokens = _run_ocr_on_image(page_img)
        if not tokens:
            invoice.warnings.append(f"ocr_page_{page_idx}:no_tokens")
            continue

        lines = _cluster_tokens_into_lines(tokens)
        all_lines.extend(lines)

        page_billing_rows = _parse_billing_summary_lines(lines)
        billing_rows.extend(page_billing_rows)

        page_rows = _parse_labour_lines(lines)
        all_rows.extend(page_rows)

        page_trade_rows = _parse_trade_summaries(lines)
        all_summary_rows.extend(page_trade_rows)
        logger.info(
            "ocr_extract page=%d tokens=%d billing_rows=%d employee_rows=%d",
            page_idx,
            len(tokens),
            len(page_billing_rows),
            len(page_rows),
        )

    fin, deduction_breakdown = _extract_financials_from_lines(all_lines)

    aggregated = _select_priority_rows(billing_rows, all_summary_rows, all_rows)

    invoice.invoice_rows = aggregated
    invoice.deductions = deduction_breakdown.get("total", 0.0)
    invoice.deduction_detail = NormalizedDeductions(
        mess=deduction_breakdown.get("mess", 0.0),
        gas=deduction_breakdown.get("gas", 0.0),
        transport=deduction_breakdown.get("transport", 0.0),
        advance=deduction_breakdown.get("advance", 0.0),
        absent=deduction_breakdown.get("absent", 0.0),
        other=deduction_breakdown.get("other", 0.0),
        total=invoice.deductions,
        breakdown=deduction_breakdown,
    )

    row_subtotal = round(sum(r.amount for r in aggregated), 2)
    invoice.subtotal = fin.get("subtotal") or row_subtotal
    invoice.vat = fin.get("vat") or 0.0

    adjusted = max(0.0, invoice.subtotal - invoice.deductions)

    invoice.net_total = fin.get("net_payable") or round(adjusted + invoice.vat, 2)
    invoice.gross_total = round(invoice.subtotal + invoice.vat, 2)

    invoice.confidence = 0.82 if billing_rows else (0.72 if aggregated else 0.2)
    if all_summary_rows and not all_rows:
        invoice.confidence = min(invoice.confidence, 0.55)
    if aggregated:
        invoice.warnings.append("extraction_source:ocr_fallback")

    logger.info(
        "ocr_extract complete rows=%d subtotal=%.2f confidence=%.2f",
        len(aggregated), invoice.subtotal, invoice.confidence,
    )
    return invoice


def _select_priority_rows(
    billing_rows: List[NormalizedInvoiceRow],
    trade_rows: List[NormalizedInvoiceRow],
    employee_rows: List[NormalizedInvoiceRow],
) -> List[NormalizedInvoiceRow]:
    if billing_rows:
        return _aggregate_rows(billing_rows)
    if trade_rows:
        return _aggregate_rows(trade_rows)
    return _aggregate_rows(employee_rows)


def _aggregate_rows(rows: List[NormalizedInvoiceRow]) -> List[NormalizedInvoiceRow]:
    """Merge duplicate rows without mixing source kinds."""
    merged: Dict[Tuple[str, str, str, float], NormalizedInvoiceRow] = {}
    for row in rows:
        key = (row.row_kind or "employee", row.description, row.project, round(float(row.rate or 0.0), 4))
        if key not in merged:
            merged[key] = NormalizedInvoiceRow(
                description=row.description,
                quantity=row.quantity,
                rate=row.rate,
                amount=row.amount,
                project=row.project,
                employee_id=row.employee_id,
                employee_name=row.employee_name,
                row_kind=row.row_kind,
            )
        else:
            cur = merged[key]
            cur.quantity = round(cur.quantity + row.quantity, 2)
            cur.amount = round(cur.amount + row.amount, 2)
            if cur.rate <= 0 and row.rate > 0:
                cur.rate = row.rate
    return list(merged.values())

