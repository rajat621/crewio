<<<<<<< HEAD
﻿"""Robust deduction parsing across mixed UAE timesheet formats."""
=======
"""Robust deduction parsing across mixed UAE timesheet formats."""
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from schema import InvoiceRow


# Multi-format deduction keywords requested by business rules.
_DEDUCTION_KEYWORDS: Tuple[str, ...] = (
    "total absent amount",
    "absent amount",
    "absent deduction",
    "total deduction",
    "food deduction",
    "transport deduction",
    "deduction",
    "penalty",
    "advance",
    "loan",
    "gas",
)

_TOTAL_PRIORITY_KEYWORDS: Tuple[str, ...] = (
    "total deduction",
    "total absent amount",
)

# Ignore footer/totals that are not deduction labels.
_EXCLUDE_PHRASES: Tuple[str, ...] = (
    "subtotal",
    "gross total",
    "net amount",
    "vat amount",
    "invoice no",
    "invoice date",
    "trn",
)

_AMOUNT_RE = re.compile(r"(?<![\d.])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?")
_DAY_TOKEN_RE = re.compile(r"\b(?:[1-9]|[12][0-9]|3[01])\b")


@dataclass
class DeductionParseResult:
    total_deduction: float
    source: str
    matched_line: Optional[str] = None
    breakdown: Dict[str, float] = field(default_factory=dict)


def _to_float(value: str) -> float:
    cleaned = value.replace(",", "").strip()
    try:
        return float(cleaned)
    except Exception:
        return 0.0


def _normalize(text: str) -> str:
    return " ".join((text or "").split()).strip().lower()


def _extract_amounts(text: str) -> List[float]:
    amounts: List[float] = []
    for token in _AMOUNT_RE.findall(text or ""):
        amount = _to_float(token)
        if amount >= 0.0:
            amounts.append(amount)
    return amounts


def _contains_keyword(norm_line: str) -> bool:
    return any(k in norm_line for k in _DEDUCTION_KEYWORDS)


def _is_excluded_line(norm_line: str) -> bool:
    return any(k in norm_line for k in _EXCLUDE_PHRASES)


def _line_score(norm_line: str) -> int:
    score = 0
    if any(k in norm_line for k in _TOTAL_PRIORITY_KEYWORDS):
        score += 100
    if "absent amount" in norm_line:
        score += 60
    if "deduction" in norm_line:
        score += 50
    if any(k in norm_line for k in ("penalty", "advance", "loan", "food deduction", "transport deduction", "gas")):
        score += 30
    return score


def _parse_from_text(full_text: str) -> Tuple[float, Optional[str], Dict[str, float]]:
    lines = [" ".join(line.split()) for line in (full_text or "").splitlines() if line and line.strip()]
    total_candidates: List[Tuple[int, float, str]] = []
    component_breakdown: Dict[str, float] = {}

    for line in lines:
        norm = _normalize(line)
        if not norm or _is_excluded_line(norm):
            continue
        if not _contains_keyword(norm):
            continue

        amounts = _extract_amounts(line)
        if not amounts:
            continue

        amount = amounts[-1]
        if amount <= 0.0:
            continue

        score = _line_score(norm)
        if score <= 0:
            continue

        if any(k in norm for k in _TOTAL_PRIORITY_KEYWORDS):
            total_candidates.append((score, amount, line))
            continue

        label = next((k for k in _DEDUCTION_KEYWORDS if k in norm), "deduction")
        component_breakdown[label] = max(component_breakdown.get(label, 0.0), amount)

    if total_candidates:
        total_candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
        best = total_candidates[0]
        return round(best[1], 3), best[2], component_breakdown

    if component_breakdown:
        summed = round(sum(component_breakdown.values()), 3)
        return summed, None, component_breakdown

    # Semantic regex fallback for noisy OCR text in one line.
    compact = " ".join((full_text or "").split())
    regex_patterns = (
        r"total\s+deduction\s*(?:aed)?\s*[:\-]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)",
        r"total\s+absent\s+amount\s*(?:aed)?\s*[:\-]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)",
        r"absent\s+amount\s*(?:aed)?\s*[:\-]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)",
    )
    for pattern in regex_patterns:
        match = re.search(pattern, compact, re.IGNORECASE)
        if match:
            amount = _to_float(match.group(1))
            if amount > 0.0:
                return round(amount, 3), match.group(0), component_breakdown

    return 0.0, None, component_breakdown


def _is_suspicious_ocr_absent_total(amount: float, matched_line: Optional[str], full_text: str) -> bool:
    """Reject likely OCR false-positives where day numbers leak into deduction totals."""
    if amount <= 0.0:
        return False

    line = _normalize(matched_line or "")
    if "deduction" not in line and "absent amount" not in line and "absent" not in line:
        return False

    if amount > 31.0:
        return False

    # Attendance-heavy text usually contains many day-of-month tokens from grids.
    day_token_count = len(_DAY_TOKEN_RE.findall(full_text or ""))
    if day_token_count < 20:
        return False

    # Most leaked false values are integer-like day numbers represented as x.00.
    return abs(amount - round(amount)) < 0.001


def extract_deduction_total(
    rows: Sequence[InvoiceRow],
    existing_total: float,
    full_text: str,
    used_ocr: bool,
    has_summary_table: bool = False,
    existing_breakdown: Optional[Dict[str, float]] = None,
) -> DeductionParseResult:
    """Resolve final total deduction using table rows, footer values, and text/OCR fallback."""
    breakdown: Dict[str, float] = dict(existing_breakdown or {})

    known_total = round(float(existing_total or 0.0), 3)

    # Priority rule: when a financial summary/footer table is detected,
    # its deduction value is authoritative and must not be overridden by OCR fallback.
    if has_summary_table:
        return DeductionParseResult(
            total_deduction=max(0.0, known_total),
            source="financial_summary" if known_total > 0.0 else "financial_summary_zero",
            matched_line="financial summary table",
            breakdown=breakdown,
        )

    row_total = round(sum(float(getattr(r, "deduction_total", 0.0) or 0.0) for r in rows), 3)
    if row_total > 0.0:
        return DeductionParseResult(
            total_deduction=row_total,
            source="table",
            matched_line="row.deduction_total sum",
            breakdown=breakdown,
        )

    if known_total > 0.0:
        suspicious_line_hint = " ".join(breakdown.keys()) if breakdown else "total deduction"
        if used_ocr and _is_suspicious_ocr_absent_total(known_total, suspicious_line_hint, full_text):
            return DeductionParseResult(total_deduction=0.0, source="none", breakdown={})

        return DeductionParseResult(
            total_deduction=known_total,
            source="footer",
            matched_line="structured footer total",
            breakdown=breakdown,
        )

    parsed_total, matched_line, parsed_breakdown = _parse_from_text(full_text)

    if parsed_total > 0.0:
        if used_ocr and _is_suspicious_ocr_absent_total(parsed_total, matched_line, full_text):
            return DeductionParseResult(total_deduction=0.0, source="none", breakdown=breakdown)

        if parsed_breakdown:
            for label, amount in parsed_breakdown.items():
                breakdown[label] = max(breakdown.get(label, 0.0), amount)

        return DeductionParseResult(
            total_deduction=parsed_total,
            source="ocr_fallback" if used_ocr else "semantic_text",
            matched_line=matched_line,
            breakdown=breakdown,
        )

    return DeductionParseResult(total_deduction=0.0, source="none", breakdown=breakdown)
