<<<<<<< HEAD
﻿"""
=======
"""
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
pdf_generator.py  –  Template-driven tax invoice PDF generator.

Faithfully reproduces the layout visible in the reference image:
  - Template PDF rendered as background on every page
  - "Tax Invoice" centred in the header area
  - Invoice number (left) / Date (right) on one line
  - Client block: M/s. name, address, Tel, Fax, TRN
  - "Invoice for the month of <Month Year>" centred
  - Blue-header table: SI NO | TRADE | ProjectNo. | No. of hours |
                        Unit Price | Amount | VAT | VAT Amount | Net Amount
  - TOTAL DEDUCTION row
  - Blue TOTAL row
  - "In words" row
  - Thanks and Regards footer with company name, TRN, optional signature / stamp
"""

from __future__ import annotations

import base64
import os
from datetime import datetime
from uuid import uuid4
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

try:
    from pdf2image import convert_from_path
except Exception:
    convert_from_path = None  # type: ignore


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _safe_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except Exception:
        return default


def _line_chunks(text: str, max_chars: int) -> List[str]:
    """Word-wrap *text* to lines of at most *max_chars* characters."""
    if not text:
        return []
    words = str(text).split()
    lines: List[str] = []
    current = ""
    for word in words:
        probe = f"{current} {word}".strip()
        if len(probe) <= max_chars:
            current = probe
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


# ---------------------------------------------------------------------------
# Asset helpers
# ---------------------------------------------------------------------------

def _find_poppler_path() -> Optional[str]:
    common = [
        r"C:\Program Files\poppler\Library\bin",
        r"C:\Program Files\poppler\bin",
    ]
    local_base = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages")
    if local_base and os.path.isdir(local_base):
        try:
            for name in os.listdir(local_base):
                if "poppler" not in name.lower():
                    continue
                for root, _dirs, files in os.walk(os.path.join(local_base, name)):
                    if "pdfinfo.exe" in files:
                        return root
        except Exception:
            pass
    for c in common:
        if os.path.exists(os.path.join(c, "pdfinfo.exe")):
            return c
    return None


def _template_to_image(template_path: Optional[str], out_dir: str) -> Optional[str]:
    if not template_path or not os.path.exists(template_path):
        return None
    ext = os.path.splitext(template_path)[1].lower()
    if ext in {".png", ".jpg", ".jpeg"}:
        return template_path
    if ext == ".pdf" and convert_from_path is not None:
        try:
            kwargs: Dict[str, Any] = {"first_page": 1, "last_page": 1, "dpi": 180}
            pp = _find_poppler_path()
            if pp:
                kwargs["poppler_path"] = pp
            images = convert_from_path(template_path, **kwargs)
            if not images:
                return None
            img_path = os.path.join(out_dir, "template_bg.png")
            images[0].save(img_path, "PNG")
            return img_path
        except Exception:
            return None
    return None


def _materialize_asset(asset_value: Optional[str], out_dir: str, prefix: str) -> Optional[str]:
    """Resolve file path *or* base64 data-URI into a concrete local file."""
    if not asset_value or not isinstance(asset_value, str):
        return None
    candidate = asset_value.strip()
    if not candidate:
        return None
    if os.path.exists(candidate):
        return candidate

    b64_payload = candidate
    ext = ".bin"
    if candidate.startswith("data:") and ";base64," in candidate:
        header, b64_payload = candidate.split(";base64,", 1)
        mime = header.split(":", 1)[1].lower()
        ext = ".pdf" if "pdf" in mime else (".jpg" if "jpeg" in mime or "jpg" in mime else ".png")

    try:
        raw = base64.b64decode(b64_payload, validate=False)
    except Exception:
        return None

    if not raw:
        return None

    if ext == ".bin":
        if raw.startswith(b"%PDF"):
            ext = ".pdf"
        elif raw.startswith(b"\x89PNG"):
            ext = ".png"
        elif raw.startswith(b"\xff\xd8\xff"):
            ext = ".jpg"
        else:
            ext = ".png"

    file_path = os.path.join(out_dir, f"{prefix}{ext}")
    try:
        with open(file_path, "wb") as f:
            f.write(raw)
        return file_path
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Number → words
# ---------------------------------------------------------------------------

def _number_to_words(num: float) -> str:
    ones = [
        "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
        "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
        "Sixteen", "Seventeen", "Eighteen", "Nineteen",
    ]
    tens_words = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def under_thousand(n: int) -> str:
        parts: List[str] = []
        if n >= 100:
            parts.append(f"{ones[n // 100]} Hundred")
            n %= 100
        if n >= 20:
            parts.append(tens_words[n // 10])
            if n % 10:
                parts.append(ones[n % 10])
        elif n > 0:
            parts.append(ones[n])
        return " ".join(parts)

    integer = int(num)
    fraction = int(round((num - integer) * 100))
    if fraction >= 100:
        integer += 1
        fraction = 0

    if integer == 0:
        words = "Zero"
    else:
        groups = [(1_000_000_000, "Billion"), (1_000_000, "Million"), (1_000, "Thousand"), (1, "")]
        parts: List[str] = []
        remaining = integer
        for value, suffix in groups:
            if remaining >= value:
                chunk = remaining // value
                remaining %= value
                chunk_words = under_thousand(chunk)
                parts.append(f"{chunk_words} {suffix}".strip())
        words = " ".join(parts)

    if fraction:
        return f"{words} Dirhams and {fraction:02d} Fils Only"
    return f"{words} Dirhams Only"


# ---------------------------------------------------------------------------
# Table drawing helpers
# ---------------------------------------------------------------------------

HEADER_COLOR = colors.HexColor("#0b78c2")
WHITE = colors.white
BLACK = colors.black

HEADERS = [
    "SI NO", "TRADE", "ProjectNo.", "No. of\nhours",
    "Unit\nPrice", "Amount", "VAT", "VAT\nAmount", "Net\nAmount",
]
# Fractional widths that sum to 1.0
COL_FRACS = [0.075, 0.155, 0.12, 0.105, 0.10, 0.115, 0.065, 0.115, 0.15]

# Column alignment: C=centre, R=right, L=left
COL_ALIGN = ["C", "L", "L", "C", "C", "R", "C", "R", "R"]

HEADER_ROW_H = 6.5 * mm  # header taller to accommodate 2-line labels
DATA_ROW_H = 5.1 * mm


def _draw_cell_text(c: canvas.Canvas, x: float, y: float, w: float, h: float,
                    text: str, align: str, font: str, size: float, color: Any) -> None:
    c.setFont(font, size)
    c.setFillColor(color)
    mid_y = y + (h - size) / 2 + 0.5
    if align == "C":
        c.drawCentredString(x + w / 2, mid_y, text)
    elif align == "R":
        c.drawRightString(x + w - 1.5, mid_y, text)
    else:
        c.drawString(x + 1.5, mid_y, text)


def _draw_multi_line_header(c: canvas.Canvas, x: float, y: float, w: float, h: float,
                             text: str, font: str, size: float) -> None:
    """Draw a two-line header centred in the cell."""
    lines = text.split("\n")
    c.setFont(font, size)
    c.setFillColor(WHITE)
    line_h = size * 1.3
    total_text_h = len(lines) * line_h
    start_y = y + (h + total_text_h) / 2 - line_h + 0.5
    for i, line in enumerate(lines):
        c.drawCentredString(x + w / 2, start_y - i * line_h, line)


# ---------------------------------------------------------------------------
# Main generator
# ---------------------------------------------------------------------------

def generate_invoice_pdf(
    output_dir: str,
    extracted: Dict[str, Any],
    company_data: Dict[str, Any],
    template_path: Optional[str] = None,
    signature_path: Optional[str] = None,
    stamp_path: Optional[str] = None,
) -> str:
    _ensure_dir(output_dir)
    timestamp = int(datetime.now().timestamp())
<<<<<<< HEAD
    company_id = str(company_data.get("companyId") or company_data.get("company_id") or "na")
    user_id = str(company_data.get("userId") or company_data.get("user_id") or "na")
    safe_company = "".join(ch for ch in company_id if ch.isalnum())[:16] or "na"
    safe_user = "".join(ch for ch in user_id if ch.isalnum())[:16] or "na"
    output_path = os.path.join(output_dir, f"tax-invoice-{safe_company}-{safe_user}-{timestamp}-{uuid4().hex[:8]}.pdf")
=======
    output_path = os.path.join(output_dir, f"tax-invoice-{timestamp}.pdf")
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

    c = canvas.Canvas(output_path, pagesize=A4)
    width, height = A4

    # ---- Resolve assets ----
    resolved_template = _materialize_asset(template_path, output_dir, "invoice-template")
    resolved_signature = _materialize_asset(signature_path, output_dir, "invoice-signature")
    resolved_stamp = _materialize_asset(stamp_path, output_dir, "invoice-stamp")

    bg_path = _template_to_image(resolved_template, output_dir)
    if bg_path and os.path.exists(bg_path):
        try:
            c.drawImage(bg_path, 0, 0, width=width, height=height,
                        preserveAspectRatio=False, mask="auto")
        except Exception:
            pass
    else:
        c.setFillColor(WHITE)
        c.rect(0, 0, width, height, stroke=0, fill=1)

    # ---- Layout constants ----
    # Match the template: the content area sits inside the decorative border
    left = 36 * mm
    right = width - 12 * mm
    content_width = right - left

    # ---- Company / invoice data ----
    company_name = company_data.get("name") or "Company"
    owner_trn = company_data.get("trn") or "-"
    vat_rate = _safe_float(company_data.get("vatRate"), 5.0)
    invoice_number = company_data.get("invoiceNumber") or "INV-001"
    invoice_date_raw = str(company_data.get("invoiceDate") or datetime.now().strftime("%d/%m/%Y"))
    invoice_date_display = invoice_date_raw.replace("/", ".")

    # Client details (the company the invoice is being raised TO)
    client_name = company_data.get("clientName") or "Client"
    client_trn = company_data.get("clientTrn") or ""
    address = company_data.get("address") or ""
    po_box = company_data.get("poBox") or ""
    tel = company_data.get("tel") or company_data.get("mobileNumber") or ""
    fax = company_data.get("fax") or ""
    mobile = company_data.get("mobileNumber") or ""
    contact_email = company_data.get("contactEmail") or ""
    website = company_data.get("websiteLink") or ""

    rows: List[Dict[str, Any]] = extracted.get("invoice_summary", {}).get("rows", [])
    totals: Dict[str, Any] = extracted.get("invoice_summary", {}).get("totals", {})

    # ---- Title ----
    title_y = height - 40 * mm
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString((left + right) / 2, title_y, "Tax Invoice")

    # ---- Invoice meta line ----
    meta_y = title_y - 7 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(left + 2, meta_y, f"Invoice No.{invoice_number}")
    c.drawRightString(right - 2, meta_y, f"Date. {invoice_date_display}")

    # ---- Client block ----
    client_y = meta_y - 7 * mm
    c.setFont("Helvetica-Bold", 9)
    client_display = client_name.strip()
    if not client_display.lower().startswith("m/s"):
        client_display = f"M/s. {client_display}"
    c.drawString(left + 2, client_y, client_display)

    detail_lines: List[str] = []
    if po_box:
        detail_lines.append(f"PO Box {po_box}")
    if tel:
        detail_lines.append(f"Tel No {tel}")
    if fax:
        detail_lines.append(f"Fax no # {fax}")
    detail_lines.extend(_line_chunks(address, 45))
    if client_trn:
        detail_lines.append(f"TRN: {client_trn}")

    c.setFont("Helvetica", 8.5)
    cy = client_y - 5 * mm
    for line in detail_lines[:7]:
        c.drawString(left + 2, cy, line)
        cy -= 4.2 * mm

    # ---- "Invoice for the month of …" ----
    try:
        date_obj = datetime.strptime(invoice_date_raw.split()[0], "%d/%m/%Y")
    except Exception:
        date_obj = datetime.now()
    month_label = f"Invoice for the month of {date_obj.strftime('%B %Y')}"
    month_y = cy - 5 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString((left + right) / 2, month_y, month_label)

    # ---- Table ----
    table_top = month_y - 7 * mm
    table_x = left + 1
    table_w = content_width - 2
    col_widths = [table_w * f for f in COL_FRACS]

    c.setStrokeColor(BLACK)
    c.setLineWidth(0.45)

    # Header row
    c.setFillColor(HEADER_COLOR)
    c.rect(table_x, table_top - HEADER_ROW_H, table_w, HEADER_ROW_H, stroke=1, fill=1)
    hx = table_x
    for idx, hdr in enumerate(HEADERS):
        c.rect(hx, table_top - HEADER_ROW_H, col_widths[idx], HEADER_ROW_H, stroke=1, fill=0)
        _draw_multi_line_header(c, hx, table_top - HEADER_ROW_H, col_widths[idx],
                                HEADER_ROW_H, hdr, "Helvetica-Bold", 6.2)
        hx += col_widths[idx]

    # Data rows
    y_row = table_top - HEADER_ROW_H
    total_amount = 0.0
    total_vat_amount = 0.0
    total_net = 0.0
    vat_frac = vat_rate / 100.0

    max_rows = 12  # match reference
    for i, row in enumerate(rows[:max_rows], start=1):
        y_row -= DATA_ROW_H
        c.setFillColor(WHITE)
        c.rect(table_x, y_row, table_w, DATA_ROW_H, stroke=0, fill=1)
        c.setFillColor(BLACK)
        c.rect(table_x, y_row, table_w, DATA_ROW_H, stroke=1, fill=0)

        trade = str(row.get("trade") or "").upper()
        project_no = str(row.get("project_id") or "")
        hours = _safe_float(row.get("hours"))
        unit_price = _safe_float(row.get("rate"))
        amount = _safe_float(row.get("amount"))

        # Compute VAT from company VAT rate
        vat_amount = round(amount * vat_frac, 3)
        net_amount = round(amount + vat_amount, 2)

        total_amount += amount
        total_vat_amount += vat_amount
        total_net += net_amount

        hours_str = f"{hours:.0f}" if hours == int(hours) else f"{hours:.2f}"
        values = [
            str(i),
            trade,
            project_no,
            hours_str,
            f"{unit_price:.2f}",
            f"{amount:,.2f}",
            f"{vat_frac:.2f}",
            f"{vat_amount:,.3f}",
            f"{net_amount:,.2f}",
        ]

        rx = table_x
        for idx, val in enumerate(values):
            c.rect(rx, y_row, col_widths[idx], DATA_ROW_H, stroke=1, fill=0)
            _draw_cell_text(c, rx, y_row, col_widths[idx], DATA_ROW_H,
                            val, COL_ALIGN[idx], "Helvetica", 6.5, BLACK)
            rx += col_widths[idx]

    # ---- TOTAL DEDUCTION row ----
    deduction = _safe_float(totals.get("total_deduction"), 0.0)
    # Also accept legacy key from company_data
    if deduction == 0.0:
        deduction = _safe_float(company_data.get("deductions"), 0.0)

    y_row -= DATA_ROW_H
    c.setFillColor(WHITE)
    c.rect(table_x, y_row, table_w, DATA_ROW_H, stroke=0, fill=1)
    c.setFillColor(BLACK)
    c.rect(table_x, y_row, table_w, DATA_ROW_H, stroke=1, fill=0)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(table_x + 2, y_row + 1.8, "TOTAL DEDUCTION")
    c.drawRightString(table_x + table_w - 2, y_row + 1.8, f"{deduction:,.2f}")

    # ---- Blue TOTAL row ----
    payable = max(total_net - deduction, 0.0)
    y_row -= DATA_ROW_H
    c.setFillColor(HEADER_COLOR)
    c.rect(table_x, y_row, table_w, DATA_ROW_H, stroke=1, fill=1)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(table_x + 2, y_row + 1.8, "TOTAL")
    c.drawRightString(table_x + table_w - 2, y_row + 1.8, f"{payable:,.2f}")

    # ---- In words row ----
    y_row -= DATA_ROW_H
    c.setFillColor(WHITE)
    c.rect(table_x, y_row, table_w, DATA_ROW_H, stroke=0, fill=1)
    c.setFillColor(BLACK)
    c.rect(table_x, y_row, table_w, DATA_ROW_H, stroke=1, fill=0)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(table_x + 2, y_row + 1.8, "In words :-")
    c.setFont("Helvetica", 6.8)
    c.drawString(table_x + 28 * mm, y_row + 1.8, _number_to_words(payable))

    # ---- Footer / regards ----
    footer_y = y_row - 28 * mm
    min_footer = 44 * mm
    if footer_y < min_footer:
        footer_y = min_footer

    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(left + 2, footer_y, "Thanks        and        Regards")
    c.setFont("Helvetica", 10)
    c.drawString(left + 2, footer_y - 5.5 * mm, company_name)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(left + 2, footer_y - 10.5 * mm, f"TRN No. {owner_trn}")

    if resolved_signature and os.path.exists(resolved_signature):
        try:
            c.drawImage(resolved_signature, left + 8 * mm, footer_y - 26 * mm,
                        width=22 * mm, height=17 * mm, preserveAspectRatio=True, mask="auto")
        except Exception:
            pass

    if resolved_stamp and os.path.exists(resolved_stamp):
        try:
            c.drawImage(resolved_stamp, left + 38 * mm, footer_y - 25 * mm,
                        width=25 * mm, height=25 * mm, preserveAspectRatio=True, mask="auto")
        except Exception:
            pass

    # Fallback text footer (only when no template is present)
    if not (bg_path and os.path.exists(bg_path)):
        c.setStrokeColor(colors.HexColor("#8f98a6"))
        c.line(left, 12 * mm, right, 12 * mm)
        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColor(colors.HexColor("#2a2f37"))
        c.drawString(left + 1, 8.6 * mm, company_name.upper())
        c.setFont("Helvetica", 6.8)
        contact_line = " | ".join(s for s in [mobile, contact_email, website] if s)
        if contact_line:
            c.drawRightString(right - 1, 8.6 * mm, contact_line)

    c.save()
    return output_path
