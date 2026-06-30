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
from typing import Any, Dict, List, Optional

from normalized_output import (
    NormalizedDeductions,
    NormalizedInvoice,
    NormalizedInvoiceRow,
    repair_row,
    sanity_check_row,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Gemini prompt — semantic extraction, not OCR geometry
# ---------------------------------------------------------------------------

GEMINI_EXTRACTION_PROMPT = """
You are a construction timesheet data extraction specialist.

Analyze this timesheet image and extract ALL labor data.

IMPORTANT RULES:
1. Read the ENTIRE table, including all rows
2. Look for a SUMMARY table if present (Trade | Hours | Rate | Amount) — prefer this over attendance grids
3. If only an attendance grid exists (with W/A/H markers), sum up hours per trade
4. Extract financial totals from the footer section

Return ONLY valid JSON in this exact schema. No markdown, no explanation:

{
  "employees": [
    {
      "employee_id": "",
      "employee_name": "",
      "trade": "",
      "days_worked": 0,
      "hours_worked": 0,
      "rate": 0,
      "amount": 0,
      "project_id": ""
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

If a field is unknown or not present, use null or 0.
The sum of all employee amounts should equal subtotal.
""".strip()


def _render_pdf_to_images(pdf_path: str, dpi: int = 300) -> List[Any]:
    """
    Render PDF pages to PIL Images at specified DPI.
    Per spec: render at 300 DPI for vision extraction.
    """
    try:
        from pdf2image import convert_from_path
        from PIL import Image

        # Detect poppler path on Windows
        poppler_path = _find_poppler()
        kwargs: Dict[str, Any] = {"dpi": dpi}
        if poppler_path:
            kwargs["poppler_path"] = poppler_path

        max_pages = int(os.getenv("VISION_MAX_PAGES", "10"))
        pages = convert_from_path(
            pdf_path,
            first_page=1,
            last_page=max_pages,
            **kwargs,
        )
        return [p.convert("RGB") for p in pages]
    except Exception as exc:
        logger.warning("PDF render failed: %s", exc)
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


def _image_to_base64(image: Any, max_side: int = 2048) -> str:
    """Convert PIL Image to base64 JPEG, resizing if needed."""
    w, h = image.size
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        image = image.resize((int(w * scale), int(h * scale)))

    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _call_gemini(images: List[Any]) -> Optional[Dict[str, Any]]:
    """
    Call Gemini Vision API with all page images.
    Returns parsed JSON payload or None on failure.
    """
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
                "mime_type": "image/jpeg",
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

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )
    resp = requests.post(
        url,
        headers={
            "x-goog-api-key": api_key,
            "Content-Type": "application/json",
        },
        json=body,
        timeout=timeout_s,
    )

    if resp.status_code == 404:
        raise RuntimeError(f"VISION_MODEL_NOT_FOUND:{model}")
    if resp.status_code in {400, 401, 403}:
        raise RuntimeError(f"VISION_AUTH_ERROR:{resp.status_code}")
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

        hours = float(emp.get("hours_worked") or emp.get("quantity") or 0)
        rate = float(emp.get("rate") or 0)
        amount = float(emp.get("amount") or 0)
        days = float(emp.get("days_worked") or 0)

        # Derive missing fields
        if amount <= 0 and hours > 0 and rate > 0:
            amount = round(hours * rate, 2)
        if hours <= 0 and amount > 0 and rate > 0:
            hours = round(amount / rate, 2)
        if amount <= 0:
            warnings.append(f"vision_row_{idx}:{trade}:missing_amount")
            continue

        row = NormalizedInvoiceRow(
            description=trade,
            quantity=round(hours, 2),
            rate=round(rate, 4),
            amount=round(amount, 2),
            employee_id=str(emp.get("employee_id") or "").strip(),
            employee_name=str(emp.get("employee_name") or "").strip(),
            project=str(emp.get("project_id") or "").strip(),
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

    invoice.invoice_rows = valid_rows
    invoice.warnings = warnings

    # Deductions
    ded_raw = payload.get("deductions") or {}
    if isinstance(ded_raw, dict):
        invoice.deduction_detail = NormalizedDeductions(
            mess=float(ded_raw.get("mess") or 0),
            gas=float(ded_raw.get("gas") or 0),
            transport=float(ded_raw.get("transport") or 0),
            advance=float(ded_raw.get("advance") or 0),
            absent=float(ded_raw.get("absent") or 0),
            other=float(ded_raw.get("other") or 0),
            total=float(ded_raw.get("total") or 0),
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
        invoice.deductions = float(ded_raw or 0)
        invoice.deduction_detail = NormalizedDeductions(total=invoice.deductions)

    # Financials
    row_subtotal = round(sum(r.amount for r in valid_rows), 2)
    reported_subtotal = float(payload.get("subtotal") or 0)
    invoice.subtotal = reported_subtotal if reported_subtotal > 0 else row_subtotal

    invoice.vat_rate = float(payload.get("vat_rate") or 0.05)
    invoice.vat = float(payload.get("vat") or 0)
    invoice.gross_total = float(payload.get("gross_total") or 0)
    invoice.net_total = float(payload.get("net_total") or 0)

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
    if valid_rows and invoice.subtotal > 0:
        diff_ratio = abs(row_subtotal - invoice.subtotal) / max(invoice.subtotal, 1)
        invoice.confidence = max(0.7, 0.95 - diff_ratio)
    elif valid_rows:
        invoice.confidence = 0.7
    else:
        invoice.confidence = 0.0

    return invoice


def extract_vision(pdf_path: str) -> NormalizedInvoice:
    """
    PRIMARY extraction engine for scanned/image PDFs.

    Renders pages at 300 DPI and sends directly to Gemini Vision.
    Does NOT use OCR geometry, table detection, or cell extraction.

    Returns NormalizedInvoice.
    Raises on hard failures so the caller can trigger OCR fallback.
    """
    invoice = NormalizedInvoice()
    invoice.extraction_source = "vision"

    logger.info("vision_extract starting pdf=%s", pdf_path)

    # Render PDF to images at 300 DPI
    images = _render_pdf_to_images(pdf_path, dpi=300)
    if not images:
        raise RuntimeError("VISION_PDF_RENDER_FAILED:no_images")

    max_pages = int(os.getenv("VISION_MAX_PAGES", "10"))
    if len(images) > max_pages:
        images = images[:max_pages]
        invoice.warnings.append(f"vision_pages_limited:{max_pages}")

    logger.info("vision_extract pages=%d calling_gemini", len(images))

    # Call Gemini — let exceptions propagate to trigger fallback
    payload = _call_gemini(images)
    if payload is None:
        raise ValueError("VISION_NULL_PAYLOAD")

    result = _parse_vision_payload(payload)

    logger.info(
        "vision_extract complete rows=%d subtotal=%.2f confidence=%.2f",
        len(result.invoice_rows), result.subtotal, result.confidence,
    )
    return result