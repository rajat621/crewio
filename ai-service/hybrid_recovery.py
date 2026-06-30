"""
hybrid_recovery.py

STEP 5 — Hybrid Recovery.

Per spec:
  If Vision extracts financial totals correctly but misses employee rows:
    Combine Vision financial totals + OCR employee rows.
    Final source = "hybrid"

This module handles all merging logic between extraction sources.
"""

from __future__ import annotations

import logging
from typing import List, Optional

from normalized_output import NormalizedInvoice, NormalizedInvoiceRow

logger = logging.getLogger(__name__)


def _rows_are_sufficient(invoice: NormalizedInvoice) -> bool:
    """True when Vision produced usable employee rows."""
    return len(invoice.invoice_rows) > 0 and invoice.subtotal > 0.0


def _financials_are_valid(invoice: NormalizedInvoice) -> bool:
    """True when the invoice has reliable financial totals."""
    return invoice.subtotal > 0.0 and invoice.net_total > 0.0


def _rows_subtotal_matches(rows: List[NormalizedInvoiceRow], reported_subtotal: float) -> bool:
    """Check whether row amounts are consistent with the reported subtotal."""
    if not rows or reported_subtotal <= 0:
        return False
    row_sum = sum(r.amount for r in rows)
    diff_ratio = abs(row_sum - reported_subtotal) / max(reported_subtotal, 1.0)
    return diff_ratio <= 0.25  # allow 25% tolerance


def attempt_hybrid_recovery(
    vision_result: NormalizedInvoice,
    ocr_result: NormalizedInvoice,
) -> NormalizedInvoice:
    """
    Combine the best parts of Vision and OCR results.

    Strategy:
    1. If Vision has rows AND matching financials → use Vision as-is
    2. If Vision has good financials but poor/no rows → use OCR rows + Vision financials
    3. If Vision has rows but bad financials → use Vision rows + recomputed financials
    4. If both are weak → use whichever has more rows, warn about low confidence
    """
    vision_has_rows = len(vision_result.invoice_rows) > 0
    vision_has_financials = _financials_are_valid(vision_result)
    ocr_has_rows = len(ocr_result.invoice_rows) > 0

    # Case 1: Vision is complete and consistent → no hybrid needed
    if vision_has_rows and vision_has_financials:
        if _rows_subtotal_matches(vision_result.invoice_rows, vision_result.subtotal):
            logger.info("hybrid_recovery: vision complete, no merge needed")
            return vision_result

    # Case 2: Vision has financials but no rows → hybrid with OCR rows
    if vision_has_financials and not vision_has_rows and ocr_has_rows:
        logger.info(
            "hybrid_recovery: vision_financials + ocr_rows rows=%d subtotal=%.2f",
            len(ocr_result.invoice_rows), vision_result.subtotal,
        )
        merged = NormalizedInvoice()
        merged.extraction_source = "hybrid"
        merged.invoice_rows = ocr_result.invoice_rows

        # Use Vision financials as authoritative
        merged.subtotal = vision_result.subtotal
        merged.deductions = vision_result.deductions
        merged.deduction_detail = vision_result.deduction_detail
        merged.vat = vision_result.vat
        merged.vat_rate = vision_result.vat_rate
        merged.net_total = vision_result.net_total
        merged.gross_total = vision_result.gross_total

        # Metadata from Vision
        merged.client_name = vision_result.client_name or ocr_result.client_name
        merged.period_month = vision_result.period_month or ocr_result.period_month
        merged.invoice_no = vision_result.invoice_no or ocr_result.invoice_no

        merged.confidence = min(vision_result.confidence, ocr_result.confidence) + 0.05
        merged.warnings = (
            vision_result.warnings
            + ocr_result.warnings
            + ["hybrid:vision_financials+ocr_rows"]
        )
        return merged

    # Case 3: Vision has rows but financials don't match → recompute financials from rows
    if vision_has_rows and not _rows_subtotal_matches(vision_result.invoice_rows, vision_result.subtotal):
        logger.info(
            "hybrid_recovery: recomputing financials from vision rows rows=%d",
            len(vision_result.invoice_rows),
        )
        merged = NormalizedInvoice()
        merged.extraction_source = "hybrid"
        merged.invoice_rows = vision_result.invoice_rows

        row_sum = round(sum(r.amount for r in vision_result.invoice_rows), 2)
        merged.subtotal = row_sum
        merged.deductions = vision_result.deductions
        merged.deduction_detail = vision_result.deduction_detail
        adjusted = max(0.0, merged.subtotal - merged.deductions)
        merged.vat_rate = vision_result.vat_rate
        merged.vat = round(adjusted * merged.vat_rate, 4)
        merged.net_total = round(adjusted + merged.vat, 2)
        merged.gross_total = round(merged.subtotal + merged.vat, 2)

        merged.client_name = vision_result.client_name
        merged.period_month = vision_result.period_month
        merged.invoice_no = vision_result.invoice_no

        merged.confidence = vision_result.confidence * 0.85  # slight penalty for financial mismatch
        merged.warnings = vision_result.warnings + ["hybrid:financials_recomputed_from_rows"]
        return merged

    # Case 4: Both weak → pick the one with more rows
    if ocr_has_rows and len(ocr_result.invoice_rows) > len(vision_result.invoice_rows):
        logger.info(
            "hybrid_recovery: both weak, preferring ocr rows=%d",
            len(ocr_result.invoice_rows),
        )
        ocr_result.warnings.append("hybrid:both_weak_used_ocr")
        ocr_result.confidence = max(0.0, ocr_result.confidence - 0.1)
        return ocr_result

    logger.info("hybrid_recovery: returning best available vision result")
    vision_result.warnings.append("hybrid:both_weak_used_vision")
    return vision_result


def merge_partial_results(
    primary: NormalizedInvoice,
    fallback: NormalizedInvoice,
) -> NormalizedInvoice:
    """
    Fill gaps in primary result using fallback.
    Used when one source has rows but the other has better financials.
    """
    merged = NormalizedInvoice()
    merged.extraction_source = "hybrid"

    # Rows: prefer whichever source has more
    if len(primary.invoice_rows) >= len(fallback.invoice_rows):
        merged.invoice_rows = primary.invoice_rows
        row_source = "primary"
    else:
        merged.invoice_rows = fallback.invoice_rows
        row_source = "fallback"

    # Financials: prefer primary if valid, else fallback
    if primary.subtotal > 0:
        merged.subtotal = primary.subtotal
        merged.deductions = primary.deductions
        merged.deduction_detail = primary.deduction_detail
        merged.vat = primary.vat
        merged.vat_rate = primary.vat_rate
        merged.net_total = primary.net_total
        merged.gross_total = primary.gross_total
        fin_source = "primary"
    else:
        merged.subtotal = fallback.subtotal
        merged.deductions = fallback.deductions
        merged.deduction_detail = fallback.deduction_detail
        merged.vat = fallback.vat
        merged.vat_rate = fallback.vat_rate
        merged.net_total = fallback.net_total
        merged.gross_total = fallback.gross_total
        fin_source = "fallback"

    # Metadata: prefer primary
    merged.client_name = primary.client_name or fallback.client_name
    merged.period_month = primary.period_month or fallback.period_month
    merged.invoice_no = primary.invoice_no or fallback.invoice_no

    merged.confidence = max(primary.confidence, fallback.confidence)
    merged.warnings = (
        primary.warnings
        + fallback.warnings
        + [f"hybrid:rows_from_{row_source}:financials_from_{fin_source}"]
    )
    return merged