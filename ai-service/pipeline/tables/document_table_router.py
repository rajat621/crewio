"""Route each detected table to specialized parsers and emit typed payloads."""

from __future__ import annotations

from typing import Dict, List, Sequence

from schema import InvoiceLayout, InvoiceRow

from pipeline.semantic_filter import classify_row, RowType

from .financial_summary_parser import parse_financial_summary_table
from .table_classifier import TableType, classify_table
from .table_merger import ParsedTablePayload


def _to_float(value: str) -> float:
    import re

    cleaned = re.sub(r"[^0-9.\-]", "", str(value or ""))
    if cleaned in {"", ".", "-"}:
        return 0.0
    try:
        return float(cleaned)
    except Exception:
        return 0.0


def _rows_from_table(table: Sequence[Sequence[str]], layout: InvoiceLayout) -> List[InvoiceRow]:
    rows: List[InvoiceRow] = []

    for row in table:
        cells = [" ".join(str(c or "").split()) for c in row]
        if not any(cells):
            continue

        if classify_row(cells) != RowType.VALID_LABOUR_ROW:
            continue

        nums = [_to_float(c) for c in cells if any(ch.isdigit() for ch in c)]
        nums = [n for n in nums if n > 0]
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
            payload.parser_name = "financial_summary_parser"

        elif ttype in {TableType.ATTENDANCE_TABLE, TableType.PROJECT_SUMMARY_TABLE, TableType.OVERTIME_TABLE}:
            payload.rows = _rows_from_table(table, layout)
            payload.parser_name = "labour_table_parser"

        elif ttype == TableType.METADATA_TABLE:
            payload.parser_name = "metadata_table_parser"

        else:
            payload.parser_name = "unknown_table_parser"

        payloads.append(payload)

    return payloads
