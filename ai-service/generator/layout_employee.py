"""
generator/layout_employee.py

Renders the BKC-style tax invoice:
  Columns: SI NO | TRADE | ID NO | UNIT PRICE | HOURS | AMOUNT |
           VAT | VAT AMOUNT | NET AMOUNT

Reference sample: INVOICE_BKC_OCT-1.pdf
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from schema import CompanyProfile, ExtractionResult, InvoiceRow
from generator.utils import (
    HEADER_BLUE, WHITE, BLACK, LIGHT_GREY, DARK_TEXT,
    draw_cell, draw_multiline_cell, number_to_words, word_wrap,
)

# ---------------------------------------------------------------------------
# Table schema – BKC layout
# ---------------------------------------------------------------------------

_HEADERS = [
    ["SI", "NO"],
    ["TRADE"],
    ["ID NO"],
    ["UNIT", "PRICE"],
    ["HOURS"],
    ["AMOUNT"],
    ["VAT"],
    ["VAT", "AMOUNT"],
    ["NET", "AMOUNT"],
]
_FRACS  = [0.065, 0.165, 0.115, 0.095, 0.085, 0.12, 0.055, 0.13, 0.17]
_ALIGNS = ["C", "L", "C", "C", "C", "R", "C", "R", "R"]

_HDR_H  = 7.0 * mm
_ROW_H  = 5.5 * mm      # slightly taller rows for BKC style


def _fmt_hours(h: float) -> str:
    return f"{h:.0f}" if h == int(h) else f"{h:.2f}"


# ---------------------------------------------------------------------------
# Public render function
# ---------------------------------------------------------------------------

def render_employee_invoice(
    c: canvas.Canvas,
    result: ExtractionResult,
    profile: CompanyProfile,
    bg_path: Optional[str],
    sig_path: Optional[str],
    stamp_path: Optional[str],
) -> None:
    width, height = A4
    left  = 36 * mm
    right = width - 12 * mm
    cw    = right - left

    # ---- Background ----
    if bg_path:
        try:
            c.drawImage(bg_path, 0, 0, width=width, height=height,
                        preserveAspectRatio=False, mask="auto")
        except Exception:
            pass
    else:
        c.setFillColor(WHITE)
        c.rect(0, 0, width, height, stroke=0, fill=1)

    # ---- Header ----
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString((left + right) / 2, height - 40 * mm, "Tax Invoice")

    # ---- Invoice meta ----
    inv_date_raw  = profile.invoice_date or datetime.now().strftime("%d/%m/%Y")
    inv_date_disp = inv_date_raw.replace("/", ".")
    meta_y = height - 47 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(left + 2, meta_y, f"Invoice {profile.invoice_number}")
    c.drawRightString(right - 2, meta_y, f"Date. {inv_date_disp}")

    # ---- Client block ----
    meta = result.metadata
    client_name = meta.client_name or "Client"
    client_trn  = meta.client_trn  or ""
    client_addr = meta.client_address or ""
    po_box      = meta.client_po_box or ""
    tel         = meta.client_tel or ""

    cl_y = meta_y - 8 * mm
    c.setFont("Helvetica-Bold", 9)
    disp = client_name if client_name.lower().startswith("m/s") else f"M/s. {client_name}"
    c.drawString(left + 2, cl_y, disp)

    details: List[str] = []
    if po_box:
        details.append(f"P.O. Box: {po_box}")
    details.extend(word_wrap(client_addr, 55))
    if tel:
        details.append(f"Tel No. {tel}")
    if client_trn:
        details.append(f"TRN: {client_trn}")

    c.setFont("Helvetica", 8.5)
    dy = cl_y - 5 * mm
    for line in details[:7]:
        c.drawString(left + 2, dy, line)
        dy -= 4.5 * mm

    # ---- Month label ----
    period = (
        meta.period_month
        or ""
    )
    if not period:
        try:
            d = datetime.strptime(inv_date_raw.split()[0], "%d/%m/%Y")
            period = d.strftime("%B %Y").upper()
        except Exception:
            period = ""
    month_y = dy - 6 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString((left + right) / 2, month_y,
                        f"Invoice for the month of {period}")

    # ---- Table ----
    table_top = month_y - 8 * mm
    tx  = left + 1
    tw  = cw - 2
    col_w = [tw * f for f in _FRACS]
    vat_rate = profile.vat_rate

    # Header
    hx = tx
    for idx, hdr_lines in enumerate(_HEADERS):
        draw_multiline_cell(c, hx, table_top - _HDR_H, col_w[idx], _HDR_H, hdr_lines)
        hx += col_w[idx]

    y_row = table_top - _HDR_H
    rows: List[InvoiceRow] = result.rows
    total_amt = total_vat_amt = total_net = 0.0

    for i, row in enumerate(rows, 1):
        y_row -= _ROW_H
        rx = tx
        # BKC uses percentage string for VAT column
        vat_pct = f"{int(vat_rate * 100)}%"
        vals = [
            str(i),
            row.trade,
            row.employee_id or "-",
            f"{row.rate:.2f}",
            _fmt_hours(row.hours),
            f"{row.amount:,.2f}",
            vat_pct,
            f"{row.vat_amount:,.2f}",
            f"{row.net_amount:,.2f}",
        ]
        total_amt     += row.amount
        total_vat_amt += row.vat_amount
        total_net     += row.net_amount

        for idx, val in enumerate(vals):
            draw_cell(c, rx, y_row, col_w[idx], _ROW_H, val, _ALIGNS[idx],
                      size=6.5)
            rx += col_w[idx]

    # Sub-total row (light)
    y_row -= _ROW_H
    _draw_summary_row(c, tx, y_row, tw, col_w, _ROW_H,
                      total_amt, vat_rate, total_vat_amt, total_net)

    # TOTAL DEDUCTION
    deduction = result.financials.total_deduction
    y_row -= _ROW_H
    draw_cell(c, tx, y_row, tw, _ROW_H, "", "L")
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(BLACK)
    c.drawString(tx + 2, y_row + 2, "TOTAL DEDUCTION")
    c.drawString(tx + tw * 0.50, y_row + 2, f"{vat_rate*100:.0f}%")
    c.drawString(tx + tw * 0.66, y_row + 2,
                 f"{round(deduction * vat_rate, 2):,.2f}")
    c.drawRightString(tx + tw - 2, y_row + 2,
                      f"{round(deduction * (1 + vat_rate), 2):,.2f}")

    # TOTAL row (bold)
    payable = max(total_net - deduction, 0.0)
    y_row -= _ROW_H
    draw_cell(c, tx, y_row, tw, _ROW_H, "", "L")
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(BLACK)
    c.drawString(tx + 2, y_row + 2, "TOTAL")
    c.drawRightString(tx + tw - 2, y_row + 2, f"{payable:,.2f}")

    # IN WORDS row
    y_row -= _ROW_H
    draw_cell(c, tx, y_row, tw, _ROW_H, "", "L")
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(BLACK)
    c.drawString(tx + 2, y_row + 2, "IN WORDS=")
    c.setFont("Helvetica", 6.8)
    c.drawString(tx + 24 * mm, y_row + 2,
                 number_to_words(payable).upper())

    # ---- Footer ----
    footer_y = max(y_row - 25 * mm, 50 * mm)
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(left + 2, footer_y, f"Thanks and Regards {profile.name}")
    c.setFont("Helvetica", 9)
    c.drawString(left + 2, footer_y - 5 * mm, profile.name)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(left + 2, footer_y - 10 * mm, f"TRN No. {profile.trn}")

    if sig_path:
        try:
            c.drawImage(sig_path, left + 2, footer_y - 35 * mm,
                        width=30 * mm, height=30 * mm,
                        preserveAspectRatio=True, mask="auto")
        except Exception:
            pass

    if stamp_path:
        try:
            c.drawImage(stamp_path, left + 35 * mm, footer_y - 35 * mm,
                        width=30 * mm, height=30 * mm,
                        preserveAspectRatio=True, mask="auto")
        except Exception:
            pass

    # Fallback footer bar
    if not bg_path:
        c.setStrokeColor(LIGHT_GREY)
        c.line(left, 12 * mm, right, 12 * mm)
        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColor(DARK_TEXT)
        c.drawString(left + 1, 8.6 * mm, profile.name.upper())
        c.setFont("Helvetica", 6.8)
        contact = " | ".join(s for s in [profile.mobile, profile.email, profile.website] if s)
        if contact:
            c.drawRightString(right - 1, 8.6 * mm, contact)


def _draw_summary_row(
    c: canvas.Canvas,
    tx: float, y: float, tw: float,
    col_w: list, row_h: float,
    total_amt: float, vat_rate: float,
    total_vat: float, total_net: float,
) -> None:
    """Draw the running subtotal row before deductions."""
    draw_cell(c, tx, y, tw, row_h, "", "L")
    c.setFont("Helvetica", 6.5)
    c.setFillColor(BLACK)
    # Amount column (idx=5)
    x_amt = tx + sum(col_w[:5])
    c.drawRightString(x_amt + col_w[5] - 1.5, y + 2, f"{total_amt:,.2f}")
    # VAT pct
    x_vat = x_amt + col_w[5]
    c.drawCentredString(x_vat + col_w[6] / 2, y + 2, f"{int(vat_rate*100)}%")
    # VAT amount
    x_vata = x_vat + col_w[6]
    c.drawRightString(x_vata + col_w[7] - 1.5, y + 2, f"{total_vat:,.2f}")
    # Net amount
    x_net = x_vata + col_w[7]
    c.drawRightString(x_net + col_w[8] - 1.5, y + 2, f"{total_net:,.2f}")
