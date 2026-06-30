"""
normalized_output.py

The single normalized output contract that all renderers consume.

The renderer must NOT know whether the source was:
- OCR
- Vision (Gemini)
- Native PDF
- Hybrid

All extraction paths produce this structure before invoice generation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class NormalizedInvoiceRow:
    """One employee/trade row in the normalized invoice."""
    description: str          # trade name or employee description
    quantity: float           # hours worked
    rate: float               # hourly/daily rate
    amount: float             # quantity * rate
    employee_id: str = ""
    employee_name: str = ""
    project: str = ""
    days_worked: float = 0.0
    overtime_hours: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "description": self.description,
            "quantity": self.quantity,
            "rate": self.rate,
            "amount": self.amount,
            "employee_id": self.employee_id,
            "employee_name": self.employee_name,
            "project": self.project,
            "days_worked": self.days_worked,
            "overtime_hours": self.overtime_hours,
        }


@dataclass
class NormalizedDeductions:
    """Deduction breakdown."""
    mess: float = 0.0
    gas: float = 0.0
    transport: float = 0.0
    advance: float = 0.0
    absent: float = 0.0
    other: float = 0.0
    total: float = 0.0
    breakdown: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mess": self.mess,
            "gas": self.gas,
            "transport": self.transport,
            "advance": self.advance,
            "absent": self.absent,
            "other": self.other,
            "total": self.total,
            "breakdown": self.breakdown,
        }


@dataclass
class NormalizedInvoice:
    """
    The canonical output of the extraction pipeline.

    This is the ONLY structure the invoice renderer should consume.
    The renderer must not branch on extraction_source.
    """
    invoice_rows: List[NormalizedInvoiceRow] = field(default_factory=list)
    subtotal: float = 0.0
    deductions: float = 0.0
    deduction_detail: NormalizedDeductions = field(default_factory=NormalizedDeductions)
    vat_rate: float = 0.05
    vat: float = 0.0
    net_total: float = 0.0
    gross_total: float = 0.0

    # Metadata for traceability (not exposed to renderer)
    confidence: float = 0.0
    extraction_source: str = ""   # "native_pdf" | "vision" | "ocr" | "hybrid"
    warnings: List[str] = field(default_factory=list)
    error: Optional[str] = None

    # Invoice metadata
    client_name: str = ""
    client_trn: str = ""
    period_month: str = ""
    invoice_no: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "invoice_rows": [r.to_dict() for r in self.invoice_rows],
            "subtotal": round(self.subtotal, 2),
            "deductions": round(self.deductions, 2),
            "deduction_detail": self.deduction_detail.to_dict(),
            "vat_rate": self.vat_rate,
            "vat": round(self.vat, 4),
            "net_total": round(self.net_total, 2),
            "gross_total": round(self.gross_total, 2),
            "confidence": round(self.confidence, 4),
            "extraction_source": self.extraction_source,
            "warnings": self.warnings,
            "error": self.error,
            "client_name": self.client_name,
            "client_trn": self.client_trn,
            "period_month": self.period_month,
            "invoice_no": self.invoice_no,
        }

    @property
    def is_valid(self) -> bool:
        return (
            len(self.invoice_rows) > 0
            and self.subtotal > 0.0
            and self.error is None
        )


# ---------------------------------------------------------------------------
# Sanity check constants (from spec)
# ---------------------------------------------------------------------------

MAX_HOURS_PER_EMPLOYEE = 400.0
MAX_RATE = 500.0
MAX_AMOUNT = 500_000.0


def sanity_check_row(row: NormalizedInvoiceRow) -> List[str]:
    """Return list of violations for a single row."""
    violations: List[str] = []
    if row.quantity > MAX_HOURS_PER_EMPLOYEE:
        violations.append(f"hours_exceeds_limit:{row.quantity}")
    if row.rate > MAX_RATE:
        violations.append(f"rate_exceeds_limit:{row.rate}")
    if row.amount > MAX_AMOUNT:
        violations.append(f"amount_exceeds_limit:{row.amount}")
    return violations


def repair_row(row: NormalizedInvoiceRow) -> tuple[NormalizedInvoiceRow, List[str]]:
    """
    Repair common OCR errors in-place and return list of repairs made.

    Handles:
    - Missing decimal places (x10 / x100 scaling mistakes)
    - Negative values
    """
    repairs: List[str] = []
    original_amount = row.amount
    original_hours = row.quantity

    # Repair x10 scaling error
    if row.quantity > 0 and row.rate > 0:
        expected = round(row.quantity * row.rate, 2)
        if expected > 0:
            ratio = row.amount / expected if row.amount > 0 else 0
            if abs(ratio - 0.1) < 0.05:  # amount is ~1/10 of expected
                row.amount = round(row.amount * 10, 2)
                repairs.append(f"amount_x10_repair:{original_amount}->{row.amount}")
            elif abs(ratio - 0.01) < 0.005:  # amount is ~1/100 of expected
                row.amount = round(row.amount * 100, 2)
                repairs.append(f"amount_x100_repair:{original_amount}->{row.amount}")
            elif abs(ratio - 10) < 0.5:  # amount is ~10x expected
                row.amount = round(row.amount / 10, 2)
                repairs.append(f"amount_div10_repair:{original_amount}->{row.amount}")

    # Derive missing hours from amount/rate
    if row.quantity <= 0 and row.rate > 0 and row.amount > 0:
        row.quantity = round(row.amount / row.rate, 2)
        repairs.append(f"hours_derived:{row.quantity}")

    # Derive missing amount
    if row.amount <= 0 and row.quantity > 0 and row.rate > 0:
        row.amount = round(row.quantity * row.rate, 2)
        repairs.append(f"amount_derived:{row.amount}")

    return row, repairs