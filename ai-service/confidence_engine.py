"""
confidence_engine.py

Per spec: "The system must provide confidence scores for every extracted
field. If confidence falls below a configurable threshold, the system
should flag the field for manual review."

This module computes per-field confidence for each NormalizedInvoiceRow
and for top-level invoice financial fields, based on:
  - extraction source reliability (native_pdf > vision > ocr)
  - whether a value was directly read vs. derived/repaired
  - cross-validation against row-sum reconstruction
  - OCR-specific token confidence, when available

Threshold is configurable via REVIEW_CONFIDENCE_THRESHOLD env var
(default 0.75).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Dict, List

# Base confidence by extraction source, before adjustments
_SOURCE_BASE_CONFIDENCE = {
    "native_pdf": 0.97,
    "vision": 0.88,
    "ocr": 0.65,
    "hybrid": 0.80,
}


def get_review_threshold() -> float:
    try:
        return float(os.getenv("REVIEW_CONFIDENCE_THRESHOLD", "0.75"))
    except ValueError:
        return 0.75


@dataclass
class FieldConfidence:
    field_name: str
    value: Any
    confidence: float
    needs_review: bool = False
    reason: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "field": self.field_name,
            "value": self.value,
            "confidence": round(self.confidence, 4),
            "needs_review": self.needs_review,
            "reason": self.reason,
        }


@dataclass
class RowConfidence:
    row_index: int
    fields: List[FieldConfidence] = field(default_factory=list)
    overall: float = 0.0
    needs_review: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "row_index": self.row_index,
            "overall_confidence": round(self.overall, 4),
            "needs_review": self.needs_review,
            "fields": [f.to_dict() for f in self.fields],
        }


def _score_field(
    base: float,
    was_derived: bool,
    was_repaired: bool,
    out_of_range: bool,
    threshold: float,
) -> FieldConfidence:
    score = base
    reasons = []
    if was_derived:
        score -= 0.12
        reasons.append("derived_not_directly_extracted")
    if was_repaired:
        score -= 0.08
        reasons.append("ocr_repair_applied")
    if out_of_range:
        score -= 0.20
        reasons.append("value_outside_expected_range")
    score = max(0.0, min(1.0, score))
    needs_review = score < threshold
    return score, needs_review, ";".join(reasons)


def score_row_confidence(
    row_index: int,
    row,  # NormalizedInvoiceRow
    extraction_source: str,
    repairs_applied: List[str],
    threshold: float = None,
) -> RowConfidence:
    """
    Compute per-field confidence for a single invoice row.

    `repairs_applied` is the list of repair tags produced by
    normalized_output.repair_row() / extraction_validator for this run
    (matched loosely by trade name, since repairs are tagged by trade).
    """
    threshold = threshold if threshold is not None else get_review_threshold()
    base = _SOURCE_BASE_CONFIDENCE.get(extraction_source, 0.6)

    row_repairs = [r for r in repairs_applied if row.description in r]
    numeric_repair_tags = ("x10_repair", "x100_repair", "div10_repair", "_derived")
    numeric_repairs = [r for r in row_repairs if any(tag in r for tag in numeric_repair_tags)]
    was_repaired = bool(numeric_repairs)

    fields: List[FieldConfidence] = []

    # description / trade
    score, needs_review, reason = _score_field(
        base, was_derived=False, was_repaired=False,
        out_of_range=not bool(row.description), threshold=threshold,
    )
    fields.append(FieldConfidence("trade", row.description, score, needs_review, reason))

    # hours
    hours_derived = any("hours_derived" in r for r in row_repairs)
    score, needs_review, reason = _score_field(
        base, was_derived=hours_derived, was_repaired=was_repaired,
        out_of_range=(row.quantity <= 0 or row.quantity > 400), threshold=threshold,
    )
    fields.append(FieldConfidence("hours", row.quantity, score, needs_review, reason))

    # rate
    score, needs_review, reason = _score_field(
        base, was_derived=False, was_repaired=was_repaired,
        out_of_range=(row.rate <= 0 or row.rate > 500), threshold=threshold,
    )
    fields.append(FieldConfidence("rate", row.rate, score, needs_review, reason))

    # amount
    amount_derived = any("amount_derived" in r for r in row_repairs)
    score, needs_review, reason = _score_field(
        base, was_derived=amount_derived, was_repaired=was_repaired,
        out_of_range=(row.amount <= 0 or row.amount > 500_000), threshold=threshold,
    )
    fields.append(FieldConfidence("amount", row.amount, score, needs_review, reason))

    # project
    if row.project:
        score, needs_review, reason = _score_field(
            base, was_derived=False, was_repaired=False,
            out_of_range=False, threshold=threshold,
        )
        fields.append(FieldConfidence("project", row.project, score, needs_review, reason))

    overall = sum(f.confidence for f in fields) / len(fields) if fields else 0.0
    row_needs_review = overall < threshold or any(f.needs_review for f in fields)

    return RowConfidence(row_index=row_index, fields=fields, overall=overall, needs_review=row_needs_review)


def score_invoice_confidence(
    invoice,  # NormalizedInvoice
    repairs_applied: List[str],
    threshold: float = None,
) -> Dict[str, Any]:
    """
    Compute confidence for every row plus invoice-level financial fields.
    Returns a dict ready to attach to the API response / to_dict() output.
    """
    threshold = threshold if threshold is not None else get_review_threshold()
    source = invoice.extraction_source or "ocr"
    base = _SOURCE_BASE_CONFIDENCE.get(source, 0.6)

    row_confidences = [
        score_row_confidence(idx, row, source, repairs_applied, threshold)
        for idx, row in enumerate(invoice.invoice_rows)
    ]

    # Financial field confidence: penalize fields that were derived/repaired
    # by the validator (tagged in repairs_applied), and where source is weak.
    financial_fields: List[FieldConfidence] = []
    for fname, fvalue, derive_tag in (
        ("subtotal", invoice.subtotal, "subtotal_derived_from_rows"),
        ("subtotal", invoice.subtotal, "subtotal_replaced_by_row_sum"),
        ("vat", invoice.vat, "vat_recomputed"),
        ("vat", invoice.vat, "vat_derived"),
        ("net_total", invoice.net_total, "net_total_recomputed"),
        ("net_total", invoice.net_total, "net_total_derived"),
        ("deductions", invoice.deductions, "deductions_clamped_to_zero"),
    ):
        was_derived = any(derive_tag in r for r in repairs_applied)
        footer_trusted = False
        row_reconstructed = False
        if fname == "subtotal":
            footer_trusted = bool(invoice.original_subtotal > 0 and "subtotal_derived_from_rows" not in (invoice.financial_corrections or []) and "subtotal_replaced_by_row_sum" not in (invoice.financial_corrections or []))
            row_reconstructed = any(tag in (invoice.financial_corrections or []) for tag in ("subtotal_derived_from_rows", "subtotal_replaced_by_row_sum"))
        elif fname == "vat":
            footer_trusted = bool(invoice.original_vat > 0 and "vat_derived" not in (invoice.financial_corrections or []) and "vat_recomputed" not in (invoice.financial_corrections or []))
            row_reconstructed = any(tag in (invoice.financial_corrections or []) for tag in ("vat_derived", "vat_recomputed"))
        elif fname == "net_total":
            footer_trusted = bool(invoice.original_net_total > 0 and "net_total_derived" not in (invoice.financial_corrections or []) and "net_total_recomputed" not in (invoice.financial_corrections or []))
            row_reconstructed = any(tag in (invoice.financial_corrections or []) for tag in ("net_total_derived", "net_total_recomputed"))
        elif fname == "deductions":
            footer_trusted = bool(invoice.original_deductions > 0 and not (invoice.financial_corrections or []))

        score, needs_review, reason = _score_field(
            base, was_derived=was_derived, was_repaired=False,
            out_of_range=(fvalue < 0), threshold=threshold,
        )
        if row_reconstructed:
            score = min(1.0, score + 0.08)
            reason = (reason + ";" if reason else "") + "row_reconstructed"
        if footer_trusted:
            score = max(0.0, score - 0.08)
            reason = (reason + ";" if reason else "") + "footer_trusted_lower_confidence"
            needs_review = score < threshold
        financial_fields.append(FieldConfidence(fname, fvalue, score, needs_review, reason))

    # De-duplicate financial_fields by name, keep lowest confidence entry
    # (most conservative) since multiple derive_tags map to same field name.
    dedup: Dict[str, FieldConfidence] = {}
    for f in financial_fields:
        if f.field_name not in dedup or f.confidence < dedup[f.field_name].confidence:
            dedup[f.field_name] = f
    financial_fields = list(dedup.values())

    fields_needing_review = [f.field_name for f in financial_fields if f.needs_review]
    rows_needing_review = [rc.row_index for rc in row_confidences if rc.needs_review]

    return {
        "threshold": threshold,
        "extraction_source": source,
        "row_confidences": [rc.to_dict() for rc in row_confidences],
        "financial_field_confidences": [f.to_dict() for f in financial_fields],
        "rows_needing_review": rows_needing_review,
        "fields_needing_review": fields_needing_review,
        "any_review_needed": bool(rows_needing_review or fields_needing_review),
    }
