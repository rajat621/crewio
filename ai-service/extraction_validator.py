"""
extraction_validator.py

STEP 3 — Validation Layer.

Runs regardless of extraction source (native PDF, Vision, OCR, hybrid).
The renderer receives ONLY validated, normalized output.

Validates:
  - subtotal consistency
  - VAT calculation
  - deductions
  - net total
  - employee count
  - row totals

Applies sanity checks and repairs per spec.
Stores original values before any repairs.
"""

from __future__ import annotations

import logging
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Dict, List, Tuple

from normalized_output import (
    MAX_AMOUNT,
    MAX_HOURS_PER_EMPLOYEE,
    MAX_RATE,
    NormalizedInvoice,
    NormalizedInvoiceRow,
    repair_row,
    sanity_check_row,
)

logger = logging.getLogger(__name__)

VAT_TOLERANCE = 0.10          # 10% tolerance on VAT check
SUBTOTAL_ROW_TOLERANCE = 0.15  # 15% tolerance between row sum and reported subtotal
NET_TOTAL_TOLERANCE = 0.10    # 10% tolerance on net total check


@dataclass
class ValidationReport:
    passed: bool
    employee_count: int
    row_violations: List[str] = field(default_factory=list)
    financial_warnings: List[str] = field(default_factory=list)
    repairs_applied: List[str] = field(default_factory=list)
    confidence_penalty: float = 0.0


def validate_and_repair(invoice: NormalizedInvoice) -> Tuple[NormalizedInvoice, ValidationReport]:
    """
    Validate and repair a NormalizedInvoice.

    Returns the (potentially repaired) invoice and a ValidationReport.
    The invoice's original values are preserved in row-level fields before repair.
    """
    report = ValidationReport(passed=True, employee_count=len(invoice.invoice_rows))

    # -----------------------------------------------------------------------
    # 1. Row-level validation and repair
    # -----------------------------------------------------------------------
    valid_rows: List[NormalizedInvoiceRow] = []

    for row in invoice.invoice_rows:
        # Store originals
        original_amount = row.amount
        original_hours = row.quantity
        original_rate = row.rate

        # Sanity checks per spec
        violations = sanity_check_row(row)
        if violations:
            report.row_violations.append(
                f"rejected:{row.description}:{';'.join(violations)}"
            )
            report.confidence_penalty += 0.05
            continue

        # Attempt repair
        row, repairs = repair_row(row)
        if repairs:
            report.repairs_applied.extend(repairs)
            logger.info(
                "row_repaired trade=%s repairs=%s", row.description, repairs
            )

        # Re-check after repair
        violations_after = sanity_check_row(row)
        if violations_after:
            report.row_violations.append(
                f"rejected_after_repair:{row.description}:{';'.join(violations_after)}"
            )
            report.confidence_penalty += 0.05
            continue

        valid_rows.append(row)

    invoice.invoice_rows = valid_rows
    report.employee_count = len(valid_rows)

    if not valid_rows:
        report.passed = False
        report.financial_warnings.append("no_valid_rows_after_validation")
        return invoice, report

    # -----------------------------------------------------------------------
    # 2. Financial consistency checks
    # -----------------------------------------------------------------------
    row_subtotal = round(sum(r.amount for r in valid_rows), 2)

    # Check subtotal against row sum
    if invoice.subtotal > 0:
        diff = abs(row_subtotal - invoice.subtotal)
        diff_ratio = diff / max(invoice.subtotal, 1.0)
        if diff_ratio > SUBTOTAL_ROW_TOLERANCE:
            report.financial_warnings.append(
                f"subtotal_row_mismatch:reported={invoice.subtotal:.2f}"
                f":row_sum={row_subtotal:.2f}:diff_ratio={diff_ratio:.2%}"
            )
            # Trust row sum over reported subtotal
            if diff_ratio > 0.35:
                invoice.subtotal = row_subtotal
                report.repairs_applied.append(
                    f"subtotal_replaced_by_row_sum:{row_subtotal}"
                )
                report.confidence_penalty += 0.08
            else:
                report.confidence_penalty += 0.03
    else:
        # No reported subtotal — derive from rows
        invoice.subtotal = row_subtotal
        report.repairs_applied.append(f"subtotal_derived_from_rows:{row_subtotal}")

    # Deductions sanity
    if invoice.deductions < 0:
        invoice.deductions = 0.0
        report.repairs_applied.append("deductions_clamped_to_zero")
    if invoice.deductions > invoice.subtotal and invoice.subtotal > 0:
        report.financial_warnings.append(
            f"deductions_exceed_subtotal:deductions={invoice.deductions:.2f}"
            f":subtotal={invoice.subtotal:.2f}"
        )
        report.confidence_penalty += 0.05

    # VAT check
    adjusted_subtotal = max(0.0, invoice.subtotal - invoice.deductions)
    expected_vat = round(adjusted_subtotal * invoice.vat_rate, 4)
    if invoice.vat > 0:
        vat_diff_ratio = abs(invoice.vat - expected_vat) / max(expected_vat, 0.01)
        if vat_diff_ratio > VAT_TOLERANCE:
            report.financial_warnings.append(
                f"vat_inconsistency:reported={invoice.vat:.4f}"
                f":expected={expected_vat:.4f}"
            )
            # Recompute VAT from adjusted subtotal
            invoice.vat = expected_vat
            report.repairs_applied.append(f"vat_recomputed:{expected_vat}")
            report.confidence_penalty += 0.03
    else:
        invoice.vat = expected_vat
        report.repairs_applied.append(f"vat_derived:{expected_vat}")

    # Net total check
    expected_net = round(adjusted_subtotal + invoice.vat, 2)
    if invoice.net_total > 0:
        net_diff_ratio = abs(invoice.net_total - expected_net) / max(expected_net, 1.0)
        if net_diff_ratio > NET_TOTAL_TOLERANCE:
            report.financial_warnings.append(
                f"net_total_inconsistency:reported={invoice.net_total:.2f}"
                f":expected={expected_net:.2f}"
            )
            invoice.net_total = expected_net
            report.repairs_applied.append(f"net_total_recomputed:{expected_net}")
            report.confidence_penalty += 0.03
    else:
        invoice.net_total = expected_net
        report.repairs_applied.append(f"net_total_derived:{expected_net}")

    # Gross total
    invoice.gross_total = round(invoice.subtotal + invoice.vat, 2)

    # -----------------------------------------------------------------------
    # 3. Apply confidence penalty
    # -----------------------------------------------------------------------
    penalty = min(report.confidence_penalty, 0.35)  # cap total penalty
    invoice.confidence = max(0.0, invoice.confidence - penalty)

    report.passed = report.employee_count > 0 and invoice.subtotal > 0

    # Append validation summary to invoice warnings
    if report.row_violations:
        invoice.warnings.append(
            f"validation:rejected_rows={len(report.row_violations)}"
        )
    if report.financial_warnings:
        invoice.warnings.extend(
            [f"validation:{w}" for w in report.financial_warnings]
        )
    if report.repairs_applied:
        invoice.warnings.append(
            f"validation:repairs={len(report.repairs_applied)}"
        )

    logger.info(
        "validation complete passed=%s rows=%d subtotal=%.2f "
        "net=%.2f confidence=%.2f repairs=%d violations=%d",
        report.passed,
        report.employee_count,
        invoice.subtotal,
        invoice.net_total,
        invoice.confidence,
        len(report.repairs_applied),
        len(report.row_violations),
    )

    return invoice, report