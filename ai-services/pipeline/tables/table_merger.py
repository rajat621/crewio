"""Merge multi-table parsing outputs into unified rows + financials."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence

from schema import InvoiceFinancials, InvoiceRow

from .table_classifier import TableType
from pipeline.profiler import current, new_request_collector


@dataclass
class ParsedTablePayload:
    table_index: int
    table_type: TableType
    confidence: float
    rows: List[InvoiceRow] = field(default_factory=list)
    financials: InvoiceFinancials = field(default_factory=InvoiceFinancials)
    parser_name: str = ""
    source_text: str = ""


@dataclass
class MergeResult:
    rows: List[InvoiceRow]
    financials: InvoiceFinancials
    debug: Dict[str, object]


def merge_table_payloads(
    base_rows: Sequence[InvoiceRow],
    base_financials: InvoiceFinancials,
    payloads: Sequence[ParsedTablePayload],
) -> MergeResult:
    prof = current()
    with (prof or new_request_collector()).time_stage("table_merger.merge_table_payloads"):
        rows_map: Dict[tuple, InvoiceRow] = {}
    for row in list(base_rows):
        key = (row.trade, row.project_id or "", row.employee_id or "", row.hours, row.rate, row.amount)
        rows_map[key] = row

    financial_summaries: List[ParsedTablePayload] = []

    for payload in payloads:
        if payload.table_type in {
            TableType.FINANCIAL_SUMMARY_TABLE,
            TableType.DEDUCTION_SUMMARY_TABLE,
            TableType.TOTALS_FOOTER_TABLE,
        }:
            financial_summaries.append(payload)
        else:
            for row in payload.rows:
                key = (row.trade, row.project_id or "", row.employee_id or "", row.hours, row.rate, row.amount)
                rows_map[key] = row

    merged_rows = list(rows_map.values())
    fin = InvoiceFinancials(
        subtotal=float(base_financials.subtotal or 0.0),
        total_vat=float(base_financials.total_vat or 0.0),
        gross_total=float(base_financials.gross_total or 0.0),
        total_deduction=float(base_financials.total_deduction or 0.0),
        net_payable=float(base_financials.net_payable or 0.0),
        deduction_breakdown=dict(base_financials.deduction_breakdown or {}),
    )

    selected_summary_index: Optional[int] = None
    if financial_summaries:
        best = max(financial_summaries, key=lambda p: p.confidence)
        selected_summary_index = best.table_index
        sf = best.financials

        # Priority 1: explicit financial summary table should drive totals/deductions.
        if sf.subtotal > 0:
            fin.subtotal = sf.subtotal
        if sf.total_vat > 0:
            fin.total_vat = sf.total_vat
        if sf.gross_total > 0:
            fin.gross_total = sf.gross_total

        # Deduction rule: prioritize summary table deduction/absent rows over row fallback.
        if sf.total_deduction >= 0:
            fin.total_deduction = sf.total_deduction
        if sf.deduction_breakdown:
            fin.deduction_breakdown = dict(sf.deduction_breakdown)

        if sf.net_payable > 0:
            fin.net_payable = sf.net_payable

    if fin.subtotal == 0.0:
        fin.subtotal = round(sum(float(r.amount or 0.0) for r in merged_rows), 2)

    if fin.total_deduction < 0.0:
        fin.total_deduction = 0.0

    if fin.gross_total == 0.0:
        fin.gross_total = round(max(0.0, fin.subtotal - fin.total_deduction), 2)

    if fin.net_payable == 0.0:
        fin.net_payable = round(fin.gross_total + float(fin.total_vat or 0.0), 2)

    debug: Dict[str, object] = {
        "payload_count": len(payloads),
        "financial_summary_tables": [p.table_index for p in financial_summaries],
        "selected_financial_summary_table": selected_summary_index,
        "merged_row_count": len(merged_rows),
    }

    return MergeResult(rows=merged_rows, financials=fin, debug=debug)
