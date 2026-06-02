"""
extractor.py  –  Universal timesheet extraction using Claude Vision API.

This module is the intelligence layer of the pipeline. It:
    1. Uses Claude Vision as the primary extraction engine for every PDF page
    2. Merges multi-page results into a single normalised payload without overwrite
    3. Falls back to pdfplumber table parsing only when Vision fails or returns no rows

Supports any timesheet layout:
  - MCC format: project-grouped rows (TRADE + PROJECT + HOURS + RATE + AMOUNT)
  - BKC format: employee rows (TRADE + EMPLOYEE_ID + HOURS + RATE + AMOUNT)
  - Any future format: the LLM adapts automatically

Output schema (always):
{
  "format": "mcc" | "bkc" | "unknown",
  "client": {
    "name": str,
    "trn": str | null,
    "po_box": str | null,
    "address": str | null,
    "tel": str | null,
    "fax": str | null,
    "email": str | null,
  },
  "timesheet_meta": {
    "invoice_no": str | null,
    "period_from": str | null,   # DD/MM/YYYY
    "period_to": str | null,
    "invoice_month": str | null, # e.g. "October 2025"
    "preparation_date": str | null,
    "timesheet_no": str | null,
  },
  "rows": [
    {
      "trade": str,
      "project_id": str | null,    # MCC format
      "employee_id": str | null,   # BKC format
      "hours": float,
      "rate": float,
      "amount": float,
    }
  ],
  "totals": {
    "subtotal": float,
    "deductions": float,
    "deduction_breakdown": {str: float},
    "net_total": float,
  }
}
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import re
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy imports – these are optional at import time
# ---------------------------------------------------------------------------

def _get_anthropic():
    import anthropic  # noqa: F401
    return anthropic

def _get_pdfplumber():
    import pdfplumber  # noqa: F401
    return pdfplumber

def _get_pdf2image():
    try:
        from pdf2image import convert_from_path
        return convert_from_path
    except ImportError:
        return None

def _get_pypdf():
    try:
        import pypdf
        return pypdf
    except ImportError:
        try:
            import PyPDF2 as pypdf  # type: ignore
            return pypdf
        except ImportError:
            return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_float(v: Any, default: float = 0.0) -> float:
    if v is None:
        return default
    if isinstance(v, (int, float)):
        return float(v)
    cleaned = re.sub(r"[^0-9.\-]", "", str(v))
    try:
        return float(cleaned) if cleaned else default
    except ValueError:
        return default


def _clean(v: Any) -> str:
    return " ".join(str(v or "").split())


def _pdf_page_to_b64_png(
    pdf_path: str,
    page_number: int,
    dpi: int = 180,
    rotation: int = 0,
) -> Optional[str]:
    """Rasterise a single PDF page and return base64-encoded PNG."""
    convert_from_path = _get_pdf2image()
    if convert_from_path is None:
        return None
    try:
        images = convert_from_path(pdf_path, first_page=page_number,
                                   last_page=page_number, dpi=dpi)
        if not images:
            return None
        if rotation:
            images[0] = images[0].rotate(rotation, expand=True)
        buf = io.BytesIO()
        images[0].save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception as e:
        logger.warning("pdf2image failed on page %d: %s", page_number, e)
        return None


def _image_file_to_b64(path: str) -> Tuple[str, str]:
    """Return (base64_data, media_type) for an image file."""
    ext = Path(path).suffix.lower()
    media_type = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }.get(ext, "image/png")
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8"), media_type


def _page_count(pdf_path: str) -> int:
    try:
        pdfplumber = _get_pdfplumber()
        with pdfplumber.open(pdf_path) as pdf:
            return len(pdf.pages)
    except Exception:
        return 1


def _has_extractable_text(pdf_path: str) -> bool:
    """Return True if pdfplumber can pull meaningful text from the PDF."""
    try:
        pdfplumber = _get_pdfplumber()
        with pdfplumber.open(pdf_path) as pdf:
            total = sum(len((p.extract_text() or "").strip()) for p in pdf.pages)
        return total > 200
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Claude Vision extraction prompt
# ---------------------------------------------------------------------------

EXTRACTION_SYSTEM = """You are a senior data-extraction AI specialising in construction
labour timesheet PDFs from the UAE. Your job is to extract structured data from a
timesheet image and return ONLY a valid JSON object — no markdown, no explanation,
no preamble, no trailing text.

The PDF may be one of several formats:
• MCC format – rows grouped by project (columns: TRADE, PROJECT, HOURS, RATE, AMOUNT)
• BKC format – rows per employee  (columns: TRADE/EMPLOYEE_NAME, EMPLOYEE_ID, HOURS, RATE, AMOUNT)
• Hybrid – attendance grid on page 1, summary table on page 2

Always prefer the SUMMARY TABLE at the bottom of the document over the attendance grid.

Return this exact JSON schema (use null for missing values, not empty strings):
{
  "format": "<mcc|bkc|unknown>",
  "client": {
    "name": "<company name this invoice is issued TO>",
    "trn": "<client TRN number or null>",
    "po_box": "<PO box number or null>",
    "address": "<full address or null>",
    "tel": "<telephone or null>",
    "fax": "<fax number or null>",
    "email": "<email or null>"
  },
  "timesheet_meta": {
    "invoice_no": "<invoice / timesheet number or null>",
    "period_from": "<DD/MM/YYYY or null>",
    "period_to": "<DD/MM/YYYY or null>",
    "invoice_month": "<Month YYYY e.g. October 2025 or null>",
    "preparation_date": "<date or null>",
    "timesheet_no": "<timesheet reference or null>"
  },
  "rows": [
    {
      "trade": "<UPPERCASE trade name e.g. CARPENTER, STEEL FIXER, TILE MASON, MASON>",
      "project_id": "<project code e.g. P1506 or null>",
      "employee_id": "<employee ID e.g. OS47009 or null>",
      "hours": <number>,
      "rate": <number>,
      "amount": <number>
    }
  ],
  "totals": {
    "subtotal": <number>,
    "deductions": <number>,
    "deduction_breakdown": {
      "<label>": <amount>
    },
    "net_total": <number>
  }
}

Extraction rules (priority order):
1) Use summary tables when present.
2) Otherwise aggregate attendance/grid rows into trade rows.
3) Never skip any visible trade row.
4) Include ALL trades even when repeated across pages.
5) Preserve project separation when project context exists.
6) Preserve employee IDs when available.
7) NEVER include rows where the trade name is any of the following — these are financial
   summary labels and MUST NOT appear in rows[]:
     TOTAL, SUBTOTAL, NET TOTAL, TOTAL DEDUCTION, VAT, GRAND TOTAL, SUMMARY,
     NET AMOUNT, GROSS TOTAL, DEDUCTION, DEDUCTIONS, BALANCE
8) Never truncate rows and always extract from all visible pages/sections.

Normalization rules:
- For MCC format: each row = one trade+project combination.
- For BKC format: each row = one trade+employee combination (use employee_id).
- Amounts must be plain floats (no commas), e.g. 2422.50 not "2,422.50".
"""

EXTRACTION_USER = """Extract all structured data from this timesheet image.
Return ONLY the JSON object, nothing else."""


# ---------------------------------------------------------------------------
# Vision-based extractor
# ---------------------------------------------------------------------------

_NON_TRADE_ROW_SIGNALS = {
    "TOTAL",
    "SUBTOTAL",
    "GRAND TOTAL",
    "NET TOTAL",
    "NET AMOUNT",
    "GROSS TOTAL",
    "DEDUCTION",
    "DEDUCTIONS",
    "TOTAL DEDUCTION",
    "VAT",
    "BALANCE",
    "SUMMARY",
}


def _is_non_trade_row(trade: str) -> bool:
    txt = _normalize_trade(trade)
    if not txt:
        return True
    return txt in _NON_TRADE_ROW_SIGNALS


def _normalize_trade(trade: Any) -> str:
    return _clean(trade).upper()


def _normalize_optional_id(value: Any) -> Optional[str]:
    cleaned = _clean(value)
    return cleaned if cleaned else None


def _rows_for_log(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        {
            "trade": _normalize_trade(r.get("trade")),
            "project_id": _normalize_optional_id(r.get("project_id")),
            "employee_id": _normalize_optional_id(r.get("employee_id")),
            "hours": _to_float(r.get("hours")),
            "rate": _to_float(r.get("rate")),
            "amount": _to_float(r.get("amount")),
        }
        for r in (rows or [])
    ]


def _clean_extracted_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cleaned_rows: List[Dict[str, Any]] = []
    for row in rows or []:
        trade = _normalize_trade(row.get("trade"))
        if not trade or _is_non_trade_row(trade):
            continue

        project_id = _normalize_optional_id(row.get("project_id"))
        employee_id = _normalize_optional_id(row.get("employee_id"))
        hours = _to_float(row.get("hours"))
        rate = _to_float(row.get("rate"))
        amount = _to_float(row.get("amount"))

        # Compute expected amount when both hours and rate are available
        if hours > 0 and rate > 0:
            expected = round(hours * rate, 2)
            if amount == 0:
                # No amount extracted at all — compute it
                amount = expected
            else:
                ratio = amount / expected
                # Detect OCR decimal-placement corruption:
                # e.g. expected=4450, extracted=4.45 → ratio≈0.001
                # e.g. expected=4450, extracted=44500 → ratio≈10
                if ratio < 0.1 or ratio > 10:
                    logger.warning(
                        "Amount sanity correction | trade=%s | extracted=%s | expected=%s",
                        trade,
                        amount,
                        expected,
                    )
                    amount = expected

        cleaned_rows.append({
            "trade": trade,
            "project_id": project_id,
            "employee_id": employee_id,
            "hours": hours,
            "rate": rate,
            "amount": amount,
        })

    return cleaned_rows


def _merge_financials(base: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    merged = {
        "subtotal": _to_float(base.get("subtotal")),
        "deductions": _to_float(base.get("deductions")),
        "deduction_breakdown": dict(base.get("deduction_breakdown", {})),
        "net_total": _to_float(base.get("net_total")),
    }

    in_subtotal = _to_float(incoming.get("subtotal"))
    in_deductions = _to_float(incoming.get("deductions"))
    in_net_total = _to_float(incoming.get("net_total"))

    if in_subtotal > 0:
        merged["subtotal"] = max(merged["subtotal"], in_subtotal)
    if in_deductions > 0:
        merged["deductions"] = max(merged["deductions"], in_deductions)
    if in_net_total > 0:
        merged["net_total"] = max(merged["net_total"], in_net_total)

    for label, value in (incoming.get("deduction_breakdown") or {}).items():
        label_key = _clean(label) or "DEDUCTION"
        merged["deduction_breakdown"][label_key] = (
            _to_float(merged["deduction_breakdown"].get(label_key)) + _to_float(value)
        )

    return merged


def merge_rows(rows: List[Dict[str, Any]], fmt: str = "unknown") -> List[Dict[str, Any]]:
    """
    Generalized merge engine.

    Rules:
      - mcc: merge key is (trade, project_id)
      - bkc: merge key is (trade)
      - fallback: merge key is (trade, project_id or employee_id)
    """
    logger.info(
        "Row lifecycle | stage=before_merge_raw | format=%s | count=%d | rows=%s",
        fmt,
        len(rows or []),
        json.dumps(_rows_for_log(rows or []), ensure_ascii=True),
    )

    cleaned_rows = _clean_extracted_rows(rows)
    logger.info(
        "Row lifecycle | stage=before_merge | format=%s | count=%d | rows=%s",
        fmt,
        len(cleaned_rows),
        json.dumps(_rows_for_log(cleaned_rows), ensure_ascii=True),
    )

    merged_map: Dict[Tuple[str, ...], Dict[str, Any]] = {}

    def _merge_employee_ids(current: Optional[str], incoming: Optional[str]) -> Optional[str]:
        current_clean = _normalize_optional_id(current)
        incoming_clean = _normalize_optional_id(incoming)
        if not current_clean:
            return incoming_clean
        if not incoming_clean:
            return current_clean
        existing = {part.strip() for part in current_clean.split(",") if part.strip()}
        for part in incoming_clean.split(","):
            p = part.strip()
            if p:
                existing.add(p)
        return ", ".join(sorted(existing)) if existing else None

    for row in cleaned_rows:
        trade = _normalize_trade(row.get("trade"))
        # Hard-block: financial summary rows must never enter the merge map
        if _is_non_trade_row(trade):
            logger.warning("merge_rows: skipping financial row trade=%r", trade)
            continue
        project_id = _normalize_optional_id(row.get("project_id"))
        employee_id = _normalize_optional_id(row.get("employee_id"))

        if fmt == "mcc":
            key = (trade, project_id or "")
        elif fmt == "bkc":
            key = (trade,)
        else:
            key = (trade, project_id or employee_id or "")

        if key not in merged_map:
            merged_map[key] = {
                "trade": trade,
                "project_id": project_id,
                "employee_id": employee_id,
                "hours": _to_float(row.get("hours")),
                "rate": _to_float(row.get("rate")),
                "amount": _to_float(row.get("amount")),
            }
            continue

        target = merged_map[key]
        incoming_hours = _to_float(row.get("hours"))
        incoming_amount = _to_float(row.get("amount"))
        incoming_rate = _to_float(row.get("rate"))

        target["hours"] = round(_to_float(target.get("hours")) + incoming_hours, 2)
        target["amount"] = round(_to_float(target.get("amount")) + incoming_amount, 2)

        if not target.get("project_id") and project_id:
            target["project_id"] = project_id
        target["employee_id"] = _merge_employee_ids(target.get("employee_id"), employee_id)

        if _to_float(target.get("rate")) <= 0 and incoming_rate > 0:
            target["rate"] = incoming_rate
        elif _to_float(target.get("hours")) > 0 and _to_float(target.get("amount")) > 0:
            target["rate"] = round(_to_float(target.get("amount")) / _to_float(target.get("hours")), 2)

    merged_rows = list(merged_map.values())
    logger.info(
        "Row lifecycle | stage=after_merge | format=%s | count=%d | rows=%s",
        fmt,
        len(merged_rows),
        json.dumps(_rows_for_log(merged_rows), ensure_ascii=True),
    )
    return merged_rows


def _extract_vision_json_from_b64(
    client: Any,
    b64: str,
    model: str,
    media_type: str = "image/png",
) -> Optional[Dict[str, Any]]:
    response = client.messages.create(
        model=model,
        max_tokens=4096,
        system=EXTRACTION_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": b64,
                        },
                    },
                    {"type": "text", "text": EXTRACTION_USER},
                ],
            }
        ],
    )
    raw = response.content[0].text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)

def _extract_via_vision(
    pdf_path: str,
    api_key: Optional[str] = None,
    model: str = "claude-opus-4-5",
) -> Optional[Dict[str, Any]]:
    """
    Send PDF pages as images to Claude Vision and extract structured JSON.
    Tries to merge multi-page responses intelligently.
    """
    anthropic_mod = _get_anthropic()
    key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
    client = anthropic_mod.Anthropic(api_key=key)

    n_pages = _page_count(pdf_path)
    page_extractions: List[Dict[str, Any]] = []

    for page_num in range(1, n_pages + 1):
        logger.info("Sending page %d/%d to Claude Vision...", page_num, n_pages)
        best_page: Optional[Dict[str, Any]] = None
        best_row_count = -1

        # First pass: as-is orientation
        b64 = _pdf_page_to_b64_png(pdf_path, page_num, dpi=220, rotation=0)
        if b64 is None:
            logger.warning("Could not rasterise page %d – skipping", page_num)
            continue

        try:
            parsed = _extract_vision_json_from_b64(client, b64=b64, model=model)
            parsed_rows = _clean_extracted_rows(parsed.get("rows", []))
            parsed["rows"] = parsed_rows
            best_page = parsed
            best_row_count = len(parsed_rows)
        except Exception as e:
            logger.warning("Vision extraction failed on page %d (rotation=0): %s", page_num, e)

        # Rotation retries when initial extraction is weak/empty (rotated scans, low OCR quality)
        if best_row_count <= 0:
            for rotation in (90, 270, 180):
                rotated_b64 = _pdf_page_to_b64_png(pdf_path, page_num, dpi=220, rotation=rotation)
                if rotated_b64 is None:
                    continue
                try:
                    parsed = _extract_vision_json_from_b64(client, b64=rotated_b64, model=model)
                    parsed_rows = _clean_extracted_rows(parsed.get("rows", []))
                    parsed["rows"] = parsed_rows
                    if len(parsed_rows) > best_row_count:
                        best_page = parsed
                        best_row_count = len(parsed_rows)
                except Exception as e:
                    logger.warning("Vision extraction failed on page %d (rotation=%d): %s", page_num, rotation, e)

        if best_page is not None:
            page_extractions.append(best_page)
            logger.info("Page %d: %d rows extracted", page_num, len(best_page.get("rows", [])))

    if not page_extractions:
        return None

    return _merge_page_extractions(page_extractions)


# ---------------------------------------------------------------------------
# pdfplumber fallback (for clean text-based PDFs with structured summary tables)
# ---------------------------------------------------------------------------

_SUMMARY_HEADER_SIGNALS = {"trade", "hour", "rate", "amount"}

def _extract_via_pdfplumber(pdf_path: str) -> Optional[Dict[str, Any]]:
    """
    Fast path: use pdfplumber table extraction when the PDF has a text layer.
    Looks for a summary table with TRADE / HOUR / RATE / AMOUNT columns.
    """
    pdfplumber = _get_pdfplumber()
    rows: List[Dict[str, Any]] = []
    financials: Dict[str, Any] = {}
    meta_text = ""

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            meta_text += "\n" + page_text
            tables = page.extract_tables()
            for table in tables:
                if not table or len(table) < 2:
                    continue
                header = " ".join(_clean(c).lower() for c in (table[0] or []) if c)
                hits = sum(1 for s in _SUMMARY_HEADER_SIGNALS if s in header)
                if hits < 2:
                    continue
                # This looks like a summary table
                parsed, fin = _parse_pdfplumber_summary(table)
                if parsed:
                    rows.extend(parsed)
                if fin:
                    financials = _merge_financials(financials, fin)

    if not rows:
        return None

    meta = _extract_meta_from_text(meta_text)
    client_info = _extract_client_from_text(meta_text)
    rows = _clean_extracted_rows(rows)
    detected_format = _detect_format_from_rows(rows)

    return _build_payload(detected_format, client_info, meta, rows, financials)


def _parse_pdfplumber_summary(
    table: List[List[Optional[str]]],
) -> Tuple[List[Dict], Dict]:
    rows: List[Dict[str, Any]] = []
    financials: Dict[str, Any] = {
        "subtotal": 0.0, "deductions": 0.0,
        "deduction_breakdown": {}, "net_total": 0.0,
    }

    # Find header row
    hdr_idx = 0
    for i, row in enumerate(table):
        txt = " ".join(_clean(c).lower() for c in (row or []) if c)
        if "trade" in txt and ("hour" in txt or "amount" in txt):
            hdr_idx = i
            break

    # Map column positions
    hdr = [_clean(c).lower() for c in (table[hdr_idx] or [])]
    col = {name: hdr.index(name) for name in hdr if name}

    def _ci(names: List[str]) -> int:
        for n in names:
            for k, v in col.items():
                if n in k:
                    return v
        return -1

    i_trade   = _ci(["trade"])
    i_project = _ci(["project"])
    i_emp     = _ci(["employee", "id no", "id_no", "emp"])
    i_hours   = _ci(["hour"])
    i_rate    = _ci(["rate"])
    i_amount  = _ci(["amount"])

    _FINANCIAL_SIGNALS = {
        "total deduction", "gross total", "net amount", "net total",
        "addition", "deduction",
    }

    def _get(row: List, idx: int) -> str:
        if idx < -len(row) or idx >= len(row):
            return ""
        return _clean(row[idx])

    for row in table[hdr_idx + 1:]:
        if not row:
            continue
        trade = _get(row, i_trade).upper()
        if not trade:
            continue

        # Financial summary rows
        lower_trade = trade.lower()
        if any(s in lower_trade for s in _FINANCIAL_SIGNALS) or trade == "TOTAL":
            last_val = _to_float(_get(row, -1))
            if "deduction" in lower_trade and "total" in lower_trade:
                financials["deductions"] = last_val
            elif "net" in lower_trade:
                financials["net_total"] = last_val
            elif "total" == lower_trade:
                financials["subtotal"] = last_val
            elif "deduction" in lower_trade:
                label = _get(row, i_project if i_project >= 0 else 1) or trade
                financials["deduction_breakdown"][label] = last_val
                financials["deductions"] += last_val
            continue

        hours  = _to_float(_get(row, i_hours))
        rate   = _to_float(_get(row, i_rate))
        amount = _to_float(_get(row, i_amount))

        rows.append({
            "trade":       trade,
            "project_id":  _get(row, i_project) or None,
            "employee_id": _get(row, i_emp) or None,
            "hours":       hours,
            "rate":        rate,
            "amount":      amount,
        })

    return _clean_extracted_rows(rows), financials


# ---------------------------------------------------------------------------
# Metadata / client extraction from raw text
# ---------------------------------------------------------------------------

_INVOICE_NO_RE  = re.compile(r"Invoice\s+No[.#\s]*(\S+)", re.I)
_PERIOD_RE      = re.compile(r"(\d{2}/\d{2}/\d{4})\s+to\s+(\d{2}/\d{2}/\d{4})", re.I)
_TRN_RE         = re.compile(r"TRN[:\s#]+(\d{10,15})", re.I)
_TS_NO_RE       = re.compile(r"Timesheet\s+No[.:\s]*(\S+)", re.I)
_MONTH_RE       = re.compile(
    r"(?:month\s+of|for\s+the\s+month\s+of)\s+([A-Z]+\s+\d{4})", re.I
)
_PREP_DATE_RE   = re.compile(r"Preparation\s+Date\s*[:\s]+(\S+.*?\d{4})", re.I)
_PERIOD_MONTH_RE = re.compile(
    r"(?:TIMESHEET|Time\s+Sheet)\s+FOR\s+THE\s+MONTH\s+OF\s+([A-Z]+\s+\d{4})", re.I
)


def _extract_meta_from_text(text: str) -> Dict[str, Any]:
    meta: Dict[str, Any] = {}

    m = _INVOICE_NO_RE.search(text)
    if m:
        meta["invoice_no"] = m.group(1).strip()

    m = _PERIOD_RE.search(text)
    if m:
        meta["period_from"] = m.group(1)
        meta["period_to"]   = m.group(2)

    m = _MONTH_RE.search(text) or _PERIOD_MONTH_RE.search(text)
    if m:
        meta["invoice_month"] = m.group(1).strip().title()

    m = _TS_NO_RE.search(text)
    if m:
        meta["timesheet_no"] = m.group(1).strip()

    m = _PREP_DATE_RE.search(text)
    if m:
        meta["preparation_date"] = m.group(1).strip()

    return meta


_CLIENT_NAME_RE = re.compile(
    r"(?:Issued\s+To|SUB-CONTRACTOR\s*:\s*\S+\s+)(.*?)(?:\n|TRN|P\.O\.)", re.I | re.S
)
_PO_BOX_RE  = re.compile(r"P\.?\s*O\.?\s*Box[:\s#]*(\S+)", re.I)
_TEL_RE     = re.compile(r"T(?:el)?[:\s+]+([+\d\s\-]{7,})", re.I)
_FAX_RE     = re.compile(r"F(?:ax)?[:\s]+([+\d\s\-]{7,})", re.I)
_EMAIL_RE   = re.compile(r"[\w.+-]+@[\w.-]+\.\w+")


def _extract_client_from_text(text: str) -> Dict[str, Any]:
    client: Dict[str, Any] = {}

    m = _CLIENT_NAME_RE.search(text)
    if m:
        client["name"] = " ".join(m.group(1).split())

    trns = _TRN_RE.findall(text)
    if trns:
        client["trn"] = trns[0]

    m = _PO_BOX_RE.search(text)
    if m:
        client["po_box"] = m.group(1).strip().rstrip(",")

    m = _TEL_RE.search(text)
    if m:
        client["tel"] = m.group(1).strip()

    m = _FAX_RE.search(text)
    if m:
        client["fax"] = m.group(1).strip()

    m = _EMAIL_RE.search(text)
    if m:
        client["email"] = m.group(0).strip()

    return client


# ---------------------------------------------------------------------------
# Format detection
# ---------------------------------------------------------------------------

def _detect_format_from_rows(rows: List[Dict]) -> str:
    has_project  = any(r.get("project_id") for r in rows)
    has_employee = any(r.get("employee_id") for r in rows)
    if has_project:
        return "mcc"
    if has_employee:
        return "bkc"
    return "unknown"


# ---------------------------------------------------------------------------
# Multi-page merge
# ---------------------------------------------------------------------------

def _merge_page_extractions(pages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
        Merge extractions from multiple pages.
        Strategy:
            - Collect rows from ALL pages
            - Merge metadata/client by first non-empty value
            - Merge totals conservatively without overwriting with zeros
            - Never replace one page's rows with another page's rows
    """
    merged: Dict[str, Any] = {
        "format": "unknown",
        "client": {},
        "timesheet_meta": {},
        "rows": [],
        "totals": {
            "subtotal": 0.0,
            "deductions": 0.0,
            "deduction_breakdown": {},
            "net_total": 0.0,
        },
    }

    for page in pages:
        page_fmt = str(page.get("format") or "unknown").lower()
        if page_fmt != "unknown" and merged["format"] == "unknown":
            merged["format"] = page_fmt

        for k, v in page.get("client", {}).items():
            if v and not merged["client"].get(k):
                merged["client"][k] = v

        for k, v in page.get("timesheet_meta", {}).items():
            if v and not merged["timesheet_meta"].get(k):
                merged["timesheet_meta"][k] = v

        merged["rows"].extend(_clean_extracted_rows(page.get("rows", [])))
        merged["totals"] = _merge_financials(merged["totals"], page.get("totals", {}))

    if merged["format"] == "unknown":
        merged["format"] = _detect_format_from_rows(merged["rows"])

    return merged


# ---------------------------------------------------------------------------
# Payload builder
# ---------------------------------------------------------------------------

def _build_payload(
    fmt: str,
    client: Dict[str, Any],
    meta: Dict[str, Any],
    rows: List[Dict[str, Any]],
    financials: Dict[str, Any],
) -> Dict[str, Any]:
    subtotal = financials.get("subtotal") or sum(_to_float(r.get("amount")) for r in rows)
    return {
        "format":         fmt,
        "client":         client,
        "timesheet_meta": meta,
        "rows":           rows,
        "totals": {
            "subtotal":            round(subtotal, 2),
            "deductions":          round(financials.get("deductions", 0.0), 2),
            "deduction_breakdown": financials.get("deduction_breakdown", {}),
            "net_total":           round(financials.get("net_total", 0.0) or subtotal - financials.get("deductions", 0.0), 2),
        },
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_timesheet(
    pdf_path: str,
    api_key: Optional[str] = None,
    force_vision: bool = False,
) -> Dict[str, Any]:
    """
    Universal timesheet extractor.

    Args:
        pdf_path:     Path to the timesheet PDF.
        api_key:      Anthropic API key (falls back to ANTHROPIC_API_KEY env var).
        force_vision: Always use Vision API even if text layer is present.

    Returns:
        Normalised extraction dict matching the schema at the top of this file.
        On failure, returns {"success": False, "error": "..."}.
    """
    if not os.path.exists(pdf_path):
        return {"success": False, "error": f"File not found: {pdf_path}"}

    result: Optional[Dict[str, Any]] = None

    # ── Primary path: Claude Vision API ───────────────────────────────────
    logger.info("Using Claude Vision API as primary extraction engine")
    try:
        result = _extract_via_vision(pdf_path, api_key=api_key)
    except Exception as e:
        logger.warning("Vision extraction failed: %s", e)
        result = None

    # ── Fallback path: pdfplumber only when Vision fails or yields no rows ─
    if not force_vision and (result is None or not result.get("rows")):
        logger.info("Falling back to pdfplumber extraction")
        try:
            fallback = _extract_via_pdfplumber(pdf_path)
            if fallback and fallback.get("rows"):
                result = fallback
                logger.info("pdfplumber fallback extracted %d rows", len(result.get("rows", [])))
        except Exception as e:
            logger.warning("pdfplumber fallback failed: %s", e)

    if not result:
        return {"success": False, "error": "No data could be extracted from the timesheet"}

    # Normalise and return
    result["success"] = True
    result.setdefault("format",         "unknown")
    result.setdefault("client",         {})
    result.setdefault("timesheet_meta", {})
    result.setdefault("rows",           [])
    result.setdefault("totals",         {"subtotal": 0, "deductions": 0,
                                         "deduction_breakdown": {}, "net_total": 0})

    result["rows"] = merge_rows(result.get("rows", []), fmt=str(result.get("format") or "unknown").lower())
    logger.info(
        "FINAL VERIFIED ROWS: %s",
        json.dumps(_rows_for_log(result.get("rows", [])), ensure_ascii=True),
    )
    logger.info(
        "Row lifecycle | stage=extractor_final_rows | format=%s | count=%d | rows=%s",
        str(result.get("format") or "unknown").lower(),
        len(result.get("rows", [])),
        json.dumps(_rows_for_log(result.get("rows", [])), ensure_ascii=True),
    )
    if result.get("format") == "unknown":
        result["format"] = _detect_format_from_rows(result["rows"])

    row_subtotal = round(sum(_to_float(r.get("amount")) for r in result.get("rows", [])), 2)
    totals = result.get("totals", {})
    deductions = _to_float(totals.get("deductions"))
    totals["subtotal"] = round(max(_to_float(totals.get("subtotal")), row_subtotal), 2)
    if _to_float(totals.get("net_total")) <= 0:
        totals["net_total"] = round(max(totals["subtotal"] - deductions, 0.0), 2)
    totals.setdefault("deduction_breakdown", {})
    result["totals"] = totals

    return result
