"""
vision_extractor.py

STEP 2b — Vision extraction using Gemini as the PRIMARY engine
for SCANNED and IMAGE PDFs.

Per spec:
  - Gemini Vision is PRIMARY for image PDFs
  - OCR is the FINAL FALLBACK only
  - Skip: table detector, cell extractor, grid reconstruction,
           row clustering, semantic assembler

Gemini understands table semantics directly from the image.
Returns NormalizedInvoice.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
from orientation import correct_pages
from normalized_output import (
    NormalizedDeductions,
    NormalizedInvoice,
    NormalizedInvoiceRow,
    repair_row,
    sanity_check_row,
)

logger = logging.getLogger(__name__)

_PROJECT_ID_RE = re.compile(r"^P\d{2,10}[A-Z0-9-]*$", re.I)
_EMPLOYEE_ID_RE = re.compile(r"^(EMP|E|ID|LAB|HI|NO)?[-\s]*\d{3,12}$", re.I)
_SUMMARY_TRADE_RE = re.compile(
    r"\b(total|subtotal|summary|gross\s*total|net\s*payable|vat|deduction)\b",
    re.I,
)

# ---------------------------------------------------------------------------
# Gemini prompt — semantic extraction, not OCR geometry
# ---------------------------------------------------------------------------

GEMINI_EXTRACTION_PROMPT = """
You are an expert construction timesheet extraction system.

Your task is to extract employee level labor information from any construction
timesheet regardless of layout, language, orientation or formatting.

IMPORTANT RULES:

1. Read ALL rows in the document.
2. Never skip employees.
3. Never merge adjacent employee rows.
4. Never copy profession from previous or next employee.
5. Profession belongs ONLY to the employee on the same row.
6. Project belongs ONLY to the employee on the same row.
7. Employee code belongs ONLY to the employee on the same row.
8. Preserve row alignment exactly as shown in the document.
9. Support:
   - scanned PDFs
   - image PDFs
   - computer generated PDFs
   - portrait pages
   - landscape pages
   - rotated pages
   - multi-page documents
   - summary tables
   - attendance grids
   - mixed layouts

Return valid JSON only.

Schema:

{
  "employees": [
    {
      "employee_id": "",
      "employee_name": "",
      "trade": "",
      "project_id": "",
      "days_worked": 0,
      "hours_worked": 0,
      "rate": 0,
      "amount": 0
    }
  ],
  "deductions": {
    "mess": 0,
    "gas": 0,
    "transport": 0,
    "advance": 0,
    "absent": 0,
    "other": 0,
    "total": 0
  },
  "subtotal": 0,
  "vat_rate": 0.05,
  "vat": 0,
  "gross_total": 0,
  "net_total": 0,
  "client_name": "",
  "period_month": "",
  "invoice_no": ""
}

Validation Rules:

- Sum of employee amounts should equal subtotal.
- Sum of employee hours should equal total hours.
- Verify employee trade belongs to the same visual row.
- Verify project belongs to the same visual row.
- Verify employee code belongs to the same visual row.

Return JSON only.
""".strip()


def _render_pdf_to_images(pdf_path: str, dpi: int = 120) -> List[Any]:
    """
    Render PDF pages to PIL Images.

    Optimized for Gemini Vision:
    - lower DPI to avoid memory explosion
    - disables PIL decompression protection
    - resizes huge pages before sending to Gemini
    """

    try:
        from pdf2image import convert_from_path
        from PIL import Image

        Image.MAX_IMAGE_PIXELS = None

        poppler_path = _find_poppler()

        kwargs = {
            "dpi": dpi,
            "thread_count": 1,
            "fmt": "jpeg",
        }

        if poppler_path:
            kwargs["poppler_path"] = poppler_path

        max_pages = int(
            os.getenv(
                "VISION_MAX_PAGES",
                "10"
            )
        )

        pages = convert_from_path(
            pdf_path,
            first_page=1,
            last_page=max_pages,
            **kwargs
        )

        processed = []

        for page in pages:

            page = page.convert("RGB")

            width, height = page.size

            max_side = 2000

            scale = min(
                max_side / width,
                max_side / height,
                1.0
            )

            if scale < 1:
                page = page.resize(
                    (
                        int(width * scale),
                        int(height * scale)
                    )
                )

            logger.info(
                "vision_page_size=%sx%s",
                page.size[0],
                page.size[1]
            )

            processed.append(page)

        return processed

    except Exception as exc:
        logger.warning(
            "PDF render failed: %s",
            exc
        )
        return []


def _find_poppler() -> Optional[str]:
    candidates = [
        r"C:\Program Files\poppler\Library\bin",
        r"C:\Program Files\poppler\bin",
    ]
    for c in candidates:
        if os.path.exists(os.path.join(c, "pdfinfo.exe")):
            return c
    return None


def _image_to_base64(
    image: Any,
    max_side: int = 2000
) -> str:

    width, height = image.size

    scale = min(
        max_side / width,
        max_side / height,
        1.0
    )

    if scale < 1:
        image = image.resize(
            (
                int(width * scale),
                int(height * scale)
            )
        )

    buffer = io.BytesIO()

    image.save(
        buffer,
        format="JPEG",
        quality=85,
        optimize=True,
    )

    return base64.b64encode(
        buffer.getvalue()
    ).decode("utf-8")


def _safe_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = re.sub(r"[^0-9.\-]", "", str(value).replace(",", ""))
    try:
        return float(cleaned) if cleaned and cleaned != "." else 0.0
    except Exception:
        return 0.0


def _looks_like_project_id(value: str) -> bool:
    return bool(_PROJECT_ID_RE.match((value or "").strip()))


def _looks_like_employee_id(value: str) -> bool:
    return bool(_EMPLOYEE_ID_RE.match((value or "").strip()))


def _is_summary_like_row(emp: Dict[str, Any], trade: str) -> bool:
    if _SUMMARY_TRADE_RE.search(trade or ""):
        return True
    name = str(emp.get("employee_name") or "").strip().lower()
    if any(token in name for token in ("total", "subtotal", "summary", "grand total")):
        return True
    # Summary-like rows usually have no identifiers and no workday evidence.
    days = _safe_float(emp.get("days_worked") or 0)
    hours = _safe_float(emp.get("hours_worked") or emp.get("quantity") or 0)
    amount = _safe_float(emp.get("amount") or 0)
    return days == 0 and hours == 0 and amount > 0


def _merge_multi_page_rows(rows: List[NormalizedInvoiceRow]) -> List[NormalizedInvoiceRow]:
    merged: Dict[tuple, NormalizedInvoiceRow] = {}
    for row in rows:
        employee_key = (row.employee_id or row.employee_name or "").strip().upper()
        key = (
            (row.description or "").strip().upper(),
            (row.project or "").strip().upper(),
            employee_key,
            round(float(row.rate or 0.0), 4),
        )
        if key not in merged:
            merged[key] = row
            continue
        cur = merged[key]
        cur.quantity = round(float(cur.quantity or 0.0) + float(row.quantity or 0.0), 2)
        cur.amount = round(float(cur.amount or 0.0) + float(row.amount or 0.0), 2)
        cur.days_worked = round(float(cur.days_worked or 0.0) + float(row.days_worked or 0.0), 2)
    return list(merged.values())

def _call_gemini(images: List[Any]) -> Optional[Dict[str, Any]]:
    """
    Call Gemini Vision API with all page images.
    Returns parsed JSON payload or None on failure.
    """
    print("CALLING GEMINI")
    api_key = (
        os.getenv("GOOGLE_API_KEY")
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_GENERATIVE_AI_API_KEY")
        or ""
    ).strip()

    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")

    model = os.getenv("VISION_MODEL", "gemini-2.5-flash")
    timeout_s = int(os.getenv("VISION_TIMEOUT_S", "120"))

    import requests

    parts: List[Dict[str, Any]] = [{"text": GEMINI_EXTRACTION_PROMPT}]
    for idx, image in enumerate(images, 1):
        parts.append({"text": f"Page {idx}:"})
        parts.append({
            "inline_data": {
                "mime_type": "image/png",
                "data": _image_to_base64(image),
            }
        })

    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": 0,
            "response_mime_type": "application/json",
        },
    }

    try:
        image_bytes_total = 0
        image_sizes = []
        for image in images:
            width, height = getattr(image, "size", (0, 0))
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=85, optimize=True)
            image_bytes = len(buffer.getvalue())
            image_bytes_total += image_bytes
            image_sizes.append(f"{width}x{height}:{image_bytes}")
        logger.info(
            "vision_request_metrics pages=%d prompt_chars=%d image_bytes=%d image_sizes=%s body_chars=%d",
            len(images),
            len(GEMINI_EXTRACTION_PROMPT),
            image_bytes_total,
            ",".join(image_sizes),
            len(json.dumps(body, separators=(",", ":"))),
        )
    except Exception as exc:
        logger.debug("vision_request_metrics_failed: %s", exc)

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )
    max_retries = max(0, int(os.getenv("VISION_RETRY_429", "0")))
    backoff_s = float(os.getenv("VISION_RETRY_BACKOFF_S", "2.0"))

    resp = None
    for attempt in range(max_retries + 1):
        attempt_started = time.time()
        resp = requests.post(
            url,
            headers={
                "x-goog-api-key": api_key,
                "Content-Type": "application/json",
            },
            json=body,
            timeout=timeout_s,
        )
        logger.info(
            "vision_http_attempt attempt=%d status=%s elapsed_ms=%d",
            attempt + 1,
            getattr(resp, "status_code", None),
            int((time.time() - attempt_started) * 1000),
        )
        if resp.status_code != 429:
            break
        if attempt >= max_retries:
            break
        sleep_for = backoff_s * (attempt + 1)
        logger.warning("vision_quota_retry attempt=%d wait=%.1fs", attempt + 1, sleep_for)
        time.sleep(sleep_for)

    if resp is None:
        raise RuntimeError("VISION_EMPTY_HTTP_RESPONSE")

    if resp.status_code == 404:
        raise RuntimeError(f"VISION_MODEL_NOT_FOUND:{model}")
    if resp.status_code in {400, 401, 403}:
        raise RuntimeError(f"VISION_AUTH_ERROR:{resp.status_code}")
    if resp.status_code == 429:
        raise RuntimeError("VISION_QUOTA_EXHAUSTED:429")
    resp.raise_for_status()

    payload = resp.json() or {}
    candidates = payload.get("candidates") or []
    if not candidates:
        raise ValueError("VISION_EMPTY_RESPONSE")

    content = (candidates[0].get("content") or {})
    response_parts = content.get("parts") or []
    text = "\n".join(
        str(part.get("text") or "")
        for part in response_parts
        if isinstance(part, dict)
    ).strip()

    if not text:
        raise ValueError("VISION_EMPTY_TEXT_RESPONSE")

    # Strip markdown fences if present
    text = re.sub(r"^```json\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("VISION_NON_OBJECT_RESPONSE")
    return parsed


def _parse_vision_payload(payload: Dict[str, Any]) -> NormalizedInvoice:
    """Convert Gemini JSON payload to NormalizedInvoice."""
    invoice = NormalizedInvoice()
    invoice.extraction_source = "vision"

    employees = payload.get("employees") or []
    valid_rows: List[NormalizedInvoiceRow] = []
    warnings: List[str] = []

    for idx, emp in enumerate(employees, 1):
        if not isinstance(emp, dict):
            continue

        trade = str(emp.get("trade") or emp.get("employee_name") or "").strip().upper()
        if not trade:
            warnings.append(f"vision_row_{idx}:missing_trade")
            continue
        if _is_summary_like_row(emp, trade):
            warnings.append(f"vision_row_{idx}:summary_row_skipped")
            continue

        hours = _safe_float(emp.get("hours_worked") or emp.get("quantity") or 0)
        rate = _safe_float(emp.get("rate") or 0)
        amount = _safe_float(emp.get("amount") or 0)
        days = _safe_float(emp.get("days_worked") or 0)

        # Derive missing fields
        if amount <= 0 and hours > 0 and rate > 0:
            amount = round(hours * rate, 2)
        if hours <= 0 and amount > 0 and rate > 0:
            hours = round(amount / rate, 2)
        if amount <= 0:
            warnings.append(f"vision_row_{idx}:{trade}:missing_amount")
            continue

        employee_id = str(emp.get("employee_id") or "").strip()
        project = str(emp.get("project_id") or "").strip()

        # Heuristic swap fix for common confusion: employee IDs read as project IDs.
        if project and _looks_like_employee_id(project) and not _looks_like_project_id(project):
            if not employee_id:
                employee_id = project
                project = ""
                warnings.append(f"vision_row_{idx}:project_to_employee_id_swap")
        if employee_id and _looks_like_project_id(employee_id) and not project:
            project = employee_id
            employee_id = ""
            warnings.append(f"vision_row_{idx}:employee_to_project_id_swap")

        row = NormalizedInvoiceRow(
            description=trade,
            quantity=round(hours, 2),
            rate=round(rate, 4),
            amount=round(amount, 2),
            employee_id=employee_id,
            employee_name=str(emp.get("employee_name") or "").strip(),
            project=project,
            days_worked=days,
        )

        # Sanity checks
        violations = sanity_check_row(row)
        if violations:
            warnings.append(f"vision_row_{idx}:{trade}:rejected:{','.join(violations)}")
            continue

        # Repair
        row, repairs = repair_row(row)
        if repairs:
            warnings.extend([f"vision_repair:{r}" for r in repairs])

        valid_rows.append(row)

    invoice.invoice_rows = _merge_multi_page_rows(valid_rows)
    invoice.warnings = warnings

    # Deductions
    ded_raw = (
        payload.get("deductions")
        or payload.get("deduction")
        or payload.get("deduction_detail")
        or payload.get("deduction_breakdown")
        or {}
    )
    if isinstance(ded_raw, dict):
        invoice.deduction_detail = NormalizedDeductions(
            mess=_safe_float(ded_raw.get("mess") or 0),
            gas=_safe_float(ded_raw.get("gas") or 0),
            transport=_safe_float(ded_raw.get("transport") or 0),
            advance=_safe_float(ded_raw.get("advance") or 0),
            absent=_safe_float(ded_raw.get("absent") or 0),
            other=_safe_float(ded_raw.get("other") or 0),
            total=_safe_float(ded_raw.get("total") or ded_raw.get("total_deduction") or 0),
        )
        invoice.deductions = invoice.deduction_detail.total
        if invoice.deductions <= 0:
            invoice.deductions = sum([
                invoice.deduction_detail.mess,
                invoice.deduction_detail.gas,
                invoice.deduction_detail.transport,
                invoice.deduction_detail.advance,
                invoice.deduction_detail.absent,
                invoice.deduction_detail.other,
            ])
            invoice.deduction_detail.total = invoice.deductions
    else:
        invoice.deductions = _safe_float(ded_raw or payload.get("total_deduction") or 0)
        invoice.deduction_detail = NormalizedDeductions(total=invoice.deductions)

    # Financials
    row_subtotal = round(sum(r.amount for r in invoice.invoice_rows), 2)
    reported_subtotal = _safe_float(payload.get("subtotal") or payload.get("summary_subtotal") or 0)
    invoice.subtotal = reported_subtotal if reported_subtotal > 0 else row_subtotal

    invoice.vat_rate = _safe_float(payload.get("vat_rate") or 0.05) or 0.05
    invoice.vat = _safe_float(payload.get("vat") or payload.get("vat_amount") or 0)
    invoice.gross_total = _safe_float(payload.get("gross_total") or 0)
    invoice.net_total = _safe_float(payload.get("net_total") or payload.get("net_payable") or 0)

    # Fill in missing financials
    if invoice.vat <= 0:
        adjusted = max(0.0, invoice.subtotal - invoice.deductions)
        invoice.vat = round(adjusted * invoice.vat_rate, 4)
    if invoice.gross_total <= 0:
        invoice.gross_total = round(invoice.subtotal + invoice.vat, 2)
    if invoice.net_total <= 0:
        adjusted = max(0.0, invoice.subtotal - invoice.deductions)
        invoice.net_total = round(adjusted + invoice.vat, 2)

    # Metadata
    invoice.client_name = str(payload.get("client_name") or "").strip()
    invoice.period_month = str(payload.get("period_month") or "").strip()
    invoice.invoice_no = str(payload.get("invoice_no") or "").strip()

    # Confidence: based on row count and financial consistency
    if invoice.invoice_rows and invoice.subtotal > 0:
        diff_ratio = abs(row_subtotal - invoice.subtotal) / max(invoice.subtotal, 1)
        invoice.confidence = max(0.7, 0.95 - diff_ratio)
    elif invoice.invoice_rows:
        invoice.confidence = 0.7
    else:
        invoice.confidence = 0.0

    if len(invoice.invoice_rows) == 0:
        invoice.warnings.append("vision:no_employee_rows_detected")

    return invoice


def extract_vision(pdf_path: str) -> NormalizedInvoice:
    """
    PRIMARY extraction engine for scanned/image PDFs.

    Renders pages at 300 DPI and sends directly to Gemini Vision.
    Does NOT use OCR geometry, table detection, or cell extraction.

    Returns NormalizedInvoice.
    Raises on hard failures so the caller can trigger OCR fallback.
    """
    print("VISION EXTRACTOR STARTED")
    invoice = NormalizedInvoice()
    invoice.extraction_source = "vision"

    logger.info("vision_extract starting pdf=%s", pdf_path)
    logger.info("%s", "=" * 80)
    logger.info("VISION TEST FILE: %s", pdf_path)
    logger.info("GOOGLE_API_KEY PRESENT: %s", bool(os.getenv("GOOGLE_API_KEY")))
    logger.info("STARTING GEMINI REQUEST")

    # Render PDF to images at 300 DPI
    images = _render_pdf_to_images(pdf_path, dpi=96)
    if not images:
        raise RuntimeError("VISION_PDF_RENDER_FAILED:no_images")

    max_pages = int(os.getenv("VISION_MAX_PAGES", "10"))
    if len(images) > max_pages:
        images = images[:max_pages]
        invoice.warnings.append(f"vision_pages_limited:{max_pages}")

    # Pre-correct page orientation to stabilize extraction on rotated PDFs.
    images = correct_pages(images)

    logger.info("vision_extract pages=%d calling_gemini", len(images))

    # Call Gemini — let exceptions propagate to trigger fallback
    try:
        payload = _call_gemini(images)
        if payload is None:
            raise ValueError("VISION_NULL_PAYLOAD")
        logger.info("GEMINI REQUEST SUCCESS")
    except Exception:
        logger.exception("GEMINI REQUEST FAILED")
        raise

    result = _parse_vision_payload(payload)
    trade_distribution = {}

    for row in result.invoice_rows:
        trade_distribution.setdefault(
            row.description,
            0,
        )

        trade_distribution[row.description] += row.quantity

    logger.info(
        "vision_trade_distribution=%s",
        trade_distribution,
    )
    logger.info(
        "vision_extract complete rows=%d subtotal=%.2f confidence=%.2f",
        len(result.invoice_rows), result.subtotal, result.confidence,
    )
    return result