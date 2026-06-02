"""Parser for financial summary/footer tables in UAE timesheets."""

from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Dict, List, Optional, Sequence

from schema import InvoiceFinancials


_NUM_RE = re.compile(r"(?<![\d.])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?")
_DAY_TOKEN_RE = re.compile(r"\b(?:[1-9]|[12][0-9]|3[01])\b")


@dataclass
class FinancialSummaryParseResult:
    financials: InvoiceFinancials
    confidence: float
    matched_rows: List[str] = field(default_factory=list)


def _to_float(value: str) -> float:
    try:
        return float(str(value).replace(",", "").strip())
    except Exception:
        return 0.0


def _last_amount(cells: Sequence[str]) -> float:
    nums: List[float] = []
    for c in cells:
        for n in _NUM_RE.findall(str(c or "")):
            nums.append(_to_float(n))
    return nums[-1] if nums else 0.0


def parse_financial_summary_table(table: Sequence[Sequence[str]]) -> FinancialSummaryParseResult:
    fin = InvoiceFinancials()
    matched_rows: List[str] = []

    deduction_components: Dict[str, float] = {}
    explicit_total_deduction: Optional[float] = None

    table_text = " ".join(" ".join(str(c or "") for c in row) for row in table).lower()
    day_token_count = len(_DAY_TOKEN_RE.findall(table_text))
    has_currency_hint = (" aed" in table_text) or ("aed " in table_text) or ("amount aed" in table_text)

    for row in table:
        cells = [" ".join(str(c or "").split()) for c in row]
        if not any(cells):
            continue

        joined = " ".join(cells).lower()
        value = _last_amount(cells)

        if value <= 0.0 and not any(k in joined for k in ("deduction", "vat", "total", "net", "absent")):
            continue

        if "subtotal" in joined and "deduction" not in joined:
            if value > 0:
                fin.subtotal = max(fin.subtotal, value)
                matched_rows.append("subtotal")
            continue

        if "final total" in joined and value > 0:
            fin.net_payable = max(fin.net_payable, value)
            matched_rows.append("final_total")
            continue

        if "gross total" in joined:
            if value > 0:
                fin.gross_total = max(fin.gross_total, value)
                matched_rows.append("gross_total")
            continue

        if "total deduction" in joined or "deduction aed" in joined:
            explicit_total_deduction = value if value > 0 else explicit_total_deduction
            if value > 0:
                matched_rows.append("total_deduction")
            continue

        if any(k in joined for k in ("absent amount", "absent deduction", "penalty", "advance", "loan", "food deduction", "transport deduction", "gas")):
            if value > 0:
                key = "deduction"
                for label in ("absent amount", "penalty", "advance", "loan", "food deduction", "transport deduction", "gas"):
                    if label in joined:
                        key = label
                        break
                deduction_components[key] = max(deduction_components.get(key, 0.0), value)
                matched_rows.append(f"deduction_component:{key}")
            continue

        if "vat" in joined:
            if value > 0:
                fin.total_vat = max(fin.total_vat, value)
                matched_rows.append("total_vat")
            continue

        if any(k in joined for k in ("net payable", "net amount", "amount payable", "net amount payable")):
            if value > 0:
                fin.net_payable = max(fin.net_payable, value)
                matched_rows.append("net_payable")
            continue

        if "total" in joined and value > 0 and fin.subtotal == 0.0:
            # Fallback for generic "TOTAL" line in footer tables.
            fin.subtotal = value
            matched_rows.append("subtotal_from_total")

    fin.deduction_breakdown = deduction_components

    # Guardrail: attendance-heavy OCR may leak day numbers as fake deductions (e.g., 25.00).
    if day_token_count >= 20 and not has_currency_hint:
        if explicit_total_deduction is not None and explicit_total_deduction <= 31.0 and abs(explicit_total_deduction - round(explicit_total_deduction)) < 0.001:
            explicit_total_deduction = None
            matched_rows.append("deduction_rejected_attendance_leak")
        if deduction_components:
            filtered = {
                k: v
                for k, v in deduction_components.items()
                if not (v <= 31.0 and abs(v - round(v)) < 0.001)
            }
            fin.deduction_breakdown = filtered

    if explicit_total_deduction is not None:
        fin.total_deduction = explicit_total_deduction
    elif fin.deduction_breakdown:
        fin.total_deduction = round(sum(fin.deduction_breakdown.values()), 3)

    score_parts = [
        1.0 if fin.subtotal > 0 else 0.0,
        1.0 if fin.total_deduction > 0 else 0.0,
        1.0 if fin.total_vat > 0 else 0.0,
        1.0 if fin.net_payable > 0 else 0.0,
        min(1.0, len(matched_rows) / 5.0),
    ]
    confidence = round(sum(score_parts) / len(score_parts), 3)

    return FinancialSummaryParseResult(financials=fin, confidence=confidence, matched_rows=matched_rows)
