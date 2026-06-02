"""
extractor.py  –  Universal timesheet extraction using Claude Vision API.

This module is the intelligence layer of the pipeline. It:
  1. Converts every PDF page to an image (handles both text-based and scanned PDFs)
  2. Sends the image to Claude with a structured prompt asking for JSON extraction
  3. Merges multi-page results into a single normalised payload
  4. Falls back to pdfplumber structured table parsing for clean text-based PDFs

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


def _pdf_page_to_b64_png(pdf_path: str, page_number: int, dpi: int = 180) -> Optional[str]:
    """Rasterise a single PDF page and return base64-encoded PNG."""
    convert_from_path = _get_pdf2image()
    if convert_from_path is None:
        return None
    try:
        images = convert_from_path(pdf_path, first_page=page_number,
                                   last_page=page_number, dpi=dpi)
        if not images:
            return None
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

Rules:
- Extract ONLY from the summary table, not from the attendance grid
- For MCC format: each row = one trade+project combination
- For BKC format: each row = one trade+employee combination (use employee_id field)
- Amounts must be plain floats (no commas), e.g. 2422.50 not "2,422.50"
- If no summary table exists, aggregate hours from the attendance grid by trade
- Always include ALL data rows; never truncate
"""

EXTRACTION_USER = """Extract all structured data from this timesheet image.
Return ONLY the JSON object, nothing else."""


# ---------------------------------------------------------------------------
# Vision-based extractor
# ---------------------------------------------------------------------------

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
        b64 = _pdf_page_to_b64_png(pdf_path, page_num, dpi=200)
        if b64 is None:
            logger.warning("Could not rasterise page %d – skipping", page_num)
            continue

        logger.info("Sending page %d/%d to Claude Vision...", page_num, n_pages)
        try:
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
                                    "media_type": "image/png",
                                    "data": b64,
                                },
                            },
                            {"type": "text", "text": EXTRACTION_USER},
                        ],
                    }
                ],
            )
            raw = response.content[0].text.strip()
            # Strip markdown fences if model wraps output
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
            parsed = json.loads(raw)
            page_extractions.append(parsed)
            logger.info("Page %d: %d rows extracted", page_num, len(parsed.get("rows", [])))
        except json.JSONDecodeError as e:
            logger.error("JSON parse error on page %d: %s", page_num, e)
        except Exception as e:
            logger.error("Vision API error on page %d: %s", page_num, e)

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
                    rows = parsed
                    financials = fin

    if not rows:
        return None

    meta = _extract_meta_from_text(meta_text)
    client_info = _extract_client_from_text(meta_text)
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
        if idx < 0 or idx >= len(row):
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
        if hours == 0 and amount == 0:
            continue

        rows.append({
            "trade":       trade,
            "project_id":  _get(row, i_project) or None,
            "employee_id": _get(row, i_emp) or None,
            "hours":       hours,
            "rate":        rate,
            "amount":      amount,
        })

    return rows, financials


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
      - Prefer the page with the most rows (summary page)
      - For metadata/client: take first non-null value across pages
      - Deduplication: if the same rows appear on multiple pages, keep unique set
    """
    if len(pages) == 1:
        return pages[0]

    # Pick best page (most rows) as base
    best = max(pages, key=lambda p: len(p.get("rows", [])))
    merged = json.loads(json.dumps(best))  # deep copy

    # Fill missing metadata from other pages
    for page in pages:
        if page is best:
            continue
        # client fields
        for k, v in page.get("client", {}).items():
            if v and not merged.get("client", {}).get(k):
                merged.setdefault("client", {})[k] = v
        # timesheet_meta fields
        for k, v in page.get("timesheet_meta", {}).items():
            if v and not merged.get("timesheet_meta", {}).get(k):
                merged.setdefault("timesheet_meta", {})[k] = v
        # format
        if page.get("format") and page["format"] != "unknown" and merged.get("format") == "unknown":
            merged["format"] = page["format"]
        # rows: merge if best page had few rows and this page has more
        if len(page.get("rows", [])) > len(merged.get("rows", [])):
            merged["rows"] = page["rows"]
        # totals: merge if best page had zeroes
        page_totals = page.get("totals", {})
        merged_totals = merged.get("totals", {})
        for k in ("subtotal", "deductions", "net_total"):
            if page_totals.get(k, 0) > 0 and merged_totals.get(k, 0) == 0:
                merged_totals[k] = page_totals[k]
        if page_totals.get("deduction_breakdown"):
            merged_totals.setdefault("deduction_breakdown", {}).update(
                page_totals["deduction_breakdown"]
            )

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

    # ── Fast path: pdfplumber for text-based PDFs ──────────────────────────
    if not force_vision and _has_extractable_text(pdf_path):
        logger.info("Text layer detected – trying pdfplumber fast path")
        try:
            result = _extract_via_pdfplumber(pdf_path)
            if result:
                logger.info("pdfplumber extracted %d rows", len(result.get("rows", [])))
        except Exception as e:
            logger.warning("pdfplumber fast path failed: %s", e)
            result = None

    # ── Vision path: Claude Vision API ────────────────────────────────────
    if result is None or not result.get("rows"):
        logger.info("Using Claude Vision API for extraction")
        try:
            result = _extract_via_vision(pdf_path, api_key=api_key)
        except Exception as e:
            logger.error("Vision extraction failed: %s", e)
            return {"success": False, "error": str(e)}

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
    return result
