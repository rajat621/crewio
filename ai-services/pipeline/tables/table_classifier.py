"""Semantic table classification for multi-table UAE timesheet documents."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import re
from typing import Any, Dict, List, Sequence, Tuple


class TableType(str, Enum):
    ATTENDANCE_TABLE = "attendance_table"
    FINANCIAL_SUMMARY_TABLE = "financial_summary_table"
    DEDUCTION_SUMMARY_TABLE = "deduction_summary_table"
    TOTALS_FOOTER_TABLE = "totals_footer_table"
    PROJECT_SUMMARY_TABLE = "project_summary_table"
    OVERTIME_TABLE = "overtime_table"
    METADATA_TABLE = "metadata_table"
    UNKNOWN_TABLE = "unknown_table"


_FINANCIAL_KEYS = (
    "total",
    "final total",
    "vat",
    "vat amount",
    "deduction",
    "deduction aed",
    "absent amount",
    "net payable",
    "amount aed",
    "amount payable",
    "net amount payable",
    "total deduction",
    "gross total",
    "subtotal",
)
_METADATA_KEYS = (
    "invoice no",
    "invoice date",
    "period",
    "trn",
    "client",
    "prepared",
    "timesheet",
)
_ATTENDANCE_KEYS = ("w", "a", "h", "off", "id", "trade", "employee")
_PROJECT_KEYS = ("project", "projectno", "project no", "subtotal", "trade")
_OVERTIME_KEYS = ("ot", "o/t", "overtime")


@dataclass
class TableClassification:
    table_type: TableType
    confidence: float
    signals: Dict[str, float]


def _flatten_tokens(table: Sequence[Sequence[str]]) -> List[str]:
    tokens: List[str] = []
    for row in table:
        for cell in row:
            val = " ".join(str(cell or "").split()).strip()
            if val:
                tokens.append(val)
    return tokens


def _normalize_cell(value: object) -> str:
    lowered = str(value or "").lower()
    cleaned = re.sub(r"[^a-z0-9\s]", " ", lowered)
    return " ".join(cleaned.split()).strip()


def classify_table(table: Sequence[Sequence[str]]) -> TableClassification:
    tokens = _flatten_tokens(table)
    joined = " ".join(tokens).lower()

    total_tokens = max(len(tokens), 1)
    numeric_tokens = sum(1 for t in tokens if re.search(r"\d", t))
    numeric_density = numeric_tokens / total_tokens

    attendance_marker_count = sum(1 for t in tokens if t.strip().upper() in {"W", "A", "H", "OFF"})
    date_like_count = len(re.findall(r"\b(?:[1-9]|[12][0-9]|3[01])\b", joined))

    financial_hits = sum(1 for k in _FINANCIAL_KEYS if k in joined)
    metadata_hits = sum(1 for k in _METADATA_KEYS if k in joined)
    attendance_hits = sum(1 for k in _ATTENDANCE_KEYS if re.search(rf"\b{re.escape(k)}\b", joined))
    project_hits = sum(1 for k in _PROJECT_KEYS if k in joined)
    overtime_hits = sum(1 for k in _OVERTIME_KEYS if re.search(rf"\b{re.escape(k)}\b", joined))

    deduction_hits = sum(1 for k in ("deduction", "total deduction", "absent amount", "deduction aed", "penalty", "advance", "loan", "gas") if k in joined)
    totals_footer_hits = sum(1 for k in ("subtotal", "vat", "net payable", "amount payable", "final total", "gross total") if k in joined)

    normalized_rows = [[_normalize_cell(c) for c in row] for row in table]
    headerish_rows = normalized_rows[:8]
    has_trade_header = any(any(c in {"trade", "designation", "worker trade", "labor category", "labour category"} for c in row) for row in headerish_rows)
    has_hours_header = any(any(c in {"hour", "hours", "no of hours", "total hours", "qty", "quantity"} for c in row) for row in headerish_rows)
    has_rate_header = any(any(c in {"rate", "unit price", "unitprice", "price", "net rate", "daily rate", "hourly rate"} for c in row) for row in headerish_rows)
    has_amount_header = any(any(c in {"amount", "total amount", "amount aed", "value", "total aed", "line total"} for c in row) for row in headerish_rows)
    has_project_header = any(any(c in {"project", "project id", "project no", "project code", "projectno"} for c in row) for row in headerish_rows)
    has_employee_header = any(any(c in {"employee", "employee name", "worker name", "id no", "i d no"} for c in row) for row in headerish_rows)

    scores: Dict[TableType, float] = {
        TableType.ATTENDANCE_TABLE: float(attendance_hits * 1.8 + attendance_marker_count * 0.5 + date_like_count * 0.1),
        TableType.FINANCIAL_SUMMARY_TABLE: float(financial_hits * 2.0 + numeric_density * 2.5),
        TableType.DEDUCTION_SUMMARY_TABLE: float(deduction_hits * 2.0 + numeric_density * 1.0),
        TableType.TOTALS_FOOTER_TABLE: float(totals_footer_hits * 1.8 + numeric_density * 1.5),
        TableType.PROJECT_SUMMARY_TABLE: float(project_hits * 1.7 + numeric_density * 1.2),
        TableType.OVERTIME_TABLE: float(overtime_hits * 2.2 + date_like_count * 0.05),
        TableType.METADATA_TABLE: float(metadata_hits * 2.0 + (1.0 - min(1.0, numeric_density))),
        TableType.UNKNOWN_TABLE: 0.0,
    }

    if has_trade_header and (has_amount_header or (has_hours_header and has_rate_header)):
        scores[TableType.PROJECT_SUMMARY_TABLE] += 5.0
        scores[TableType.FINANCIAL_SUMMARY_TABLE] -= 2.0
    if has_trade_header and has_employee_header:
        scores[TableType.ATTENDANCE_TABLE] += 4.0
    if has_project_header and has_trade_header:
        scores[TableType.PROJECT_SUMMARY_TABLE] += 3.0
    if not has_trade_header and totals_footer_hits:
        scores[TableType.FINANCIAL_SUMMARY_TABLE] += 2.0

    # Strong financial indicators should dominate mixed footer tables.
    if not has_trade_header and ("total deduction" in joined or "net payable" in joined or "absent amount" in joined):
        scores[TableType.FINANCIAL_SUMMARY_TABLE] += 4.0
        scores[TableType.DEDUCTION_SUMMARY_TABLE] += 2.0
        scores[TableType.TOTALS_FOOTER_TABLE] += 2.0

    best_type = max(scores, key=scores.get)
    best_score = scores[best_type]
    total_score = sum(max(v, 0.0) for v in scores.values()) or 1.0
    confidence = min(0.99, max(0.30, best_score / total_score + 0.35)) if best_type != TableType.UNKNOWN_TABLE else 0.30

    signals: Dict[str, float] = {
        "financial_hits": float(financial_hits),
        "deduction_hits": float(deduction_hits),
        "totals_footer_hits": float(totals_footer_hits),
        "metadata_hits": float(metadata_hits),
        "attendance_hits": float(attendance_hits),
        "project_hits": float(project_hits),
        "overtime_hits": float(overtime_hits),
        "attendance_marker_count": float(attendance_marker_count),
        "date_like_count": float(date_like_count),
        "numeric_density": float(round(numeric_density, 4)),
    }

    if has_trade_header and (has_amount_header or (has_hours_header and has_rate_header)):
        return TableClassification(table_type=TableType.PROJECT_SUMMARY_TABLE, confidence=0.88, signals=signals)

    if best_score < 2.0:
        return TableClassification(table_type=TableType.UNKNOWN_TABLE, confidence=0.30, signals=signals)

    return TableClassification(table_type=best_type, confidence=confidence, signals=signals)
