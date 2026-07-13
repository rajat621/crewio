"""
native_extractor.py

STEP 2a — Native PDF extraction for DIGITAL documents.

Uses pdfplumber (primary) with semantic table parsing.
Does NOT use OCR or Vision.
Does NOT hardcode column positions or contractor names.

Produces NormalizedInvoice directly.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from normalized_output import (
    NormalizedDeductions,
    NormalizedInvoice,
    NormalizedInvoiceRow,
    repair_row,
    sanity_check_row,
)

logger = logging.getLogger(__name__)

_PROJECT_CODE_RE = re.compile(r"\bP\d{2,10}[A-Z0-9-]*\b", re.I)


# ---------------------------------------------------------------------------
# Semantic header aliases (generalizes across all known UAE timesheet formats)
# ---------------------------------------------------------------------------

_TRADE_ALIASES = {
    "trade", "designation", "craft", "position", "labour", "labor",
    "worker type", "job type", "occupation", "skill",
}
_HOURS_ALIASES = {
    "hours", "hrs", "no of hours", "total hours", "qty", "quantity",
    "days worked", "days", "working days", "duration",
}
_RATE_ALIASES = {
    "rate", "unit price", "hourly rate", "daily rate", "price", "wage",
}
_AMOUNT_ALIASES = {
    "amount", "total", "subtotal", "earned", "gross", "payable", "value",
    "amount aed", "total amount",
}
_EMPLOYEE_ALIASES = {
    "employee", "employee name", "worker", "name", "id", "emp id",
    "employee id", "labour code", "worker id",
}
_PROJECT_ALIASES = {
    "project", "project id", "project no", "site", "po", "contract",
}
_DEDUCTION_KEYWORDS = {
    "deduction", "deductions", "absent amount", "total deduction",
    "food", "mess", "gas", "transport", "advance", "loan", "penalty", "fine",
}
_FINANCIAL_LABELS = {
    "subtotal", "gross total", "vat", "net payable", "net amount",
    "net amount payable", "total deduction", "amount payable",
}


def _normalize(text: str) -> str:
    return " ".join((text or "").lower().split())


def _to_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = re.sub(r"[^0-9.\-]", "", str(value).replace(",", ""))
    try:
        return float(cleaned) if cleaned and cleaned != "." else 0.0
    except ValueError:
        return 0.0


def _match_semantic(header: str, aliases: set) -> bool:
    norm = _normalize(header)
    return any(alias in norm for alias in aliases)


def _detect_column_mapping(header_row: List[str]) -> Dict[str, int]:
    """
    Detect column semantics from a header row without hardcoding positions.
    Returns mapping of semantic_name -> column_index.
    """
    mapping: Dict[str, int] = {}
    for idx, cell in enumerate(header_row):
        if not cell:
            continue
        h = _normalize(str(cell))
        if _match_semantic(h, _TRADE_ALIASES) and "trade" not in mapping:
            mapping["trade"] = idx
        elif _match_semantic(h, _EMPLOYEE_ALIASES) and "employee" not in mapping:
            mapping["employee"] = idx
        elif _match_semantic(h, _HOURS_ALIASES) and "hours" not in mapping:
            mapping["hours"] = idx
        elif _match_semantic(h, _RATE_ALIASES) and "rate" not in mapping:
            mapping["rate"] = idx
        elif _match_semantic(h, _AMOUNT_ALIASES) and "amount" not in mapping:
            mapping["amount"] = idx
        elif _match_semantic(h, _PROJECT_ALIASES) and "project" not in mapping:
            mapping["project"] = idx
    return mapping


def _infer_row_kind(mapping: Dict[str, int]) -> str:
    if "employee" in mapping:
        return "employee"
    if "project" in mapping and "trade" in mapping:
        return "billing_summary"
    if "trade" in mapping:
        return "trade_summary"
    return "unknown"


def _is_data_row(cells: List[str], mapping: Dict[str, int]) -> bool:
    """Returns True if this row looks like a labour data row (not header/total/metadata)."""
    if not any(c.strip() for c in cells):
        return False

    # Reject if first non-empty cell matches financial labels
    for cell in cells:
        norm = _normalize(str(cell))
        if norm in _FINANCIAL_LABELS or norm in _DEDUCTION_KEYWORDS:
            return False

    # Need at least one numeric value
    nums = sum(1 for c in cells if re.search(r"\d", str(c or "")))
    return nums >= 1


def _extract_financials_from_text(full_text: str) -> Dict[str, float]:
    """
    Extract financial totals from unstructured text using semantic patterns.
    Works across all layouts — no hardcoded positions.
    """
    fin: Dict[str, float] = {}
    patterns = [
        (r"(?:total\s+deduction|absent\s+amount)[^\d]*(\d[\d,\.]+)", "total_deduction"),
        (r"(?:subtotal|sub\s*total|gross\s+total)[^\d]*(\d[\d,\.]+)", "subtotal"),
        (r"vat\s+amount[^\d]*(\d[\d,\.]+)", "vat"),
        (r"(?:net\s+payable|net\s+amount\s+payable|net\s+amount)[^\d]*(\d[\d,\.]+)", "net_payable"),
        (r"(?:gross\s+total)[^\d]*(\d[\d,\.]+)", "gross_total"),
    ]
    text_lower = full_text.lower()
    for pattern, key in patterns:
        match = re.search(pattern, text_lower)
        if match:
            val = _to_float(match.group(1))
            if val > 0:
                fin[key] = val
    return fin


def extract_native(pdf_path: str) -> NormalizedInvoice:
    """
    Extract from a digital PDF using pdfplumber.

    Generalizes to any timesheet layout by using semantic column detection.
    Returns a NormalizedInvoice ready for the renderer.
    """
    try:
        import pdfplumber
    except ImportError:
        result = NormalizedInvoice()
        result.error = "pdfplumber_not_available"
        return result

    invoice = NormalizedInvoice()
    invoice.extraction_source = "native_pdf"

    all_rows: List[NormalizedInvoiceRow] = []
    full_text_parts: List[str] = []

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_idx, page in enumerate(pdf.pages, 1):
                page_text = page.extract_text() or ""
                full_text_parts.append(page_text)

                tables = page.extract_tables() or []
                for table in tables:
                    if not table or len(table) < 2:
                        continue
                    rows = _parse_table(table, page_idx)
                    all_rows.extend(rows)

        full_text = "\n".join(full_text_parts)

        # Parse financial totals from text if not found in tables
        fin = _extract_financials_from_text(full_text)

        # Extract metadata
        invoice.client_name = _extract_metadata_field(
            full_text, [r"m/s\.?\s+(.+?)(?:\n|trn|p\.o\.)", r"client\s*:\s*(.+?)(?:\n|trn)"]
        )
        invoice.period_month = _extract_metadata_field(
            full_text, [r"(?:for the month of|month\s*:)\s*([A-Z][a-z]+\s+\d{4})"]
        )
        invoice.invoice_no = _extract_metadata_field(
            full_text, [r"invoice\s*no\.?\s*[:#]?\s*(\w+)"]
        )
        invoice.client_trn = _extract_metadata_field(
            full_text, [r"trn\s*[:#]?\s*(\d{10,})"]
        )

    except Exception as exc:
        logger.exception("native_extract failed: %s", exc)
        invoice.error = str(exc)
        return invoice

    # Validate and repair rows
    valid_rows: List[NormalizedInvoiceRow] = []
    for row in all_rows:
        violations = sanity_check_row(row)
        if violations:
            invoice.warnings.append(f"row_rejected:{row.description}:{','.join(violations)}")
            continue
        row, repairs = repair_row(row)
        if repairs:
            invoice.warnings.extend([f"repair:{r}" for r in repairs])
        valid_rows.append(row)

    invoice.invoice_rows = valid_rows

    # Compute financials
    row_subtotal = round(sum(r.amount for r in valid_rows), 2)
    invoice.subtotal = fin.get("subtotal") or row_subtotal
    invoice.deductions = fin.get("total_deduction", 0.0)
    invoice.deduction_detail = NormalizedDeductions(total=invoice.deductions)
    adjusted = max(0.0, invoice.subtotal - invoice.deductions)

    vat_from_text = fin.get("vat", 0.0)
    invoice.vat = vat_from_text if vat_from_text > 0 else 0.0
    invoice.net_total = fin.get("net_payable") or round(adjusted + invoice.vat, 2)
    invoice.gross_total = fin.get("gross_total") or round(invoice.subtotal + invoice.vat, 2)
    invoice.confidence = 0.95 if valid_rows else 0.0

    logger.info(
        "native_extract complete rows=%d subtotal=%.2f confidence=%.2f",
        len(valid_rows), invoice.subtotal, invoice.confidence,
    )
    return invoice


def _parse_table(table: List[List[Any]], page_idx: int) -> List[NormalizedInvoiceRow]:
    """Parse a raw pdfplumber table into NormalizedInvoiceRows using semantic detection."""
    rows: List[NormalizedInvoiceRow] = []
    current_project_id = ""

    # Find header row (first row with recognizable column names)
    header_idx = -1
    mapping: Dict[str, int] = {}

    for i, row in enumerate(table[:8]):
        cells = [str(c or "").strip() for c in row]
        candidate = _detect_column_mapping(cells)
        has_trade = "trade" in candidate or "employee" in candidate
        has_value = "amount" in candidate or ("hours" in candidate and "rate" in candidate)
        if has_trade and has_value and len(candidate) >= 2:
            header_idx = i
            mapping = candidate
            break

    if not mapping:
        return rows

    row_kind = _infer_row_kind(mapping)

    start = header_idx + 1 if header_idx >= 0 else 0

    for raw_row in table[start:]:
        if not raw_row:
            continue
        cells = [str(c or "").strip() for c in raw_row]

        project_marker = ""
        if len(cells) >= 1:
            first_cell = cells[0].strip()
            if first_cell and _PROJECT_CODE_RE.fullmatch(first_cell):
                project_marker = first_cell

        # Some digital timesheets place the project code on its own line above
        # the labor rows. Carry that code forward until the next project block.
        if project_marker and not any(c.strip() for c in cells[1:]):
            current_project_id = project_marker
            continue

        if not _is_data_row(cells, mapping):
            continue

        def get(key: str) -> str:
            idx = mapping.get(key, -1)
            return cells[idx] if 0 <= idx < len(cells) else ""

        trade = get("trade") or get("employee")
        if not trade:
            continue

        hours = _to_float(get("hours"))
        rate = _to_float(get("rate"))
        amount = _to_float(get("amount"))

        # Derive missing values
        if amount <= 0 and hours > 0 and rate > 0:
            amount = round(hours * rate, 2)
        if hours <= 0 and amount > 0 and rate > 0:
            hours = round(amount / rate, 2)

        if amount <= 0:
            continue

        project = get("project")
        if not project:
            for cell in cells:
                match = _PROJECT_CODE_RE.search(cell or "")
                if match:
                    project = match.group(0).strip()
                    break
        if not project:
            project = current_project_id

        rows.append(NormalizedInvoiceRow(
            description=trade.upper(),
            quantity=hours,
            rate=rate,
            amount=amount,
            employee_id=get("employee") if "employee" in mapping and "trade" in mapping else "",
            project=project,
            row_kind=row_kind,
        ))

    return rows


def _extract_metadata_field(text: str, patterns: List[str]) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return " ".join(match.group(1).split()).strip()
    return ""