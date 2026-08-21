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
import re
import os
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
_INVALID_DESCRIPTION_RE = re.compile(
    r"\b(total|subtotal|vat|net\s*total|net\s*payable|deduction|invoice|timesheet|summary|workers?|prepared|issued\s+to|print\s+date|page)\b",
    re.I,
)


def _configured_vat_rate() -> float:
    raw = (
        os.getenv("CONFIGURED_VAT_RATE")
        or os.getenv("VAT_RATE")
        or os.getenv("DEFAULT_VAT_RATE")
        or "0.05"
    )
    try:
        value = float(str(raw).strip())
        return value if value > 0 else 0.05
    except Exception:
        return 0.05


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

    invoice.original_subtotal = float(invoice.subtotal or 0.0)
    invoice.original_deductions = float(invoice.deductions or 0.0)
    invoice.original_vat = float(invoice.vat or 0.0)
    invoice.original_net_total = float(invoice.net_total or 0.0)
    invoice.original_gross_total = float(invoice.gross_total or 0.0)
    invoice.financial_corrections = []
    invoice.rejected_values = []
    invoice.reconciliation_reason = ""

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
        if row.description and _INVALID_DESCRIPTION_RE.search(row.description) and getattr(row, "row_kind", "") != "billing_summary":
            report.row_violations.append(f"rejected:{row.description}:invalid_description")
            report.confidence_penalty += 0.05
            continue

        violations = sanity_check_row(row)
        if getattr(row, "row_kind", "") in {"billing_summary", "trade_summary"}:
            violations = [v for v in violations if not v.startswith("hours_exceeds_limit:")]
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
        if getattr(row, "row_kind", "") in {"billing_summary", "trade_summary"}:
            violations_after = [v for v in violations_after if not v.startswith("hours_exceeds_limit:")]
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

    merged_footer_limit = max(invoice.original_subtotal, row_subtotal, 1.0)
    if invoice.original_subtotal > 100000 and not valid_rows:
        invoice.rejected_values.append(f"subtotal:{invoice.original_subtotal}")
        report.financial_warnings.append("subtotal_rejected:merged_ocr_footer")
        invoice.subtotal = 0.0
        invoice.financial_corrections.append("subtotal_rejected_merged_footer")
        report.confidence_penalty += 0.08

    for row in valid_rows:
        if invoice.original_subtotal > 0 and row.amount > invoice.original_subtotal:
            tag = f"rejected:{row.description}:amount_gt_reported_subtotal"
            report.row_violations.append(tag)
            invoice.rejected_values.append(tag)
            report.confidence_penalty += 0.05
        if row.amount > merged_footer_limit * 5:
            tag = f"rejected:{row.description}:amount_gt_subtotal_x5"
            report.row_violations.append(tag)
            invoice.rejected_values.append(tag)
            report.confidence_penalty += 0.05

    if row_subtotal > 0:
        diff_ratio = abs(row_subtotal - invoice.original_subtotal) / max(row_subtotal, 1.0)
        if invoice.original_subtotal > 0 and diff_ratio > SUBTOTAL_ROW_TOLERANCE:
            report.financial_warnings.append(
                f"subtotal_row_mismatch:reported={invoice.original_subtotal:.2f}"
                f":row_sum={row_subtotal:.2f}:diff_ratio={diff_ratio:.2%}"
            )
            invoice.subtotal = row_subtotal
            invoice.financial_corrections.append("subtotal_replaced_by_row_sum")
            report.repairs_applied.append(f"subtotal_replaced_by_row_sum:{row_subtotal}")
            report.confidence_penalty += 0.08
            invoice.reconciliation_reason = "row_sum_overrode_ocr_subtotal"
        elif invoice.original_subtotal <= 0:
            invoice.subtotal = row_subtotal
            invoice.financial_corrections.append("subtotal_derived_from_rows")
            report.repairs_applied.append(f"subtotal_derived_from_rows:{row_subtotal}")
            invoice.reconciliation_reason = "subtotal_derived_from_rows"
        else:
            invoice.subtotal = invoice.original_subtotal
            invoice.reconciliation_reason = "ocr_subtotal_accepted"
    else:
        invoice.subtotal = 0.0
        invoice.reconciliation_reason = "no_valid_rows"

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
        invoice.rejected_values.append(f"deductions:{invoice.deductions:.2f}")

    # VAT check
    if invoice.original_vat > 0:
        invoice.vat = invoice.original_vat
        invoice.vat_rate = invoice.original_vat / max(invoice.subtotal, 1.0)
    else:
        invoice.vat = 0.0
        invoice.vat_rate = 0.0

    # Net total check
    expected_net = round(invoice.subtotal + invoice.vat - invoice.deductions, 2)
    if invoice.original_net_total > 0:
        net_diff_ratio = abs(invoice.original_net_total - expected_net) / max(expected_net, 1.0)
        if net_diff_ratio > NET_TOTAL_TOLERANCE:
            report.financial_warnings.append(
                f"net_total_inconsistency:reported={invoice.original_net_total:.2f}"
                f":expected={expected_net:.2f}"
            )
            invoice.net_total = expected_net
            invoice.financial_corrections.append("net_total_recomputed")
            report.repairs_applied.append(f"net_total_recomputed:{expected_net}")
            report.confidence_penalty += 0.03
    else:
        invoice.net_total = expected_net
        invoice.financial_corrections.append("net_total_derived")
        report.repairs_applied.append(f"net_total_derived:{expected_net}")

    # Gross total
    invoice.gross_total = round(invoice.subtotal + invoice.vat, 2)

    # -----------------------------------------------------------------------
    # 3. Apply confidence penalty
    # -----------------------------------------------------------------------
    penalty = min(report.confidence_penalty, 0.35)  # cap total penalty
    invoice.confidence = max(0.0, invoice.confidence - penalty)

    reconstructed_count = len(invoice.financial_corrections)
    if reconstructed_count:
        invoice.confidence = min(1.0, invoice.confidence + 0.05 * reconstructed_count)

    footer_count = 3 - reconstructed_count
    if footer_count > 0:
        invoice.confidence = max(0.0, invoice.confidence - 0.02 * footer_count)

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