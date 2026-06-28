<<<<<<< HEAD
﻿"""Route each detected table to specialized parsers and emit typed payloads."""

from __future__ import annotations

import logging
import re
from typing import Dict, List, Optional, Sequence, Tuple
=======
"""Route each detected table to specialized parsers and emit typed payloads."""

from __future__ import annotations

from typing import Dict, List, Sequence
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

from schema import InvoiceLayout, InvoiceRow

from pipeline.semantic_filter import classify_row, RowType
<<<<<<< HEAD
from pipeline.structured_logging import log_event
=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

from .financial_summary_parser import parse_financial_summary_table
from .table_classifier import TableType, classify_table
from .table_merger import ParsedTablePayload


<<<<<<< HEAD
logger = logging.getLogger(__name__)

_FINANCIAL_EXACT = {
    "TOTAL",
    "SUBTOTAL",
    "VAT",
    "NET PAYABLE",
    "NET AMOUNT",
    "TOTAL DEDUCTION",
    "DEDUCTION",
    "GRAND TOTAL",
    "SUMMARY",
    "BALANCE",
}

_TRADE_HINT_RE = re.compile(
    r"\b("
    r"mason|tile\s*mason|carpenter|steelfixer|steel\s*fixer|helper|"
    r"plumber|electrician|painter|welder|scaff|foreman|driver|operator|labou?r|technician"
    r")\b",
    re.I,
)

_PROJECT_RE = re.compile(r"\bP\d{3,8}[A-Z0-9]*\b", re.I)

_HEADER_ALIASES = {
    "trade": ("trade", "designation", "worker", "labor", "labour"),
    "rate": ("rate", "unit price", "unitprice", "price", "net rate"),
    "hours": ("hour", "hours", "no of hours", "total", "qty", "quantity"),
    "amount": ("amount", "total amount", "amount aed", "value", "total aed"),
    "project": ("project", "project id", "project no", "project code"),
    "employee": ("employee", "name", "id", "id no", "i. d. no", "employee name"),
}


=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
def _to_float(value: str) -> float:
    import re

    cleaned = re.sub(r"[^0-9.\-]", "", str(value or ""))
    if cleaned in {"", ".", "-"}:
        return 0.0
    try:
        return float(cleaned)
    except Exception:
        return 0.0


<<<<<<< HEAD
def _clean_cell(v: object) -> str:
    return " ".join(str(v or "").split()).strip()


def _find_column_mapping(table: Sequence[Sequence[str]]) -> Tuple[int, Dict[str, int]]:
    best_header = -1
    best_mapping: Dict[str, int] = {}
    best_score = -1

    for row_idx, row in enumerate(table[:8]):
        cells = [_clean_cell(c).upper() for c in row]
        mapping: Dict[str, int] = {}
        score = 0

        for idx, cell in enumerate(cells):
            if not cell:
                continue
            for key, aliases in _HEADER_ALIASES.items():
                if key in mapping:
                    continue
                if any(alias.upper() in cell for alias in aliases):
                    mapping[key] = idx
                    score += 1

        has_trade = "trade" in mapping
        has_value = ("amount" in mapping) or ("hours" in mapping and "rate" in mapping)
        if has_trade and has_value:
            score += 3

        if score > best_score:
            best_score = score
            best_header = row_idx
            best_mapping = mapping

    return best_header, best_mapping


def _is_financial_trade(text: str) -> bool:
    return (text or "").strip().upper() in _FINANCIAL_EXACT


def _parse_attendance_rows(
    table: Sequence[Sequence[str]],
    layout: InvoiceLayout,
    table_index: int,
) -> List[InvoiceRow]:
    rows: List[InvoiceRow] = []

    header_idx, mapping = _find_column_mapping(table)
    log_event(
        logger,
        "COLUMN_MAPPING",
        parser="attendance",
        table_index=table_index,
        header_index=header_idx,
        mapping=mapping,
    )

    start_idx = header_idx + 1 if header_idx >= 0 else 0

    for row in table[start_idx:]:
        cells = [_clean_cell(c) for c in row]
        if not any(cells):
            continue
        raw_row = " | ".join(cells)

        row_type = classify_row(cells)
        if row_type in {
            RowType.HEADER_ROW,
            RowType.METADATA_ROW,
            RowType.FINANCIAL_SUMMARY_ROW,
            RowType.FOOTER_ROW,
            RowType.SIGNATURE_ROW,
            RowType.EMPTY_ROW,
            RowType.TOTAL_ROW,
            RowType.SUBTOTAL_ROW,
        }:
            log_event(logger, "ROW_REJECTED", reason=f"attendance:{row_type.value}", row=raw_row)
=======
def _rows_from_table(table: Sequence[Sequence[str]], layout: InvoiceLayout) -> List[InvoiceRow]:
    rows: List[InvoiceRow] = []

    for row in table:
        cells = [" ".join(str(c or "").split()) for c in row]
        if not any(cells):
            continue

        if classify_row(cells) != RowType.VALID_LABOUR_ROW:
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
            continue

        nums = [_to_float(c) for c in cells if any(ch.isdigit() for ch in c)]
        nums = [n for n in nums if n > 0]
<<<<<<< HEAD

        trade = ""
        if "trade" in mapping and mapping["trade"] < len(cells):
            trade = (cells[mapping["trade"]] or "").strip().upper()
        if not trade:
            for cell in cells:
                u = (cell or "").strip().upper()
                if not u:
                    continue
                if _is_financial_trade(u):
                    continue
                if _TRADE_HINT_RE.search(u):
                    trade = u
                    break
        if not trade:
            lead = (cells[0] or "").strip().upper()
            if lead and re.fullmatch(r"[A-Z][A-Z\s&./-]{1,40}", lead) and not _is_financial_trade(lead):
                trade = lead

        if not trade or _is_financial_trade(trade):
            log_event(logger, "ROW_REJECTED", reason="attendance:invalid_trade", row=raw_row)
            continue

        rate = _to_float(cells[mapping["rate"]]) if "rate" in mapping and mapping["rate"] < len(cells) else 0.0
        hours = _to_float(cells[mapping["hours"]]) if "hours" in mapping and mapping["hours"] < len(cells) else 0.0
        amount = _to_float(cells[mapping["amount"]]) if "amount" in mapping and mapping["amount"] < len(cells) else 0.0

        if rate <= 0 and len(nums) >= 2:
            rate = nums[-2]
        if amount <= 0 and len(nums) >= 1:
            amount = nums[-1]
        if hours <= 0 and len(nums) >= 3:
            hours = nums[-3]
        if hours <= 0 and rate > 0 and amount > 0:
            hours = round(amount / rate, 2)

        if hours <= 0 or rate <= 0:
            log_event(logger, "ROW_REJECTED", reason="attendance:missing_numeric_fields", row=raw_row)
            continue

        if amount <= 0:
            amount = round(hours * rate, 2)

        project_id = None
        if "project" in mapping and mapping["project"] < len(cells):
            project_val = (cells[mapping["project"]] or "").strip().upper()
            if project_val:
                project_id = project_val
        employee_id = None
        for c in cells:
            uc = c.upper()
            if _PROJECT_RE.search(uc):
                project_id = uc
                break

        if layout == InvoiceLayout.EMPLOYEE_BASED and not project_id:
            if "employee" in mapping and mapping["employee"] < len(cells):
                employee_id = (cells[mapping["employee"]] or "").strip() or None
            elif len(cells) > 1:
                employee_id = (cells[1] or "").strip() or None

        log_event(
            logger,
            "ATTENDANCE_ROW_PARSED",
            table_index=table_index,
            trade=trade,
            employee_id=employee_id,
            project_id=project_id,
            hours=round(hours, 2),
            rate=round(rate, 2),
            amount=round(amount, 2),
        )
=======
        if len(nums) < 2:
            continue

        trade = (cells[0] or "").strip().upper()
        if not trade:
            continue

        amount = nums[-1]
        rate = nums[-2] if len(nums) >= 2 else 0.0
        hours = nums[-3] if len(nums) >= 3 else (round(amount / rate, 2) if rate > 0 else 0.0)

        project_id = None
        employee_id = None
        for c in cells:
            uc = c.upper()
            if uc.startswith("P") and any(ch.isdigit() for ch in uc):
                project_id = uc
                break

        if layout == InvoiceLayout.EMPLOYEE_BASED and len(cells) > 1 and not project_id:
            employee_id = cells[1]
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

        rows.append(
            InvoiceRow(
                trade=trade,
                project_id=project_id,
                employee_id=employee_id,
                hours=round(hours, 2),
                rate=round(rate, 2),
                amount=round(amount, 2),
            )
        )

    return rows


<<<<<<< HEAD
def _parse_summary_rows(table: Sequence[Sequence[str]], table_index: int) -> List[InvoiceRow]:
    rows: List[InvoiceRow] = []
    header_idx, mapping = _find_column_mapping(table)
    log_event(
        logger,
        "COLUMN_MAPPING",
        parser="summary",
        table_index=table_index,
        header_index=header_idx,
        mapping=mapping,
    )

    start_idx = header_idx + 1 if header_idx >= 0 else 0
    for row in table[start_idx:]:
        cells = [_clean_cell(c) for c in row]
        if not any(cells):
            continue
        raw_row = " | ".join(cells)

        trade = (cells[mapping["trade"]] or "").strip().upper() if "trade" in mapping and mapping["trade"] < len(cells) else ""
        if not trade:
            for cell in cells:
                cand = (cell or "").strip().upper()
                if not cand or _is_financial_trade(cand):
                    continue
                if _TRADE_HINT_RE.search(cand):
                    trade = cand
                    break
        if not trade:
            log_event(logger, "ROW_REJECTED", reason="summary:missing_trade", row=raw_row)
            continue
        if _is_financial_trade(trade):
            log_event(logger, "ROW_REJECTED", reason="summary:financial_label", row=raw_row)
            continue
        if any(tok in trade for tok in ("TRADE", "HOUR", "RATE", "AMOUNT", "PAYABLE", "DEDUCTION", "TOTAL", "NET")):
            log_event(logger, "ROW_REJECTED", reason="summary:header_or_financial_text", row=raw_row)
            continue

        hours = _to_float(cells[mapping["hours"]]) if "hours" in mapping and mapping["hours"] < len(cells) else 0.0
        rate = _to_float(cells[mapping["rate"]]) if "rate" in mapping and mapping["rate"] < len(cells) else 0.0
        amount = _to_float(cells[mapping["amount"]]) if "amount" in mapping and mapping["amount"] < len(cells) else 0.0

        nums = [_to_float(c) for c in cells if any(ch.isdigit() for ch in c)]
        nums = [n for n in nums if n > 0]
        if amount <= 0 and nums:
            amount = nums[-1]
        if rate <= 0 and len(nums) >= 2:
            rate = nums[-2]
        if hours <= 0 and len(nums) >= 3:
            hours = nums[-3]
        if hours <= 0 and rate > 0 and amount > 0:
            hours = round(amount / rate, 2)

        # Compact summary rows may have exactly two numbers, e.g. "Carpenter 10 50.00".
        if len(nums) == 2 and (hours <= 0 or rate <= 0 or amount <= 0):
            n1, n2 = nums[0], nums[1]
            if n1 > 0 and n2 > 0 and n2 >= n1:
                rate = rate if rate > 0 else n1
                amount = amount if amount > 0 else n2
                hours = hours if hours > 0 else round(amount / rate, 2)

        if hours <= 0 or rate <= 0 or amount <= 0:
            log_event(logger, "ROW_REJECTED", reason="summary:missing_numeric_fields", row=raw_row)
            continue

        expected = round(hours * rate, 2)
        if expected > 0:
            ratio = amount / expected
            if ratio < 0.1 or ratio > 10:
                amount = expected

        log_event(
            logger,
            "SUMMARY_ROW_PARSED",
            table_index=table_index,
            trade=trade,
            hours=round(hours, 2),
            rate=round(rate, 2),
            amount=round(amount, 2),
        )

        rows.append(
            InvoiceRow(
                trade=trade,
                project_id=None,
                employee_id=None,
                hours=round(hours, 2),
                rate=round(rate, 2),
                amount=round(amount, 2),
            )
        )

    return rows


=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
def route_document_tables(
    tables: Sequence[Sequence[Sequence[str]]],
    layout: InvoiceLayout,
) -> List[ParsedTablePayload]:
    payloads: List[ParsedTablePayload] = []

    for idx, table in enumerate(tables):
        classification = classify_table(table)
        ttype = classification.table_type

        payload = ParsedTablePayload(
            table_index=idx,
            table_type=ttype,
            confidence=classification.confidence,
            parser_name="none",
            source_text=" ".join(" ".join(str(c or "") for c in row) for row in table)[:400],
        )

        if ttype in {TableType.FINANCIAL_SUMMARY_TABLE, TableType.DEDUCTION_SUMMARY_TABLE, TableType.TOTALS_FOOTER_TABLE}:
            parsed = parse_financial_summary_table(table)
            payload.financials = parsed.financials
            payload.confidence = max(payload.confidence, parsed.confidence)
<<<<<<< HEAD
            payload.rows = []
            payload.parser_name = "financial_summary_parser"

        elif ttype in {TableType.ATTENDANCE_TABLE, TableType.PROJECT_SUMMARY_TABLE, TableType.OVERTIME_TABLE}:
            payload.rows = _parse_attendance_rows(table, layout, table_index=idx)
            payload.parser_name = "attendance_table_parser"
=======
            payload.parser_name = "financial_summary_parser"

        elif ttype in {TableType.ATTENDANCE_TABLE, TableType.PROJECT_SUMMARY_TABLE, TableType.OVERTIME_TABLE}:
            payload.rows = _rows_from_table(table, layout)
            payload.parser_name = "labour_table_parser"
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

        elif ttype == TableType.METADATA_TABLE:
            payload.parser_name = "metadata_table_parser"

        else:
            payload.parser_name = "unknown_table_parser"

        payloads.append(payload)

    return payloads
