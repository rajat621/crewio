<<<<<<< HEAD
﻿"""
=======
"""
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
pipeline/semantic_filter.py

Semantic row classification and strict filtering for OCR-extracted table rows.

Only VALID_LABOUR_ROW rows are allowed to proceed to invoice generation.
All other row types (headers, metadata, totals, signatures, etc.) are rejected.
"""

from __future__ import annotations

import re
from enum import Enum
from typing import List, Optional, Sequence, Tuple


class RowType(Enum):
    VALID_LABOUR_ROW = "VALID_LABOUR_ROW"
    HEADER_ROW = "HEADER_ROW"
    METADATA_ROW = "METADATA_ROW"
    ATTENDANCE_ROW = "ATTENDANCE_ROW"
    SUBTOTAL_ROW = "SUBTOTAL_ROW"
    TOTAL_ROW = "TOTAL_ROW"
    FINANCIAL_SUMMARY_ROW = "FINANCIAL_SUMMARY_ROW"
    FOOTER_ROW = "FOOTER_ROW"
    SIGNATURE_ROW = "SIGNATURE_ROW"
    EMPTY_ROW = "EMPTY_ROW"


# ---------------------------------------------------------------------------
# Reject patterns — any cell containing these strings is NEVER a labour row
# ---------------------------------------------------------------------------
_REJECT_SUBSTRINGS = (
    "TIMESHEET",
    "PREPARATION DATE",
    "PRINT DATE",
    "APPROVED BY",
    "CHECKED BY",
    "PREPARED BY",
    "TOTAL DEDUCTION",
    "NET AMOUNT",
    "VAT",
    "TRN",
    "INVOICE",
    "SUBTOTAL",
    "SUB TOTAL",
    "SUB-TOTAL",
    "GROSS TOTAL",
    "GRAND TOTAL",
    "NET PAYABLE",
    "PAGE",
    "AMOUNT",         # column headers containing only "AMOUNT"
    "S#",
    "NO.",
    "EMPLOYEE NAME",
    "EMPLOYEE NANIE",  # common OCR noise for "NAME"
    "DATE:",
    "MONTH",
    "H.I.NO",
    "I D. NO",
    "ID NO",
    "ID.NO",
    "NET RATE",
    "TOTAL ABSENT",
    "ABSENT AMOUNT",
    "SIGNATURE",
    "AUTHORISED",
    "AUTHORIZED",
    "THANK YOU",
)

_HEADER_INDICATORS = {
    "S#", "SR", "SL", "NO", "#", "SI", "S.NO",
    "TRADE", "DESCRIPTION", "EMPLOYEE", "NAME",
    "HOURS", "RATE", "AMOUNT", "TOTAL",
}

_METADATA_RE = re.compile(
    r"(timesheet|ts-\d{4,}|preparation\s*date|print\s*date|"
    r"invoice\s*no|period|for\s+the\s+month|"
    r"approved\s+by|checked\s+by|prepared\s+by|"
    r"sub[- ]?contractor|company|ref[:\s])",
    re.I,
)

_SIGNATURE_RE = re.compile(
    r"(signature|authoris|stamp|seal|manager|director|hr |human\s*res)",
    re.I,
)

_FINANCIAL_RE = re.compile(
    r"(total|sub.?total|grand|gross|net|vat|payable|deduction|amount)",
    re.I,
)

# ---------------------------------------------------------------------------
# Valid labour trade keywords — at least one token should match
# ---------------------------------------------------------------------------
_VALID_TRADES = re.compile(
    r"\b("
    r"mason|masonry|tile|tiler|carpenter|carpentry|"
    r"steel\s*fix|steelfixer|plumber|plumbing|"
    r"electrician|electric|painter|painting|"
    r"welder|welding|helper|helper|scaff|scaffold|"
    r"foreman|supervisor|operator|driver|"
    r"cleaner|cook|labour|laborer|labourer|worker|technician"
    r")\b",
    re.I,
)

_EMPLOYEE_ID_RE = re.compile(r"\b\d{6,8}\b")
_NUMERIC_RE = re.compile(r"^\d+(?:\.\d+)?$")


def _joined_upper(cells: Sequence[str]) -> str:
    return " ".join(c.upper() for c in cells if c)


def _non_empty(cells: Sequence[str]) -> List[str]:
    return [c for c in cells if c and c.strip()]


def _count_numeric(cells: Sequence[str]) -> int:
    count = 0
    for c in cells:
        val = c.strip()
        try:
            float(val.replace(",", ""))
            count += 1
        except ValueError:
            pass
    return count


# ---------------------------------------------------------------------------
# Attendance tokens — W / A / H / OFF / decimal hours
# ---------------------------------------------------------------------------
_ATT_CELL_RE = re.compile(r"^(W|A|H|OFF|\d{1,2}(?:\.\d{0,2})?)$", re.I)
_ATT_TOKEN_RE = re.compile(r"\b(W|A|H|OFF)\b", re.I)


def classify_row(cells: Sequence[str]) -> RowType:
    """
    Classify a single table row into a RowType.

    Args:
        cells: Normalized cell values from OCR.

    Returns:
        RowType enum value.
    """
    non_empty = _non_empty(cells)
    if not non_empty:
        return RowType.EMPTY_ROW

    joined = _joined_upper(cells)
    first = non_empty[0].upper().strip()

    # --- Hard reject on forbidden substrings ---
    for pattern in _REJECT_SUBSTRINGS:
        if pattern in joined:
            # "AMOUNT" alone in a single cell is a header — but "500.00 AMOUNT 300" is data
            if pattern == "AMOUNT" and len(non_empty) == 1:
                return RowType.HEADER_ROW
            if pattern not in ("AMOUNT",):
                return _classify_reject(joined, pattern)

    # --- Empty / all-whitespace ---
    if not joined.strip():
        return RowType.EMPTY_ROW

    # --- Signature / footer ---
    if _SIGNATURE_RE.search(joined):
        return RowType.SIGNATURE_ROW

    # --- Financial summary lines ---
<<<<<<< HEAD
    # Block on exact first-cell financial labels regardless of column count
    _FINANCIAL_EXACT = {
        "TOTAL", "SUBTOTAL", "SUB TOTAL", "NET TOTAL", "GRAND TOTAL",
        "GROSS TOTAL", "NET AMOUNT", "NET AMOUNT PAYABLE", "VAT",
        "DEDUCTION", "DEDUCTIONS", "TOTAL DEDUCTION", "BALANCE", "SUMMARY",
    }
    if first in _FINANCIAL_EXACT:
        return RowType.FINANCIAL_SUMMARY_ROW
=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    if _FINANCIAL_RE.search(first) and len(non_empty) <= 3:
        return RowType.FINANCIAL_SUMMARY_ROW

    # --- Header row: mostly label tokens, no numbers ---
    numeric_count = _count_numeric(non_empty)
    if numeric_count == 0 and len(non_empty) <= 8:
        # Could be header labels
        all_tokens = set(first.split())
        if all_tokens & _HEADER_INDICATORS:
            return RowType.HEADER_ROW

    # --- Attendance row: many cells that look like W/A/H/OFF/number ---
    att_cell_count = sum(1 for c in cells if _ATT_CELL_RE.match(c.strip()))
    att_token_count = len(_ATT_TOKEN_RE.findall(joined))
    if att_cell_count >= 8 or att_token_count >= 5:
        return RowType.ATTENDANCE_ROW

    # --- Metadata row: long text, no useful numeric data ---
    if _METADATA_RE.search(joined) and numeric_count < 2:
        return RowType.METADATA_ROW

    # ---------------------------------------------------------------------------
    # VALID_LABOUR_ROW requirements:
    #   - Has a recognised trade OR an employee ID
    #   - Has ≥2 numeric values (hours + rate or amount)
    #   - Not purely a column header
    # ---------------------------------------------------------------------------
    has_trade = bool(_VALID_TRADES.search(joined))
    has_emp_id = bool(_EMPLOYEE_ID_RE.search(joined))

    if (has_trade or has_emp_id) and numeric_count >= 2:
        return RowType.VALID_LABOUR_ROW

    # Relax: any row with ≥3 numeric values where first cell is a word (not all digits)
    if numeric_count >= 3 and first and not first.isdigit() and len(first) > 2:
        # Reject if first cell is a 7-digit employee ID with no trade text
        if not has_emp_id and not _FINANCIAL_RE.search(first):
            return RowType.VALID_LABOUR_ROW

    return RowType.METADATA_ROW


def _classify_reject(joined: str, matched_pattern: str) -> RowType:
    """Map the reject-matched pattern to the correct RowType."""
    p = matched_pattern.upper()
    if p in ("TIMESHEET", "PREPARATION DATE", "PRINT DATE", "DATE:", "MONTH"):
        return RowType.METADATA_ROW
    if p in ("APPROVED BY", "CHECKED BY", "PREPARED BY"):
        return RowType.SIGNATURE_ROW
    if p in ("TOTAL DEDUCTION", "NET AMOUNT", "SUBTOTAL", "SUB TOTAL", "GROSS TOTAL",
             "GRAND TOTAL", "NET PAYABLE", "VAT"):
        return RowType.FINANCIAL_SUMMARY_ROW
    if p in ("TOTAL",):
        return RowType.TOTAL_ROW
    if p in ("TRN", "INVOICE"):
        return RowType.METADATA_ROW
    if p in ("PAGE",):
        return RowType.FOOTER_ROW
    if p in ("S#", "NO.", "EMPLOYEE NAME", "EMPLOYEE NANIE", "TRADE", "AMOUNT",
             "H.I.NO", "I D. NO", "ID NO", "NET RATE"):
        return RowType.HEADER_ROW
    return RowType.METADATA_ROW


def filter_labour_rows(
    tables: Sequence[Sequence[Sequence[str]]],
) -> Tuple[List[List[str]], List[Tuple[RowType, List[str]]]]:
    """
    Filter all tables, returning only rows classified as VALID_LABOUR_ROW.

    Args:
        tables: List of tables, each table is a list of rows (list of cell strings).

    Returns:
        (valid_rows, rejected_rows)
        - valid_rows: rows that passed the filter
        - rejected_rows: list of (RowType, cells) for diagnostics
    """
    valid: List[List[str]] = []
    rejected: List[Tuple[RowType, List[str]]] = []

    for table in tables:
        for row in table:
            cells = [str(c or "").strip() for c in row]
            row_type = classify_row(cells)
            if row_type == RowType.VALID_LABOUR_ROW:
                valid.append(cells)
            else:
                rejected.append((row_type, cells))

    return valid, rejected
