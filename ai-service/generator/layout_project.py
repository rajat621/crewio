"""
generator/layout_project.py

Universal project-based invoice renderer.

Supports:
- Dynamic row count
- Auto font scaling
- Dynamic VAT
- Dynamic deductions
- Long trade names
- OCR extracted invoices
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from schema import (
    CompanyProfile,
    ExtractionResult,
    InvoiceRow,
)

from generator.utils import (
    HEADER_BLUE,
    WHITE,
    BLACK,
    LIGHT_GREY,
    DARK_TEXT,
    draw_cell,
    draw_multiline_cell,
    number_to_words,
    word_wrap,
)

# ---------------------------------------------------------------------------
# Table schema
# ---------------------------------------------------------------------------

_HEADERS = [
    ["SI NO"],
    ["TRADE"],
    ["Project", "No."],
    ["No. of", "hours"],
    ["Unit", "Price"],
    ["Amount"],
    ["VAT"],
    ["VAT", "Amount"],
    ["Net", "Amount"],
]

_FRACS = [
    0.075,
    0.155,
    0.115,
    0.105,
    0.10,
    0.115,
    0.065,
    0.115,
    0.155,
]

_ALIGNS = [
    "C",
    "L",
    "L",
    "C",
    "C",
    "R",
    "C",
    "R",
    "R",
]

_HDR_H = 7.0 * mm
_ROW_H = 5.1 * mm


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fmt_hours(h: float) -> str:

    if h == int(h):
        return f"{h:.0f}"

    return f"{h:.2f}"


def _get_font_size(row_count: int) -> float:

    if row_count <= 12:
        return 6.5

    if row_count <= 18:
        return 5.8

    if row_count <= 24:
        return 5.2

    return 4.8


# ---------------------------------------------------------------------------
# Main render function
# ---------------------------------------------------------------------------

def render_project_invoice(
    c: canvas.Canvas,
    result: ExtractionResult,
    profile: CompanyProfile,
    bg_path: Optional[str],
    sig_path: Optional[str],
    stamp_path: Optional[str],
) -> None:

    width, height = A4

    left = 36 * mm
    right = width - 12 * mm

    cw = right - left

    # -----------------------------------------------------------------------
    # Background
    # -----------------------------------------------------------------------

    if bg_path:

        try:

            c.drawImage(
                bg_path,
                0,
                0,
                width=width,
                height=height,
                preserveAspectRatio=False,
                mask="auto",
            )

        except Exception:
            pass

    else:

        c.setFillColor(WHITE)

        c.rect(
            0,
            0,
            width,
            height,
            stroke=0,
            fill=1,
        )

    # -----------------------------------------------------------------------
    # Invoice title
    # -----------------------------------------------------------------------

    c.setFillColor(BLACK)

    c.setFont("Helvetica-Bold", 9)

    c.drawCentredString(
        (left + right) / 2,
        height - 40 * mm,
        "Tax Invoice",
    )

    # -----------------------------------------------------------------------
    # Invoice meta
    # -----------------------------------------------------------------------

    inv_date_raw = (
        profile.invoice_date
        or datetime.now().strftime("%d/%m/%Y")
    )

    inv_date_disp = inv_date_raw.replace("/", ".")

    meta_y = height - 47 * mm

    c.setFont("Helvetica-Bold", 9)

    c.drawString(
        left + 2,
        meta_y,
        f"Invoice No.{profile.invoice_number}",
    )

    c.drawRightString(
        right - 2,
        meta_y,
        f"Date. {inv_date_disp}",
    )

    # -----------------------------------------------------------------------
    # Client block
    # -----------------------------------------------------------------------

    meta = result.metadata

    client_name = (
        meta.client_name
        or profile.__dict__.get("clientName")
        or "Client"
    )

    client_trn = (
        meta.client_trn
        or profile.__dict__.get("clientTrn")
        or ""
    )

    client_addr = (
        meta.client_address
        or profile.__dict__.get("address")
        or ""
    )

    po_box = (
        meta.client_po_box
        or profile.__dict__.get("poBox")
        or ""
    )

    tel = (
        meta.client_tel
        or profile.mobile
        or ""
    )

    cl_y = meta_y - 7 * mm

    c.setFont("Helvetica-Bold", 9)

    display_name = (
        client_name
        if client_name.lower().startswith("m/s")
        else f"M/s. {client_name}"
    )

    c.drawString(
        left + 2,
        cl_y,
        display_name,
    )

    details = []

    if po_box:
        details.append(f"PO Box {po_box}")

    if tel:
        details.append(f"Tel No {tel}")

    details.extend(
        word_wrap(client_addr, 50)
    )

    if client_trn:
        details.append(f"TRN: {client_trn}")

    c.setFont("Helvetica", 8.5)

    dy = cl_y - 5 * mm

    for line in details[:7]:

        c.drawString(left + 2, dy, line)

        dy -= 4.2 * mm

    # -----------------------------------------------------------------------
    # Month label
    # -----------------------------------------------------------------------

    period = (
        meta.period_month
        or (meta.period_to or "").replace("/", ".")
        or ""
    )

    if not period:

        try:

            d = datetime.strptime(
                inv_date_raw.split()[0],
                "%d/%m/%Y"
            )

            period = d.strftime("%B %Y").upper()

        except Exception:

            period = ""

    month_y = dy - 5 * mm

    c.setFont("Helvetica-Bold", 10)

    c.drawCentredString(
        (left + right) / 2,
        month_y,
        f"Invoice for the month of {period}",
    )

    # -----------------------------------------------------------------------
    # Table setup
    # -----------------------------------------------------------------------

    table_top = month_y - 7 * mm

    tx = left + 1

    tw = cw - 2

    col_w = [tw * f for f in _FRACS]

    vat_rate = profile.vat_rate

    rows: List[InvoiceRow] = result.rows

    font_size = _get_font_size(len(rows))

    # -----------------------------------------------------------------------
    # Header row
    # -----------------------------------------------------------------------

    hx = tx

    for idx, hdr_lines in enumerate(_HEADERS):

        draw_multiline_cell(
            c,
            hx,
            table_top - _HDR_H,
            col_w[idx],
            _HDR_H,
            hdr_lines,
        )

        hx += col_w[idx]

    # -----------------------------------------------------------------------
    # Data rows
    # -----------------------------------------------------------------------

    y_row = table_top - _HDR_H

    total_amt = 0.0
    total_vat_amt = 0.0
    total_net = 0.0

    for i, row in enumerate(rows, 1):

        if y_row < 70 * mm:
            break

        y_row -= _ROW_H

        rx = tx

        vals = [
            str(i),
            row.trade,
            row.project_id or "-",
            _fmt_hours(row.hours),
            f"{row.rate:.2f}",
            f"{row.amount:,.2f}",
            f"{vat_rate * 100:.0f}%",
            f"{row.vat_amount:,.2f}",
            f"{row.net_amount:,.2f}",
        ]

        total_amt += row.amount
        total_vat_amt += row.vat_amount
        total_net += row.net_amount

        for idx, val in enumerate(vals):

            draw_cell(
                c,
                rx,
                y_row,
                col_w[idx],
                _ROW_H,
                val,
                _ALIGNS[idx],
                size=font_size,
            )

            rx += col_w[idx]

    # -----------------------------------------------------------------------
    # Deduction row
    # -----------------------------------------------------------------------

    deduction = result.financials.total_deduction

    y_row -= _ROW_H

    draw_cell(
        c,
        tx,
        y_row,
        tw,
        _ROW_H,
        "",
        "L",
        size=7,
    )

    c.setFont("Helvetica-Bold", 7)

    c.setFillColor(BLACK)

    c.drawString(
        tx + 2,
        y_row + 2,
        "TOTAL DEDUCTION",
    )

    c.drawRightString(
        tx + tw - 2,
        y_row + 2,
        f"{deduction:,.2f}",
    )

    # -----------------------------------------------------------------------
    # Total row
    # -----------------------------------------------------------------------

    payable = max(total_net - deduction, 0.0)

    y_row -= _ROW_H

    draw_cell(
        c,
        tx,
        y_row,
        tw,
        _ROW_H,
        "",
        "L",
        fill_color=HEADER_BLUE,
    )

    c.setFont("Helvetica-Bold", 8)

    c.setFillColor(WHITE)

    c.drawString(
        tx + 2,
        y_row + 2,
        "TOTAL",
    )

    c.drawRightString(
        tx + tw - 2,
        y_row + 2,
        f"{payable:,.2f}",
    )

    # -----------------------------------------------------------------------
    # Amount in words
    # -----------------------------------------------------------------------

    y_row -= _ROW_H

    draw_cell(
        c,
        tx,
        y_row,
        tw,
        _ROW_H,
        "",
        "L",
    )

    c.setFont("Helvetica-Bold", 7)

    c.setFillColor(BLACK)

    c.drawString(
        tx + 2,
        y_row + 2,
        "In words :-",
    )

    c.setFont("Helvetica", 6.8)

    c.drawString(
        tx + 28 * mm,
        y_row + 2,
        number_to_words(payable),
    )

    # -----------------------------------------------------------------------
    # Footer
    # -----------------------------------------------------------------------

    footer_y = max(
        y_row - 28 * mm,
        44 * mm,
    )

    c.setFillColor(BLACK)

    c.setFont("Helvetica-Bold", 10)

    c.drawString(
        left + 2,
        footer_y,
        "Thanks        and        Regards",
    )

    c.setFont("Helvetica", 10)

    c.drawString(
        left + 2,
        footer_y - 5.5 * mm,
        profile.name,
    )

    c.setFont("Helvetica-Bold", 9)

    c.drawString(
        left + 2,
        footer_y - 10.5 * mm,
        f"TRN No. {profile.trn}",
    )

    # -----------------------------------------------------------------------
    # Signature
    # -----------------------------------------------------------------------

    if sig_path:

        try:

            c.drawImage(
                sig_path,
                left + 8 * mm,
                footer_y - 26 * mm,
                width=22 * mm,
                height=17 * mm,
                preserveAspectRatio=True,
                mask="auto",
            )

        except Exception:
            pass

    # -----------------------------------------------------------------------
    # Stamp
    # -----------------------------------------------------------------------

    if stamp_path:

        try:

            c.drawImage(
                stamp_path,
                left + 38 * mm,
                footer_y - 25 * mm,
                width=25 * mm,
                height=25 * mm,
                preserveAspectRatio=True,
                mask="auto",
            )

        except Exception:
            pass

    # -----------------------------------------------------------------------
    # Fallback footer
    # -----------------------------------------------------------------------

    if not bg_path:

        from reportlab.lib.units import mm as _mm

        c.setStrokeColor(LIGHT_GREY)

        c.line(
            left,
            12 * _mm,
            right,
            12 * _mm,
        )

        c.setFont("Helvetica-Bold", 7.5)

        c.setFillColor(DARK_TEXT)

        c.drawString(
            left + 1,
            8.6 * _mm,
            profile.name.upper(),
        )

        c.setFont("Helvetica", 6.8)

        contact = " | ".join(
            s
            for s in [
                profile.mobile,
                profile.email,
                profile.website,
            ]
            if s
        )

        if contact:

            c.drawRightString(
                right - 1,
                8.6 * _mm,
                contact,
            )