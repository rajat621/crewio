# """
# invoice_grouper.py

# Invoice generation grouping rules, per spec:

#     If project ID exists:
#         group invoice rows using: project_id + trade
#             e.g. P1506 + Steel Fixer, P960 + Steel Fixer
#     If project ID does not exist:
#         group invoice rows using: trade only
#             e.g. Carpenter, Mason, Helper

#     Employee IDs should NEVER determine invoice grouping.

# This module reconstructs invoice line items by aggregating employee-level
# NormalizedInvoiceRow records into the correct billing line items, summing
# hours/amount per group and computing a blended (amount-weighted) rate.

# Trade names are normalized (via trade_normalizer) before grouping, so
# "SteelFixer" / "Steel Fixer" / "Steel-Fixer" rows for the same project
# collapse into a single invoice line as required.
# """

# from __future__ import annotations

# from dataclasses import dataclass, field
# from typing import Dict, List, Tuple

# from normalized_output import NormalizedInvoiceRow
# from trade_normalizer import build_trade_canonicalizer


# @dataclass
# class InvoiceGroupLine:
#     """One aggregated invoice line item, ready for rendering."""
#     trade: str
#     project_id: str  # "" when document has no project IDs at all
#     total_hours: float
#     total_amount: float
#     blended_rate: float
#     employee_count: int
#     source_employee_ids: List[str] = field(default_factory=list)

#     def to_dict(self) -> Dict:
#         return {
#             "trade": self.trade,
#             "project_id": self.project_id or None,
#             "total_hours": round(self.total_hours, 2),
#             "total_amount": round(self.total_amount, 2),
#             "rate": round(self.blended_rate, 4),
#             "employee_count": self.employee_count,
#         }


# def group_rows_for_invoice(rows: List[NormalizedInvoiceRow]) -> List[InvoiceGroupLine]:
#     """
#     Group employee-level extraction rows into invoice line items per spec.

#     Grouping key:
#       - (project_id, normalized_trade) when ANY row in the document has a
#         non-empty project_id (project-based timesheet)
#       - (normalized_trade,) only, when no rows have a project_id
#         (trade-based / employee-based timesheet without project structure)

#     Employee IDs are NEVER part of the grouping key.
#     """
#     if not rows:
#         return []

#     canon = build_trade_canonicalizer()
#     # Pre-normalize trades once so grouping and canonical collapse use the
#     # same normalized value consistently.
#     normalized: List[Tuple[NormalizedInvoiceRow, str]] = [
#         (row, canon(row.description)) for row in rows
#     ]

#     has_project = any((row.project or "").strip() for row, _ in normalized)

#     groups: Dict[Tuple[str, str], InvoiceGroupLine] = {}
#     order: List[Tuple[str, str]] = []

#     for row, trade in normalized:
#         if not trade:
#             continue

#         project_id = (row.project or "").strip() if has_project else ""
#         key = (project_id, trade) if has_project else ("", trade)

#         if key not in groups:
#             groups[key] = InvoiceGroupLine(
#                 trade=trade,
#                 project_id=project_id,
#                 total_hours=0.0,
#                 total_amount=0.0,
#                 blended_rate=0.0,
#                 employee_count=0,
#             )
#             order.append(key)

#         g = groups[key]
#         g.total_hours += row.quantity
#         g.total_amount += row.amount
#         g.employee_count += 1
#         if row.employee_id:
#             g.source_employee_ids.append(row.employee_id)

#     result: List[InvoiceGroupLine] = []
#     for key in order:
#         g = groups[key]
#         g.total_hours = round(g.total_hours, 2)
#         g.total_amount = round(g.total_amount, 2)
#         g.blended_rate = round(g.total_amount / g.total_hours, 4) if g.total_hours > 0 else 0.0
#         result.append(g)

#     return result
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Tuple

from normalized_output import NormalizedInvoiceRow
from trade_normalizer import build_trade_canonicalizer


@dataclass
class InvoiceGroupLine:
    trade: str
    project_id: str
    total_hours: float
    total_amount: float
    blended_rate: float
    employee_count: int
    source_employee_ids: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return {
            "trade": self.trade,
            "project_id": self.project_id or None,
            "total_hours": round(self.total_hours, 2),
            "total_amount": round(self.total_amount, 2),
            "rate": round(self.blended_rate, 4),
            "employee_count": self.employee_count,
        }


def _row_get(row: NormalizedInvoiceRow | Dict, field_name: str, default=""):
    if isinstance(row, dict):
        return row.get(field_name, default)
    mapping = {
        "trade": "description",
        "project_id": "project",
        "hours": "quantity",
        "rate": "rate",
        "amount": "amount",
        "employee_id": "employee_id",
    }
    attr = mapping.get(field_name, field_name)
    return getattr(row, attr, default)


def group_rows_for_invoice(rows):
    if not rows:
        return []

    canon = build_trade_canonicalizer()
    has_project = any(str(_row_get(row, "project_id", "") or "").strip() for row in rows)

    groups: Dict[Tuple[str, str], InvoiceGroupLine] = {}
    order: List[Tuple[str, str]] = []

    for row in rows:
        trade_raw = str(_row_get(row, "trade", "") or "").strip()
        trade = canon(trade_raw)
        if not trade:
            continue

        project_id = str(_row_get(row, "project_id", "") or "").strip() if has_project else ""
        hours = float(_row_get(row, "hours", 0) or 0)
        amount = float(_row_get(row, "amount", 0) or 0)
        rate = float(_row_get(row, "rate", 0) or 0)
        employee_id = str(_row_get(row, "employee_id", "") or "").strip()

        key = (project_id, trade) if has_project else ("", trade)
        if key not in groups:
            groups[key] = InvoiceGroupLine(
                trade=trade,
                project_id=project_id,
                total_hours=0.0,
                total_amount=0.0,
                blended_rate=0.0,
                employee_count=0,
            )
            order.append(key)

        g = groups[key]
        g.total_hours = round(g.total_hours + hours, 2)
        g.total_amount = round(g.total_amount + amount, 2)
        g.employee_count += 1
        if employee_id:
            g.source_employee_ids.append(employee_id)
        if g.total_hours > 0 and rate > 0:
            g.blended_rate = round(g.total_amount / g.total_hours, 4)

    result: List[InvoiceGroupLine] = []
    for key in order:
        g = groups[key]
        if g.total_hours <= 0 and g.total_amount > 0:
            g.blended_rate = 0.0
        result.append(g)

    return result