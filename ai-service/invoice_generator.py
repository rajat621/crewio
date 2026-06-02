"""
invoice_generator.py  –  Universal tax invoice PDF generator.

Takes the normalised extraction payload from extractor.py and the owner's
company profile, and produces a pixel-accurate tax invoice PDF.

Supports two invoice table layouts:
  - MCC layout:  SI NO | TRADE | ProjectNo. | No.ofhours | UnitPrice | Amount | VAT | VATAmount | NetAmount
  - BKC layout:  SI NO | TRADE | ID NO      | UnitPrice  | HOURS     | Amount | VAT | VATAmount | NetAmount

The layout is chosen automatically based on extraction["format"] but can
be overridden via company_data["invoice_layout"] = "mcc" | "bkc".

company_data schema:
{
  "name":          str,   # owner company name  (e.g. "ALQaser ALSatea Tech Cont")
  "trn":           str,   # owner TRN
  "vatRate":       float, # e.g. 5.0
  "invoiceNumber": str,   # e.g. "08"
  "invoiceDate":   str,   # DD/MM/YYYY
  "invoice_layout": str,  # optional: "mcc" | "bkc" – overrides auto-detection
  # Client override fields (optional – extractor fills these from timesheet)
  "clientName":    str,
  "clientTrn":     str,
  "poBox":         str,
  "address":       str,
  "tel":           str,
  "fax":           str,
  # Contact/footer
  "mobileNumber":  str,
  "contactEmail":  str,
  "websiteLink":   str,
  # Extra deductions beyond what the timesheet carries
  "extraDeductions": float,
}
"""

from __future__ import annotations

import base64
import io
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

try:
    from pdf2image import convert_from_path as _pdf2img
except ImportError:
    _pdf2img = None  # type: ignore


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BLUE  = colors.HexColor("#0b78c2")
WHITE = colors.white
BLACK = colors.black
LIGHT_GREY = colors.HexColor("#f0f4f8")

A4_W, A4_H = A4

# Layout zone (matches the AlQaser template border)
LEFT  = 36 * mm
RIGHT = A4_W - 12 * mm
CONTENT_W = RIGHT - LEFT


# ---------------------------------------------------------------------------
# Column definitions for each layout
# ---------------------------------------------------------------------------

# Each entry: (header_text, frac_width, align)   align: L/C/R
MCC_COLS: List[Tuple[str, float, str]] = [
    ("SI\nNO",        0.072, "C"),
    ("TRADE",         0.155, "L"),
    ("Project\nNo.",  0.115, "L"),
    ("No. of\nhours", 0.105, "C"),
    ("Unit\nPrice",   0.100, "C"),
    ("Amount",        0.115, "R"),
    ("VAT",           0.065, "C"),
    ("VAT\nAmount",   0.118, "R"),
    ("Net\nAmount",   0.155, "R"),
]

BKC_COLS: List[Tuple[str, float, str]] = [
    ("SI\nNO",        0.072, "C"),
    ("TRADE",         0.160, "L"),
    ("ID NO",         0.115, "L"),
    ("Unit\nPrice",   0.100, "C"),
    ("HOURS",         0.105, "C"),
    ("Amount",        0.115, "R"),
    ("VAT",           0.065, "C"),
    ("VAT\nAmount",   0.118, "R"),
    ("Net\nAmount",   0.150, "R"),
]

HEADER_H  = 6.8 * mm   # header row height (accommodates 2-line labels)
DATA_H    = 5.1 * mm   # data row height
SUMMARY_H = 5.1 * mm   # deduction / total rows


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(v: Any, default: float = 0.0) -> float:
    if v is None:
        return default
    try:
        return float(v)
    except Exception:
        return default


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _word_wrap(text: str, max_chars: int) -> List[str]:
    words = str(text or "").split()
    lines: List[str] = []
    cur = ""
    for w in words:
        probe = f"{cur} {w}".strip()
        if len(probe) <= max_chars:
            cur = probe
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _materialize_asset(value: Optional[str], out_dir: str, prefix: str) -> Optional[str]:
    if not value or not isinstance(value, str):
        return None
    v = value.strip()
    if os.path.exists(v):
        return v
    # base64 data URI
    payload = v
    ext = ".bin"
    if v.startswith("data:") and ";base64," in v:
        header, payload = v.split(";base64,", 1)
        mime = header.split(":", 1)[1].lower()
        ext = ".pdf" if "pdf" in mime else (".jpg" if "jpeg" in mime or "jpg" in mime else ".png")
    try:
        raw = base64.b64decode(payload, validate=False)
    except Exception:
        return None
    if not raw:
        return None
    if ext == ".bin":
        if raw.startswith(b"%PDF"):      ext = ".pdf"
        elif raw.startswith(b"\x89PNG"): ext = ".png"
        elif raw.startswith(b"\xff\xd8"): ext = ".jpg"
        else:                             ext = ".png"
    path = os.path.join(out_dir, f"{prefix}{ext}")
    with open(path, "wb") as f:
        f.write(raw)
    return path


def _template_to_image(template_path: Optional[str], out_dir: str) -> Optional[str]:
    if not template_path or not os.path.exists(template_path):
        return None
    ext = os.path.splitext(template_path)[1].lower()
    if ext in {".png", ".jpg", ".jpeg"}:
        return template_path
    if ext == ".pdf" and _pdf2img:
        try:
            imgs = _pdf2img(template_path, first_page=1, last_page=1, dpi=180)
            if imgs:
                p = os.path.join(out_dir, "tpl_bg.png")
                imgs[0].save(p, "PNG")
                return p
        except Exception:
            pass
    return None


# ---------------------------------------------------------------------------
# Number → words (UAE Dirhams)
# ---------------------------------------------------------------------------

def _num_to_words(n: float) -> str:
    _ones = ["Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
             "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen",
             "Seventeen","Eighteen","Nineteen"]
    _tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"]

    def _u1000(x: int) -> str:
        p: List[str] = []
        if x >= 100:
            p.append(f"{_ones[x//100]} Hundred"); x %= 100
        if x >= 20:
            p.append(_tens[x//10])
            if x % 10: p.append(_ones[x % 10])
        elif x > 0:
            p.append(_ones[x])
        return " ".join(p)

    integer  = int(n)
    fraction = int(round((n - integer) * 100))
    if fraction >= 100:
        integer += 1; fraction = 0

    if integer == 0:
        words = "Zero"
    else:
        groups = [(1_000_000_000,"Billion"),(1_000_000,"Million"),(1_000,"Thousand"),(1,"")]
        parts: List[str] = []
        rem = integer
        for val, sfx in groups:
            if rem >= val:
                parts.append(f"{_u1000(rem // val)} {sfx}".strip())
                rem %= val
        words = " ".join(parts)

    return (f"{words} Dirhams and {fraction:02d} Fils Only"
            if fraction else f"{words} Dirhams Only")


# ---------------------------------------------------------------------------
# Canvas drawing utilities
# ---------------------------------------------------------------------------

def _cell(c: canvas.Canvas, x: float, y: float, w: float, h: float,
          text: str, align: str, font: str, size: float, color=BLACK) -> None:
    c.setFont(font, size)
    c.setFillColor(color)
    base_y = y + (h - size) / 2 + 0.4
    if align == "C":
        c.drawCentredString(x + w / 2, base_y, text)
    elif align == "R":
        c.drawRightString(x + w - 1.8, base_y, text)
    else:
        c.drawString(x + 1.8, base_y, text)


def _header_cell(c: canvas.Canvas, x: float, y: float, w: float, h: float, text: str,
                 font: str = "Helvetica-Bold", size: float = 6.2) -> None:
    """Render a possibly two-line centred header in white on blue background."""
    lines = text.split("\n")
    c.setFont(font, size)
    c.setFillColor(WHITE)
    line_h = size * 1.35
    total_text_h = len(lines) * line_h
    start_y = y + (h + total_text_h) / 2 - line_h + 0.3
    for i, line in enumerate(lines):
        c.drawCentredString(x + w / 2, start_y - i * line_h, line)


def _draw_header_row(c: canvas.Canvas, x: float, y: float, total_w: float,
                     col_defs: List[Tuple[str, float, str]]) -> None:
    c.setFillColor(BLUE)
    c.rect(x, y - HEADER_H, total_w, HEADER_H, stroke=1, fill=1)
    c.setStrokeColor(BLACK)
    cx = x
    for hdr, frac, _ in col_defs:
        cw = total_w * frac
        c.rect(cx, y - HEADER_H, cw, HEADER_H, stroke=1, fill=0)
        _header_cell(c, cx, y - HEADER_H, cw, HEADER_H, hdr)
        cx += cw


def _draw_data_row(c: canvas.Canvas, x: float, y: float, total_w: float,
                   col_defs: List[Tuple[str, float, str]],
                   values: List[str], row_h: float = DATA_H,
                   fill_color=WHITE, text_color=BLACK) -> None:
    c.setFillColor(fill_color)
    c.rect(x, y - row_h, total_w, row_h, stroke=0, fill=1)
    c.setFillColor(text_color)
    c.setStrokeColor(BLACK)
    c.rect(x, y - row_h, total_w, row_h, stroke=1, fill=0)
    cx = x
    for i, (_, frac, align) in enumerate(col_defs):
        cw = total_w * frac
        c.rect(cx, y - row_h, cw, row_h, stroke=1, fill=0)
        val = values[i] if i < len(values) else ""
        _cell(c, cx, y - row_h, cw, row_h, val, align, "Helvetica", 6.5, text_color)
        cx += cw


def _draw_summary_row(c: canvas.Canvas, x: float, y: float, total_w: float,
                      label: str, amount: str, row_h: float = SUMMARY_H,
                      bold: bool = False, blue: bool = False) -> None:
    fill = BLUE if blue else WHITE
    txt  = WHITE if blue else BLACK
    c.setFillColor(fill)
    c.rect(x, y - row_h, total_w, row_h, stroke=0, fill=1)
    c.setStrokeColor(BLACK)
    c.rect(x, y - row_h, total_w, row_h, stroke=1, fill=0)
    font = "Helvetica-Bold" if (bold or blue) else "Helvetica"
    size = 7.5 if blue else 7.0
    c.setFont(font, size)
    c.setFillColor(txt)
    c.drawString(x + 2, y - row_h + 1.8, label)
    c.drawRightString(x + total_w - 2, y - row_h + 1.8, amount)


def _draw_inwords_row(c: canvas.Canvas, x: float, y: float, total_w: float,
                      words: str, row_h: float = SUMMARY_H) -> None:
    c.setFillColor(WHITE)
    c.rect(x, y - row_h, total_w, row_h, stroke=0, fill=1)
    c.setStrokeColor(BLACK)
    c.rect(x, y - row_h, total_w, row_h, stroke=1, fill=0)
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(BLACK)
    c.drawString(x + 2, y - row_h + 1.8, "In words :-")
    c.setFont("Helvetica", 6.5)
    c.drawString(x + 28 * mm, y - row_h + 1.8, words)


# ---------------------------------------------------------------------------
# Main generator
# ---------------------------------------------------------------------------

def generate_invoice_pdf(
    extraction: Dict[str, Any],
    company_data: Dict[str, Any],
    output_dir: str,
    template_path: Optional[str] = None,
    signature_path: Optional[str] = None,
    stamp_path: Optional[str] = None,
) -> str:
    """
    Generate a tax invoice PDF.

    Args:
        extraction:    Output of extractor.extract_timesheet().
        company_data:  Owner company profile dict (see module docstring).
        output_dir:    Directory to write the output PDF.
        template_path: Path/base64 for the company letterhead template PDF/image.
        signature_path: Path/base64 for signature image.
        stamp_path:    Path/base64 for stamp image.

    Returns:
        Absolute path of the generated PDF.
    """
    _ensure_dir(output_dir)
    ts = int(datetime.now().timestamp())
    out_path = os.path.join(output_dir, f"tax-invoice-{ts}.pdf")

    c = canvas.Canvas(out_path, pagesize=A4)

    # ── Background template ───────────────────────────────────────────────
    res_tpl = _materialize_asset(template_path, output_dir, "tpl")
    res_sig = _materialize_asset(signature_path, output_dir, "sig")
    res_stmp = _materialize_asset(stamp_path, output_dir, "stmp")

    bg = _template_to_image(res_tpl, output_dir)
    if bg and os.path.exists(bg):
        c.drawImage(bg, 0, 0, width=A4_W, height=A4_H,
                    preserveAspectRatio=False, mask="auto")
    else:
        c.setFillColor(WHITE)
        c.rect(0, 0, A4_W, A4_H, stroke=0, fill=1)

    c.setStrokeColor(BLACK)
    c.setLineWidth(0.45)

    # ── Resolve company / client data ─────────────────────────────────────
    owner_name = company_data.get("name") or "Company"
    owner_trn  = company_data.get("trn") or "-"
    vat_rate   = _safe_float(company_data.get("vatRate"), 5.0)
    inv_no     = company_data.get("invoiceNumber") or "001"
    inv_date_raw = str(company_data.get("invoiceDate") or datetime.now().strftime("%d/%m/%Y"))
    inv_date_display = inv_date_raw.replace("/", ".")

    # Client: company_data overrides take priority, then fall back to extraction
    ext_client = extraction.get("client", {})
    client_name = (company_data.get("clientName") or ext_client.get("name") or "Client")
    client_trn  = (company_data.get("clientTrn")  or ext_client.get("trn")  or "")
    po_box      = (company_data.get("poBox")       or ext_client.get("po_box") or "")
    address     = (company_data.get("address")     or ext_client.get("address") or "")
    tel         = (company_data.get("tel")         or ext_client.get("tel") or "")
    fax         = (company_data.get("fax")         or ext_client.get("fax") or "")

    # Invoice rows & totals from extraction
    rows:   List[Dict[str, Any]] = extraction.get("rows", [])
    totals: Dict[str, Any]       = extraction.get("totals", {})
    meta:   Dict[str, Any]       = extraction.get("timesheet_meta", {})

    # Invoice layout: auto-detect from format, allow override
    fmt = extraction.get("format", "mcc")
    layout = company_data.get("invoice_layout") or fmt
    col_defs = BKC_COLS if layout == "bkc" else MCC_COLS

    # Month label
    inv_month = (meta.get("invoice_month") or "").upper()
    if not inv_month:
        try:
            d = datetime.strptime(inv_date_raw.split()[0], "%d/%m/%Y")
            inv_month = d.strftime("%B %Y").upper()
        except Exception:
            inv_month = ""

    # ── Title ─────────────────────────────────────────────────────────────
    c.setFillColor(BLACK)
    title_y = A4_H - 40 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString((LEFT + RIGHT) / 2, title_y, "Tax Invoice")

    # ── Invoice / Date line ───────────────────────────────────────────────
    meta_y = title_y - 7 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(LEFT + 2, meta_y, f"Invoice {inv_no}")
    c.drawRightString(RIGHT - 2, meta_y, f"Date. {inv_date_display}")

    # ── Client block ──────────────────────────────────────────────────────
    client_y = meta_y - 8 * mm
    c.setFont("Helvetica-Bold", 9.5)
    disp_name = client_name.strip()
    if not disp_name.lower().startswith("m/s"):
        disp_name = f"M/s. {disp_name}"
    c.drawString(LEFT + 2, client_y, disp_name)

    detail_lines: List[str] = []
    if po_box:
        detail_lines.append(f"P.O. Box: {po_box}")
    if address:
        detail_lines.extend(_word_wrap(address, 50))
    if tel:
        detail_lines.append(f"Tel: {tel}")
    if fax:
        detail_lines.append(f"Fax: {fax}")
    if client_trn:
        detail_lines.append(f"TRN: {client_trn}")

    c.setFont("Helvetica", 9)
    cy = client_y - 5.5 * mm
    for line in detail_lines[:8]:
        c.drawString(LEFT + 2, cy, line)
        cy -= 4.5 * mm

    # ── "Invoice for the month of …" ─────────────────────────────────────
    month_y = cy - 5 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString((LEFT + RIGHT) / 2, month_y,
                        f"Invoice for the month of {inv_month}")

    # ── Table ─────────────────────────────────────────────────────────────
    table_top = month_y - 7 * mm
    tx = LEFT + 1
    tw = CONTENT_W - 2
    vat_frac = vat_rate / 100.0

    _draw_header_row(c, tx, table_top, tw, col_defs)

    y_row = table_top - HEADER_H
    total_amount = 0.0
    total_vat    = 0.0
    total_net    = 0.0

    for i, row in enumerate(rows, start=1):
        trade    = str(row.get("trade") or "").upper()
        proj_id  = str(row.get("project_id") or "")
        emp_id   = str(row.get("employee_id") or "")
        hours    = _safe_float(row.get("hours"))
        rate     = _safe_float(row.get("rate"))
        amount   = _safe_float(row.get("amount"))

        vat_amt  = round(amount * vat_frac, 2)
        net_amt  = round(amount + vat_amt, 2)
        total_amount += amount
        total_vat    += vat_amt
        total_net    += net_amt

        hours_str = f"{hours:.0f}" if hours == int(hours) else f"{hours:.2f}"

        if layout == "bkc":
            values = [
                str(i), trade, emp_id,
                f"{rate:.2f}", hours_str,
                f"{amount:,.2f}", f"{vat_rate:.0f}%",
                f"{vat_amt:,.2f}", f"{net_amt:,.2f}",
            ]
        else:  # mcc
            values = [
                str(i), trade, proj_id, hours_str,
                f"{rate:.2f}", f"{amount:,.2f}",
                f"{vat_frac:.2f}",
                f"{vat_amt:,.3f}", f"{net_amt:,.2f}",
            ]

        _draw_data_row(c, tx, y_row, tw, col_defs, values)
        y_row -= DATA_H

    # Sub-total row (amounts only, spans full width)
    _draw_summary_row(c, tx, y_row, tw,
                      "", f"{total_amount:,.2f}  5%  {total_vat:,.2f}  {total_net:,.2f}")
    y_row -= SUMMARY_H

    # Deductions
    deduction = _safe_float(totals.get("deductions"), 0.0)
    extra_ded  = _safe_float(company_data.get("extraDeductions"), 0.0)
    total_deduction = deduction + extra_ded

    # Individual deduction lines
    breakdown: Dict[str, float] = totals.get("deduction_breakdown", {})
    if breakdown:
        for label, amt in breakdown.items():
            _draw_summary_row(c, tx, y_row, tw, label, f"{amt:,.2f}")
            y_row -= SUMMARY_H

    _draw_summary_row(c, tx, y_row, tw,
                      "TOTAL DEDUCTION", f"{total_deduction:,.2f}",
                      bold=True)
    y_row -= SUMMARY_H

    # TOTAL row (blue)
    payable = max(total_net - total_deduction, 0.0)
    _draw_summary_row(c, tx, y_row, tw,
                      "TOTAL", f"{payable:,.2f}",
                      blue=True)
    y_row -= SUMMARY_H

    # In-words row
    _draw_inwords_row(c, tx, y_row, tw, _num_to_words(payable))
    y_row -= SUMMARY_H

    # ── Footer ────────────────────────────────────────────────────────────
    footer_y = max(y_row - 28 * mm, 44 * mm)

    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(LEFT + 2, footer_y, "Thanks and Regards")
    c.setFont("Helvetica", 10)
    c.drawString(LEFT + 2, footer_y - 5.5 * mm, owner_name)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(LEFT + 2, footer_y - 10.5 * mm, f"TRN No. {owner_trn}")

    sig_y = footer_y - 28 * mm
    if res_sig and os.path.exists(res_sig):
        try:
            c.drawImage(res_sig, LEFT + 6 * mm, sig_y,
                        width=22 * mm, height=17 * mm,
                        preserveAspectRatio=True, mask="auto")
        except Exception:
            pass

    if res_stmp and os.path.exists(res_stmp):
        try:
            c.drawImage(res_stmp, LEFT + 36 * mm, sig_y,
                        width=28 * mm, height=28 * mm,
                        preserveAspectRatio=True, mask="auto")
        except Exception:
            pass

    # Fallback footer bar (when no template)
    if not (bg and os.path.exists(bg)):
        mobile  = company_data.get("mobileNumber") or ""
        email   = company_data.get("contactEmail") or ""
        website = company_data.get("websiteLink") or ""
        c.setStrokeColor(colors.HexColor("#8f98a6"))
        c.line(LEFT, 12 * mm, RIGHT, 12 * mm)
        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColor(colors.HexColor("#2a2f37"))
        c.drawString(LEFT + 1, 8.6 * mm, owner_name.upper())
        contact = " | ".join(s for s in [mobile, email, website] if s)
        if contact:
            c.setFont("Helvetica", 6.8)
            c.drawRightString(RIGHT - 1, 8.6 * mm, contact)

    c.save()
    return out_path
