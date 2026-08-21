"""
invoice_draft.py

The editable-invoice-draft layer that sits between extraction and PDF rendering.

Flow before this module existed:

    upload -> run_extraction_pipeline() -> generate_invoice_pdf()

Flow with this module:

    upload -> run_extraction_pipeline() -> build_draft()   [user reviews / edits]
           -> recompute()               -> draft_to_extraction_result()
           -> generate_invoice_pdf()

Two rules this module exists to enforce:

1. THE SERVER OWNS THE ARITHMETIC.
   The browser recalculates live so the user sees totals move as they type,
   but those numbers are never trusted. Every render recomputes from the raw
   editable fields (hours, rate, deductions, vat_rate) using recompute().
   If the client's totals disagree with the server's, the server's win and
   the discrepancy is recorded on the draft.

2. THERE IS ONE ARITHMETIC IMPLEMENTATION.
   recompute() is it. The JS mirror in frontend/src/lib/invoiceCalc.js is a
   display convenience and must be kept in step with this file. Do not add a
   third copy anywhere in the Node backend.

The maths matches the existing reconciliation in extraction_validator.py:

    row.amount        = hours * rate            (unless amount_locked)
    subtotal          = sum(row.amount)
    deductions        = sum(deduction_lines)
    vat               = vat_base * vat_rate     (vat_base per vat_basis)
    gross_total       = subtotal + vat
    net_total         = subtotal + vat - deductions

`vat_basis` is explicit because the codebase was previously ambiguous about
it: extraction_validator computed VAT on the full subtotal, while the
NormalizedInvoice -> ExtractionResult bridge also carried a separate
`deduction_vat` field. Making it a named field on the draft means the user
sees which convention their invoice uses instead of inheriting it silently.

Default is VAT_BASIS_ADJUSTED (VAT computed on subtotal minus deductions) -
confirmed correct against a real generated invoice: subtotal 10380.00,
deductions 103.80, adjusted 10276.20, 5% VAT = 513.81. The old default
(VAT_BASIS_SUBTOTAL, VAT on the full subtotal with deductions not reducing
the taxable base) gave 519.00 for the same invoice, which was wrong.
"""

from __future__ import annotations

import math
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

from normalized_output import NormalizedInvoice, NormalizedInvoiceRow
from invoice_grouper import group_rows_for_invoice

DRAFT_SCHEMA_VERSION = 1

# Rows whose confidence falls below this are surfaced for review in the UI.
REVIEW_CONFIDENCE_THRESHOLD = 0.75

VAT_BASIS_SUBTOTAL = "subtotal"
VAT_BASIS_ADJUSTED = "adjusted"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _f(value: Any, default: float = 0.0) -> float:
    """Coerce anything the client sends into a float without exploding.

    Explicitly rejects NaN/Infinity - unlike a non-numeric string (which
    raises ValueError and correctly falls through to `default`),
    float("nan")/float("inf") succeed without raising, and a NaN value
    silently defeats every downstream <=/</> validation check in
    validate_draft() (NaN comparisons always evaluate to False in
    Python), which could let a corrupted total pass as valid.
    """
    if value is None or value == "":
        return default
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(parsed):
        return default
    return parsed


def _s(value: Any, default: str = "") -> str:
    if value is None:
        return default
    return str(value).strip()


def _r2(value: float) -> float:
    return round(value + 0.0, 2)


# ---------------------------------------------------------------------------
# Draft structures
# ---------------------------------------------------------------------------

@dataclass
class DraftRow:
    """
    One editable invoice line.

    `amount_locked` matters more than it looks. Most timesheets bill
    hours x rate, but some suppliers print an agreed lump sum per trade that
    does not divide evenly into the hours shown. When the user types directly
    into the amount cell the UI sets amount_locked, and recompute() stops
    deriving that row so the typed figure survives.
    """
    row_id: str
    trade: str
    project_id: str = ""
    description: str = ""
    hours: float = 0.0
    rate: float = 0.0
    amount: float = 0.0
    amount_locked: bool = False
    employee_count: int = 0
    source_employee_ids: List[str] = field(default_factory=list)
    confidence: float = 1.0
    needs_review: bool = False
    review_reasons: List[str] = field(default_factory=list)
    # Set by the UI when the user adds a line the extractor never produced.
    user_added: bool = False
    # Soft delete so the audit trail keeps what the AI originally proposed.
    removed: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DraftRow":
        return cls(
            row_id=_s(data.get("row_id")) or str(uuid.uuid4()),
            trade=_s(data.get("trade")),
            project_id=_s(data.get("project_id")),
            description=_s(data.get("description")),
            hours=_f(data.get("hours")),
            rate=_f(data.get("rate")),
            amount=_f(data.get("amount")),
            amount_locked=bool(data.get("amount_locked")),
            employee_count=int(_f(data.get("employee_count"))),
            source_employee_ids=list(data.get("source_employee_ids") or []),
            confidence=_f(data.get("confidence"), 1.0),
            needs_review=bool(data.get("needs_review")),
            review_reasons=list(data.get("review_reasons") or []),
            user_added=bool(data.get("user_added")),
            removed=bool(data.get("removed")),
        )


@dataclass
class DeductionLine:
    """
    An editable deduction. Open-ended by design - the extractor already emits
    labels it has never seen before, and hardcoding mess/gas/transport here
    would throw those away at the exact point a human could confirm them.
    """
    line_id: str
    label: str
    amount: float = 0.0
    user_added: bool = False
    removed: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DeductionLine":
        return cls(
            line_id=_s(data.get("line_id")) or str(uuid.uuid4()),
            label=_s(data.get("label")) or "Deduction",
            amount=_f(data.get("amount")),
            user_added=bool(data.get("user_added")),
            removed=bool(data.get("removed")),
        )


# ---------------------------------------------------------------------------
# Build: NormalizedInvoice -> editable draft
# ---------------------------------------------------------------------------

def build_draft(
    invoice: NormalizedInvoice,
    *,
    run_id: str = "",
    source_file_name: str = "",
    page_count: int = 0,
    vat_rate_override: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Turn a completed extraction into the payload the preview window edits.

    Grouping is applied here, not in the renderer, so what the user approves
    is exactly what gets drawn on the PDF. Previously grouping happened inside
    the NormalizedInvoice -> ExtractionResult bridge at render time, which
    meant nobody ever saw the grouped lines before they were final.

    vat_rate_override, when given, is an explicit rate the caller already
    knows (e.g. the value entered in the app's own VAT field before
    extraction ran) and takes priority over both the extractor's own guess
    (invoice.vat_rate) and the 5% fallback - without it the review screen's
    VAT% could silently disagree with whatever the person had already chosen
    upstream.
    """
    grouped = group_rows_for_invoice(invoice.invoice_rows)

    # Some documents carry their own totals/summary row inline with the
    # attendance data (a literal "TOTAL" line at the bottom of the table).
    # When the extractor picks that up as if it were an employee/trade row,
    # group_rows_for_invoice has no way to know it isn't real, since nothing
    # upstream flags it - trade_normalizer just canonicalizes whatever text
    # was there. Drop anything whose trade text is one of these standard
    # summary labels before it ever reaches the draft or the renderer.
    _NON_TRADE_LABELS = {
        "total", "totals", "sub total", "subtotal", "grand total",
        "gross total", "net total", "net amount", "net payable",
        "total deduction", "total deductions",
    }
    grouped = [
        g for g in grouped
        if g.trade.strip().lower() not in _NON_TRADE_LABELS
    ]

    if vat_rate_override is not None:
        resolved_vat_rate = vat_rate_override
    elif invoice.vat_rate > 0:
        resolved_vat_rate = invoice.vat_rate
    else:
        resolved_vat_rate = 0.05

    row_confidence = _per_group_confidence(invoice)

    rows: List[DraftRow] = []
    for group in grouped:
        key = (group.project_id or "", group.trade)
        conf = row_confidence.get(key, invoice.confidence or 0.0)
        row = DraftRow(
            row_id=str(uuid.uuid4()),
            trade=group.trade,
            project_id=group.project_id or "",
            description=_build_description(group.trade, group.project_id),
            hours=_r2(group.total_hours),
            rate=round(group.blended_rate, 4),
            amount=_r2(group.total_amount),
            amount_locked=False,
            employee_count=group.employee_count,
            source_employee_ids=list(group.source_employee_ids or []),
            confidence=round(conf, 4),
        )
        _flag_row(row)
        rows.append(row)

    deductions = _build_deduction_lines(invoice)

    draft: Dict[str, Any] = {
        "schema_version": DRAFT_SCHEMA_VERSION,
        "run_id": run_id,
        "source": {
            "file_name": source_file_name,
            "page_count": page_count,
            "extraction_source": invoice.extraction_source,
            "confidence": round(invoice.confidence or 0.0, 4),
        },
        "meta": {
            "client_name": invoice.client_name or "",
            "client_trn": invoice.client_trn or "",
            "period_month": invoice.period_month or "",
            "source_invoice_no": invoice.invoice_no or "",
            "currency": "AED",
        },
        "rows": [r.to_dict() for r in rows],
        "deduction_lines": [d.to_dict() for d in deductions],
        "vat_rate": resolved_vat_rate,
        "vat_basis": VAT_BASIS_ADJUSTED,
        "totals": {},
        # Frozen copy of what the AI proposed. Never edited. This is what makes
        # the edit diff possible, and the diff is what tells you which supplier
        # layouts the extractor is still getting wrong.
        "ai_original": {
            "rows": [r.to_dict() for r in rows],
            "deduction_lines": [d.to_dict() for d in deductions],
            "vat_rate": resolved_vat_rate,
            "subtotal": _r2(invoice.subtotal),
            "deductions": _r2(invoice.deductions),
            "vat": round(invoice.vat, 4),
            "net_total": _r2(invoice.net_total),
        },
        "extraction_warnings": list(invoice.warnings or [])[:20],
        "anomalies": list(invoice.anomalies or [])[:20],
        "review_required": bool(invoice.review_required),
        "review_reasons": list(invoice.review_reasons or []),
    }

    return recompute(draft)


def _build_description(trade: str, project_id: str) -> str:
    trade = _s(trade)
    project_id = _s(project_id)
    if project_id:
        return f"{trade} - {project_id}"
    return trade


def _per_group_confidence(invoice: NormalizedInvoice) -> Dict[tuple, float]:
    """
    Approximate per-line confidence from the underlying employee rows.

    A grouped line is only as trustworthy as its weakest contributing row, so
    take the minimum rather than the mean - averaging hides the one bad row
    that is the whole reason the user is looking at this screen.
    """
    from trade_normalizer import build_trade_canonicalizer

    canon = build_trade_canonicalizer()
    has_project = any(_s(r.project) for r in invoice.invoice_rows)

    out: Dict[tuple, float] = {}
    for row in invoice.invoice_rows:
        trade = canon(_s(row.description))
        if not trade:
            continue
        key = (_s(row.project) if has_project else "", trade)
        # NormalizedInvoiceRow has no per-row confidence yet; fall back to the
        # document score and degrade it where the row itself looks suspect.
        conf = invoice.confidence or 0.0
        if row.rate <= 0 or row.quantity <= 0:
            conf = min(conf, 0.5)
        out[key] = min(out.get(key, 1.0), conf)
    return out


def _flag_row(row: DraftRow) -> None:
    """Attach the reasons a human should look at this line."""
    reasons: List[str] = []

    if row.confidence < REVIEW_CONFIDENCE_THRESHOLD:
        reasons.append("low_confidence")
    if row.rate <= 0:
        reasons.append("missing_rate")
    if row.hours <= 0:
        reasons.append("missing_hours")
    if row.hours > 0 and row.rate > 0:
        expected = _r2(row.hours * row.rate)
        if expected > 0 and abs(row.amount - expected) / expected > 0.01:
            reasons.append("amount_mismatch")
    if not row.trade:
        reasons.append("missing_trade")

    row.review_reasons = reasons
    row.needs_review = bool(reasons)


def _build_deduction_lines(invoice: NormalizedInvoice) -> List[DeductionLine]:
    detail = invoice.deduction_detail
    lines: List[DeductionLine] = []

    if detail:
        # The open-ended breakdown is authoritative when present, because the
        # fixed mess/gas/transport/advance/absent fields are a lossy legacy
        # projection of it.
        if detail.breakdown:
            for label, amount in detail.breakdown.items():
                if _f(amount) == 0:
                    continue
                lines.append(DeductionLine(
                    line_id=str(uuid.uuid4()),
                    label=_s(label).replace("_", " ").title(),
                    amount=_r2(_f(amount)),
                ))
        else:
            for attr in ("mess", "gas", "transport", "advance", "absent", "other"):
                amount = _f(getattr(detail, attr, 0.0))
                if amount == 0:
                    continue
                lines.append(DeductionLine(
                    line_id=str(uuid.uuid4()),
                    label=attr.title(),
                    amount=_r2(amount),
                ))

    total_known = sum(l.amount for l in lines)
    reported = _r2(invoice.deductions)
    # The extractor read a deduction total it could not break down. Surface the
    # remainder as its own line instead of silently dropping it.
    if reported > 0 and abs(reported - total_known) > 0.01:
        lines.append(DeductionLine(
            line_id=str(uuid.uuid4()),
            label="Unallocated deduction",
            amount=_r2(reported - total_known),
        ))

    return lines


# ---------------------------------------------------------------------------
# Recompute: the single arithmetic implementation
# ---------------------------------------------------------------------------

def recompute(draft: Dict[str, Any]) -> Dict[str, Any]:
    """
    Recalculate every derived value from the editable fields.

    Safe to call on a draft that arrived from the browser with arbitrary
    values in the totals block - those are overwritten, never read.
    """
    vat_rate = _f(draft.get("vat_rate"), 0.05)
    if vat_rate > 1:  # user typed 5 meaning 5%
        vat_rate = vat_rate / 100.0
    vat_rate = max(0.0, min(vat_rate, 1.0))
    draft["vat_rate"] = vat_rate

    vat_basis = _s(draft.get("vat_basis")) or VAT_BASIS_ADJUSTED
    if vat_basis not in (VAT_BASIS_SUBTOTAL, VAT_BASIS_ADJUSTED):
        vat_basis = VAT_BASIS_ADJUSTED
    draft["vat_basis"] = vat_basis

    rows = [DraftRow.from_dict(r) for r in (draft.get("rows") or [])]
    live_rows = [r for r in rows if not r.removed]

    subtotal = 0.0
    for row in live_rows:
        if not row.amount_locked:
            row.amount = _r2(row.hours * row.rate)
        else:
            row.amount = _r2(row.amount)
        row.hours = _r2(row.hours)
        row.rate = round(row.rate, 4)
        _flag_row(row)
        subtotal += row.amount

    subtotal = _r2(subtotal)

    deduction_lines = [DeductionLine.from_dict(d) for d in (draft.get("deduction_lines") or [])]
    live_deductions = [d for d in deduction_lines if not d.removed]
    deductions = _r2(sum(_r2(d.amount) for d in live_deductions))

    adjusted_subtotal = _r2(subtotal - deductions)
    vat_base = subtotal if vat_basis == VAT_BASIS_SUBTOTAL else adjusted_subtotal
    vat = _r2(vat_base * vat_rate)
    deduction_vat = _r2(deductions * vat_rate)
    gross_total = _r2(subtotal + vat)
    net_total = _r2(subtotal + vat - deductions)

    draft["rows"] = [r.to_dict() for r in rows]
    draft["deduction_lines"] = [d.to_dict() for d in deduction_lines]
    draft["totals"] = {
        "subtotal": subtotal,
        "deductions": deductions,
        "deduction_vat": deduction_vat,
        "adjusted_subtotal": adjusted_subtotal,
        "vat_rate": vat_rate,
        "vat_basis": vat_basis,
        "vat": vat,
        "gross_total": gross_total,
        "net_total": net_total,
        "line_count": len(live_rows),
    }

    draft["blocking_issues"] = validate_draft(draft)
    draft["edit_summary"] = diff_against_original(draft)

    return draft


def validate_draft(draft: Dict[str, Any]) -> List[str]:
    """
    Reasons this draft must not be rendered yet.

    Distinct from row-level `needs_review` flags, which are advisory. These
    block the Approve button.
    """
    issues: List[str] = []
    totals = draft.get("totals") or {}
    rows = [r for r in (draft.get("rows") or []) if not r.get("removed")]

    if not rows:
        issues.append("Invoice has no line items.")

    for row in rows:
        if not _s(row.get("trade")):
            issues.append("Every line needs a trade or description.")
            break

    if _f(totals.get("subtotal")) <= 0:
        issues.append("Subtotal must be greater than zero.")

    if _f(totals.get("net_total")) < 0:
        issues.append("Net total is negative - check the deductions.")

    if _f(totals.get("deductions")) > _f(totals.get("subtotal")):
        issues.append("Deductions exceed the subtotal.")

    return issues


def diff_against_original(draft: Dict[str, Any]) -> Dict[str, Any]:
    """
    What the human changed. Feeds the audit log and, over time, tells you
    which supplier layouts the extractor keeps getting wrong.
    """
    original = draft.get("ai_original") or {}
    orig_rows = {r.get("row_id"): r for r in (original.get("rows") or [])}

    changed_fields: List[Dict[str, Any]] = []
    added = 0
    removed = 0

    for row in draft.get("rows") or []:
        row_id = row.get("row_id")
        if row.get("user_added"):
            added += 1
            continue
        if row.get("removed"):
            removed += 1
            continue
        before = orig_rows.get(row_id)
        if not before:
            continue
        for fieldname in ("trade", "project_id", "description", "hours", "rate", "amount"):
            old, new = before.get(fieldname), row.get(fieldname)
            if isinstance(old, float) or isinstance(new, float):
                if abs(_f(old) - _f(new)) < 0.005:
                    continue
            elif _s(old) == _s(new):
                continue
            changed_fields.append({
                "row_id": row_id,
                "field": fieldname,
                "from": old,
                "to": new,
            })

    totals = draft.get("totals") or {}
    subtotal_delta = _r2(_f(totals.get("subtotal")) - _f(original.get("subtotal")))
    net_delta = _r2(_f(totals.get("net_total")) - _f(original.get("net_total")))

    return {
        "edited": bool(changed_fields or added or removed) or abs(subtotal_delta) > 0.005,
        "changed_field_count": len(changed_fields),
        "rows_added": added,
        "rows_removed": removed,
        "subtotal_delta": subtotal_delta,
        "net_total_delta": net_delta,
        "changes": changed_fields[:200],
    }


# ---------------------------------------------------------------------------
# Render: draft -> ExtractionResult for the existing PDF writer
# ---------------------------------------------------------------------------

def draft_to_extraction_result(draft: Dict[str, Any], company_data: Optional[Dict[str, Any]] = None):
    """
    Convert an approved draft into the ExtractionResult the existing
    generator/pdf_writer.py already consumes.

    This mirrors main._normalized_to_extraction_result but reads from the
    user-approved draft instead of the raw extraction, and skips grouping
    because build_draft already grouped.
    """
    from schema import (
        ExtractionResult, InvoiceFinancials, InvoiceLayout,
        InvoiceRow, TimesheetFormat, TimesheetMetadata,
    )

    draft = recompute(draft)
    totals = draft["totals"]
    vat_rate = totals["vat_rate"]

    rows = []
    for raw in draft.get("rows") or []:
        if raw.get("removed"):
            continue
        inv_row = InvoiceRow(
            trade=_s(raw.get("trade")),
            hours=_f(raw.get("hours")),
            rate=_f(raw.get("rate")),
            amount=_f(raw.get("amount")),
            project_id=_s(raw.get("project_id")) or None,
            employee_id=";".join(raw.get("source_employee_ids") or []) or None,
        )
        inv_row.compute_vat(vat_rate)
        rows.append(inv_row)

    breakdown: Dict[str, float] = {}
    for line in draft.get("deduction_lines") or []:
        if line.get("removed"):
            continue
        label = _s(line.get("label")) or "Deduction"
        breakdown[label] = _r2(breakdown.get(label, 0.0) + _f(line.get("amount")))

    fin = InvoiceFinancials(
        subtotal=totals["subtotal"],
        total_deduction=totals["deductions"],
        deduction_vat=totals["deduction_vat"],
        adjusted_subtotal=totals["adjusted_subtotal"],
        total_vat=totals["vat"],
        gross_total=totals["gross_total"],
        net_payable=totals["net_total"],
        deduction_source="user_approved",
        summary_detected=True,
        deduction_breakdown=breakdown,
    )
    fin.deduction_total_with_vat = _r2(totals["deductions"] + totals["deduction_vat"])

    meta_src = draft.get("meta") or {}
    meta = TimesheetMetadata(
        client_name=_s(meta_src.get("client_name")) or None,
        client_trn=_s(meta_src.get("client_trn")) or None,
        period_month=_s(meta_src.get("period_month")) or None,
        source_invoice_no=_s(meta_src.get("source_invoice_no")) or None,
        currency=_s(meta_src.get("currency")) or "AED",
    )

    has_project = any(r.project_id for r in rows)
    layout = InvoiceLayout.PROJECT_BASED if has_project else InvoiceLayout.EMPLOYEE_BASED

    source = draft.get("source") or {}

    return ExtractionResult(
        success=True,
        format=TimesheetFormat.GENERIC,
        layout=layout,
        rows=rows,
        financials=fin,
        metadata=meta,
        # An approved draft is confirmed by a human, so the downstream
        # confidence gate should not second-guess it.
        confidence=1.0,
        used_ocr=_s(source.get("extraction_source")) in {"ocr", "hybrid"},
        used_vision=_s(source.get("extraction_source")) in {"vision", "hybrid"},
        raw_text="",
        warnings=[],
        error=None,
    )