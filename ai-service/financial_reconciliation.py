"""
financial_reconciliation.py

Post-validation financial reconciliation guards.

Keeps API contract unchanged while enforcing internal consistency and
preventing impossible values from propagating downstream.
"""

from __future__ import annotations

from dataclasses import dataclass
import os
from typing import List

from normalized_output import NormalizedInvoice


@dataclass
class ReconciliationReport:
    adjustments: List[str]
    anomalies: List[str]


def reconcile_invoice_financials(invoice: NormalizedInvoice) -> ReconciliationReport:
    adjustments: List[str] = []
    anomalies: List[str] = []

    # Clamp invalid scalar values.
    for name in ("subtotal", "deductions", "vat", "net_total", "gross_total"):
        value = float(getattr(invoice, name, 0.0) or 0.0)
        if value < 0:
            setattr(invoice, name, 0.0)
            adjustments.append(f"clamped_negative:{name}")

    row_subtotal = round(sum(max(0.0, float(r.amount or 0.0)) for r in invoice.invoice_rows), 2)
    reported_subtotal = float(invoice.original_subtotal or invoice.subtotal or 0.0)

    if row_subtotal > 0:
        diff_ratio = abs(row_subtotal - reported_subtotal) / max(row_subtotal, 1.0)
        if diff_ratio > 0.15:
            anomalies.append("subtotal_row_mismatch")
            invoice.subtotal = row_subtotal
            adjustments.append("subtotal_reset_from_rows")
            invoice.financial_corrections.append("subtotal_replaced_by_row_sum")
        elif invoice.subtotal <= 0:
            invoice.subtotal = row_subtotal
            adjustments.append("subtotal_derived_from_rows")
            invoice.financial_corrections.append("subtotal_derived_from_rows")

    if invoice.subtotal <= 0 and row_subtotal <= 0 and reported_subtotal > 100000:
        anomalies.append("subtotal_rejected_merged_footer")
        invoice.rejected_values.append(f"subtotal:{reported_subtotal}")

    if invoice.deductions > invoice.subtotal:
        anomalies.append("deductions_gt_subtotal")
        invoice.deductions = round(max(0.0, invoice.subtotal), 2)
        adjustments.append("deductions_capped_to_subtotal")

    if float(invoice.original_vat or 0.0) > 0:
        invoice.vat = float(invoice.original_vat or 0.0)
        invoice.vat_rate = invoice.vat / max(float(invoice.subtotal or 0.0), 1.0)
    else:
        invoice.vat = 0.0
        invoice.vat_rate = 0.0

    expected_net = round(float(invoice.subtotal or 0.0) + float(invoice.vat or 0.0) - float(invoice.deductions or 0.0), 2)
    if abs(float(invoice.net_total or 0.0) - expected_net) / max(expected_net, 1.0) > 0.15:
        anomalies.append("net_total_inconsistent")
        invoice.net_total = expected_net
        adjustments.append("net_total_recomputed")
        invoice.financial_corrections.append("net_total_recomputed")

    invoice.gross_total = round(invoice.subtotal + invoice.vat, 2)

    return ReconciliationReport(adjustments=adjustments, anomalies=anomalies)
