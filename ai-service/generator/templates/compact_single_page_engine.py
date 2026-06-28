<<<<<<< HEAD
﻿"""
=======
"""
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
Compact single-page invoice engine.

REQUIREMENT: Everything MUST fit on ONE A4 page.
- Never split rows to next page
- Never create multi-page output
- Progressively compress: font → row height → margins → padding
- Keep header, table, totals, signature all on one page
"""

from __future__ import annotations

from datetime import datetime
import logging
import os
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from schema import CompanyProfile, ExtractionResult, InvoiceRow

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CompressedLayout:
    """Computed layout parameters after compression."""
    font_size_header: float       # Table header font
    font_size_data: float         # Table data font
    font_size_totals: float       # Totals section font
    row_height: float             # Table row height in points
    margin_top: float             # Absolute top Y in ReportLab coordinates
    margin_bottom: float          # Absolute bottom Y in ReportLab coordinates
    margin_left: float            # Left content margin
    margin_right: float           # Right content margin
    header_height: float          # Reserved for invoice title + client info
    table_start_y: float          # Where table starts
    table_max_rows: int           # Max rows that fit
    signature_area_height: float  # Reserved for signature/stamp


class CompactSinglePageInvoiceEngine:
    """
    Render complete invoice on ONE page with dynamic compression.
    
    Layout (top to bottom):
    1. Invoice title + Client details (fixed height)
    2. Table (header + data rows + totals rows)
    3. Signature / Stamp area
    4. Footer with company details
    """

    PAGE_WIDTH, PAGE_HEIGHT = A4
    MIN_FONT_SIZE = 6.0
    MIN_ROW_HEIGHT = 11.5

    def __init__(self) -> None:
        self.page_width = self.PAGE_WIDTH
        self.page_height = self.PAGE_HEIGHT

    def compress_for_single_page(
        self,
        row_count: int,
        base_font: float = 8.0,
        base_row_height: float = 16.0,
        base_margin_h: float = 50.0,
        base_margin_v: float = 40.0,
    ) -> CompressedLayout:
        """
        Calculate layout parameters that fit everything on one page.
        
        Progressive compression strategy:
        1. If rows fit at base size → use base
        2. If not → shrink font progressively
        3. If still not → shrink row height
        4. If still not → shrink margins
        5. Stop at MIN thresholds
        """
        # Reserved heights
        HEADER_HEIGHT = 80.0                    # Invoice title + client info
        TOTALS_ROWS_HEIGHT_FACTOR = 1.5         # "TOTAL DEDUCTION", "TOTAL", "In words" rows
        SIGNATURE_AREA = 60.0                   # Signature + stamp
        FOOTER_HEIGHT = 0.0                     # Footer belongs to owner template background
        TABLE_HEADER_HEIGHT = 18.0              # Column headers

        available_y = (
            self.page_height
            - (base_margin_v * 2)
            - HEADER_HEIGHT
            - TABLE_HEADER_HEIGHT
            - SIGNATURE_AREA
            - FOOTER_HEIGHT
        )

        font_size = base_font
        row_height = base_row_height
        margin_h = base_margin_h
        margin_v = base_margin_v

        # Try to fit rows_count + 3 totals rows
        total_rows_needed = row_count + 3
        required_height = total_rows_needed * row_height

        # Phase 1: Compress font
        while required_height > available_y and font_size > self.MIN_FONT_SIZE:
            font_size -= 0.5
            row_height = font_size + 6.0
            required_height = total_rows_needed * row_height

        # Phase 2: Compress row height further
        while required_height > available_y and row_height > self.MIN_ROW_HEIGHT:
            row_height -= 0.5
            required_height = total_rows_needed * row_height

        # Phase 3: Compress margins
        while required_height > available_y and margin_h > 20.0:
            margin_h -= 5.0
            available_y = (
                self.page_height
                - (margin_v * 2)
                - HEADER_HEIGHT
                - TABLE_HEADER_HEIGHT
                - SIGNATURE_AREA
                - FOOTER_HEIGHT
            )

        # Calculate final layout
        table_start_y = self.page_height - margin_v - HEADER_HEIGHT - TABLE_HEADER_HEIGHT
        margin_left = margin_h
        margin_right = self.page_width - margin_h

        return CompressedLayout(
            font_size_header=max(self.MIN_FONT_SIZE, font_size - 1.0),
            font_size_data=font_size,
            font_size_totals=font_size - 0.5,
            row_height=row_height,
            margin_top=self.page_height - margin_v,
            margin_bottom=margin_v,
            margin_left=margin_left,
            margin_right=margin_right,
            header_height=HEADER_HEIGHT,
            table_start_y=table_start_y,
            table_max_rows=int(available_y / row_height),
            signature_area_height=SIGNATURE_AREA,
        )

    def compress_for_single_page_with_safe_zone(
        self,
        row_count: int,
        safe_zone: Dict[str, float],
        base_font: float = 8.0,
        base_row_height: float = 15.6,
    ) -> CompressedLayout:
        """
        Calculate layout within template safe-zone boundaries.
        
        Safe zone dict: {content_left, content_right, content_top, content_bottom}
        Converts pixels to points and respects template branding zones.
        """
        margin_left = max(28.0, float(safe_zone.get("content_left", 50.0)) - 3.0)
        margin_right = min(self.page_width - 24.0, float(safe_zone.get("content_right", self.page_width - 50.0)) + 3.0)
        content_top = float(safe_zone.get("content_top", self.page_height - 100.0))
        content_bottom = float(safe_zone.get("content_bottom", 100.0))
        if content_top <= content_bottom:
            content_top = self.page_height - 120.0
            content_bottom = 120.0

        # Reserved heights within safe zone
        HEADER_HEIGHT = 108.0
        SIGNATURE_AREA = 74.0
        TABLE_HEADER_HEIGHT = 18.0
        MIN_GAP = 8.0

        available_height = content_top - content_bottom - HEADER_HEIGHT - TABLE_HEADER_HEIGHT - SIGNATURE_AREA - MIN_GAP

        font_size = base_font
        row_height = base_row_height
        total_rows_needed = row_count + 3
        required_height = total_rows_needed * row_height

        # Progressive compression priority:
        # 1. reduce table font
        # 2. reduce row height
        # 3. reduce section heights (padding/spacing/totals area)
        while required_height > available_height and font_size > self.MIN_FONT_SIZE:
            font_size -= 0.5
            row_height = font_size + 6.0
            required_height = total_rows_needed * row_height

        while required_height > available_height and row_height > self.MIN_ROW_HEIGHT:
            row_height -= 0.5
            required_height = total_rows_needed * row_height

        while required_height > available_height and HEADER_HEIGHT > 80.0:
            HEADER_HEIGHT -= 2.0
            SIGNATURE_AREA = max(54.0, SIGNATURE_AREA - 1.0)
            TABLE_HEADER_HEIGHT = max(14.0, TABLE_HEADER_HEIGHT - 0.5)
            available_height = content_top - content_bottom - HEADER_HEIGHT - TABLE_HEADER_HEIGHT - SIGNATURE_AREA - MIN_GAP

        table_start_y = content_top - HEADER_HEIGHT

        return CompressedLayout(
            font_size_header=max(self.MIN_FONT_SIZE, font_size - 1.0),
            font_size_data=font_size,
            font_size_totals=font_size - 0.5,
            row_height=row_height,
            margin_top=content_top,
            margin_bottom=content_bottom,
            margin_left=margin_left,
            margin_right=margin_right,
            header_height=HEADER_HEIGHT,
            table_start_y=table_start_y,
            table_max_rows=int(available_height / row_height),
            signature_area_height=SIGNATURE_AREA,
        )

    def render(
        self,
        c: canvas.Canvas,
        result: ExtractionResult,
        profile: CompanyProfile,
        client_details: Dict[str, str],
        signature_path: Optional[str],
        stamp_path: Optional[str],
        safe_zone: Optional[Dict[str, float]] = None,
    ) -> None:
        """
        Render complete invoice on single page.
        Everything MUST fit: header + table + totals + signature + footer.
        
        Args:
            c: ReportLab canvas
            result: Extraction result with rows and financials
            profile: Company profile (owner)
            client_details: Client name, TRN, address
            signature_path: Path to signature image (owner only)
            stamp_path: Path to stamp image (owner only)
            safe_zone: Optional safe zone dict with margins to avoid template branding
        """
        rows = result.rows or []
        
        # Use safe zone if provided, otherwise use full page with default margins
        if safe_zone:
            layout = self.compress_for_single_page_with_safe_zone(
                row_count=len(rows),
                safe_zone=safe_zone
            )
        else:
            layout = self.compress_for_single_page(len(rows))

        # Draw all content
        self._draw_invoice_header(c, layout, profile, client_details)
        table_shift = self._vertical_table_shift(len(rows))
        table_end_y = self._draw_main_table(c, layout, rows, result, table_top_y_override=(layout.table_start_y - table_shift))
        self._draw_signature_footer(c, layout, profile, signature_path, stamp_path, table_end_y)

    def _draw_invoice_header(
        self,
        c: canvas.Canvas,
        layout: CompressedLayout,
        profile: CompanyProfile,
        client_details: Dict[str, str],
    ) -> None:
        """Draw UAE-style invoice metadata block with cleaner vertical rhythm."""
        left = layout.margin_left
        right = layout.margin_right
        top_y = layout.margin_top
        center_x = (left + right) / 2

        inv_no = (profile.invoice_number or "INV-001").strip()
        inv_date = self._format_date(profile.invoice_date)
        month_label = self._month_label(profile.invoice_date)

        client_name = (client_details.get("name") or "Client").strip()
        client_trn = (client_details.get("trn") or "-").strip()
        client_address = (client_details.get("address") or "").strip()

        y_title = top_y - 11
        y_meta = y_title - 21
        y_client = y_meta - 17
        y_month = top_y - layout.header_height + 16

        c.setFillColorRGB(0.0, 0.0, 0.0)
        c.setFont("Helvetica-Bold", max(12.0, layout.font_size_header + 2.7))
        c.drawCentredString(center_x, y_title, "Tax Invoice")

        c.setFont("Helvetica-Bold", max(8.2, layout.font_size_header - 0.1))
        c.drawString(left, y_meta, f"Invoice No.{inv_no}")
        c.drawRightString(right, y_meta, f"Date. {inv_date}")

        c.setFont("Helvetica-Bold", max(8.0, layout.font_size_header - 0.6))
        c.drawString(left, y_client, client_name)

        c.setFont("Helvetica", max(7.0, layout.font_size_header - 1.4))
        c.drawString(left, y_client - 11, f"TRN: {client_trn}")
        if client_address:
            c.drawString(left, y_client - 21, self._truncate(client_address, 62))

        c.setFont("Helvetica-Bold", max(8.1, layout.font_size_header - 0.35))
        c.drawCentredString(center_x, y_month, f"Invoice for the month of {month_label}")

    def _draw_main_table(
        self,
        c: canvas.Canvas,
        layout: CompressedLayout,
        rows: Sequence[InvoiceRow],
        result: ExtractionResult,
        table_top_y_override: Optional[float] = None,
    ) -> float:
        """
        Draw unified table with:
        - Header (blue background): S.NO | TRADE | ProjectNo. | Hours | Unit Price | Amount | VAT% | VAT Amount | NetAmount
        - Data rows
        - Totals rows: TOTAL DEDUCTION | TOTAL | In words
        """
        left = layout.margin_left
        right = layout.margin_right
        width = right - left
        table_top_y = table_top_y_override if table_top_y_override is not None else layout.table_start_y

        show_project = self._should_show_project_column(rows)
        if show_project:
            columns = ["SI NO", "TRADE", "ProjectNo.", "No. of hours", "UnitPrice", "Amount", "VAT", "VAT Amount", "NetAmount"]
            fracs = [0.055, 0.205, 0.105, 0.095, 0.115, 0.13, 0.07, 0.105, 0.12]
        else:
            columns = ["SI NO", "TRADE", "No. of hours", "UnitPrice", "Amount", "VAT", "VAT Amount", "NetAmount"]
            fracs = [0.06, 0.25, 0.105, 0.125, 0.155, 0.08, 0.11, 0.115]

        # Draw header row (blue background)
        c.setFont("Helvetica-Bold", layout.font_size_header)
        c.setFillColorRGB(0.13, 0.41, 0.68)  # Blue color
        c.setStrokeColorRGB(0.0, 0.0, 0.0)

        x = left
        col_widths: List[float] = [width * f for f in fracs]

        for header, w in zip(columns, col_widths):
            c.rect(x, table_top_y, w, layout.row_height, stroke=1, fill=1)
            c.setFillColorRGB(1.0, 1.0, 1.0)  # White text
            c.drawString(x + 2, table_top_y + max(3.5, layout.row_height * 0.30), header)
            c.setFillColorRGB(0.13, 0.41, 0.68)  # Reset to blue
            x += w

        # Draw data rows
        c.setFillColorRGB(0.0, 0.0, 0.0)  # Black text for data
        y = table_top_y - layout.row_height
        c.setFont("Helvetica", layout.font_size_data)

        for idx, row in enumerate(rows, 1):
            row_vat_rate = float(getattr(row, "vat_rate", 0.05) or 0.05)
            vat_amt = float(getattr(row, "vat_amount", 0.0) or ((row.amount or 0.0) * row_vat_rate))
            net_amt = float(getattr(row, "net_amount", 0.0) or ((row.amount or 0.0) + vat_amt))

            if show_project:
                values = [
                    str(idx),
                    (row.trade or "")[:16],
                    ((row.project_id or "").strip())[:10],
                    f"{row.hours or 0.0:.1f}",
                    f"{row.rate or 0.0:.2f}",
                    f"{row.amount or 0.0:,.2f}",
                    f"{row_vat_rate * 100:.0f}",
                    f"{vat_amt:,.2f}",
                    f"{net_amt:,.2f}",
                ]
                aligns = ["L", "L", "L", "R", "R", "R", "R", "R", "R"]
            else:
                values = [
                    str(idx),
                    (row.trade or "")[:20],
                    f"{row.hours or 0.0:.1f}",
                    f"{row.rate or 0.0:.2f}",
                    f"{row.amount or 0.0:,.2f}",
                    f"{row_vat_rate * 100:.0f}",
                    f"{vat_amt:,.2f}",
                    f"{net_amt:,.2f}",
                ]
                aligns = ["L", "L", "R", "R", "R", "R", "R", "R"]

            x = left
            for val, align, w in zip(values, aligns, col_widths):
                c.rect(x, y, w, layout.row_height, stroke=1, fill=0)
                baseline = y + max(2.7, layout.row_height * 0.25)
                if align == "R":
                    c.drawRightString(x + w - 2, baseline, val)
                else:
                    c.drawString(x + 2, baseline, val)
                x += w

            y -= layout.row_height

        # Totals rows
        c.setFont("Helvetica-Bold", layout.font_size_totals)
        c.setFillColorRGB(0.96, 0.96, 0.96)
        c.rect(left, y, width, layout.row_height, stroke=0, fill=1)
        c.setFillColorRGB(0.0, 0.0, 0.0)

        # ── Pre-compute all financial values once, shared by both totals rows ──
        label_span_cols = 3 if show_project else 2
        first_empty_col = label_span_cols
        amount_idx  = first_empty_col + 2
        vat_pct_idx = amount_idx + 1
        vat_amt_idx = amount_idx + 2
        net_amt_idx = amount_idx + 3

        # Use only finalized upstream financials (no renderer-side recomputation/fallback).
        subtotal = float(result.financials.subtotal or 0.0)
        deduction_amt = float(result.financials.total_deduction or 0.0)
        deduction_vat = float(result.financials.deduction_vat or 0.0)
        deduction_with_vat = float(result.financials.deduction_total_with_vat or 0.0)
        adjusted_subtotal = float(result.financials.adjusted_subtotal or 0.0)
        output_vat = float(result.financials.total_vat or 0.0)
        final_net = float(result.financials.net_payable or 0.0)
        vat_percent = (output_vat / adjusted_subtotal) * 100.0 if adjusted_subtotal > 0 else 5.0

        # ── TOTAL DEDUCTION row ──
        x = left
        deduction_cell_width = sum(col_widths[:label_span_cols])
        c.rect(x, y, deduction_cell_width, layout.row_height, stroke=1, fill=0)
        c.drawString(x + 2, y + max(2.6, layout.row_height * 0.25), "TOTAL DEDUCTION")
        x += deduction_cell_width

        # Empty "No. of hours" and "UnitPrice" cells
        for i in range(first_empty_col, first_empty_col + 2):
            c.rect(x, y, col_widths[i], layout.row_height, stroke=1, fill=0)
            x += col_widths[i]

        # Amount: deduction subtotal
        c.rect(x, y, col_widths[amount_idx], layout.row_height, stroke=1, fill=0)
        c.drawRightString(x + col_widths[amount_idx] - 2, y + max(2.6, layout.row_height * 0.25), f"{deduction_amt:,.2f}")
        x += col_widths[amount_idx]

        # VAT rate on deduction
        c.rect(x, y, col_widths[vat_pct_idx], layout.row_height, stroke=1, fill=0)
        c.drawRightString(x + col_widths[vat_pct_idx] - 2, y + max(2.6, layout.row_height * 0.25), f"{vat_percent:.2f}")
        x += col_widths[vat_pct_idx]

        # VAT amount on deduction
        c.rect(x, y, col_widths[vat_amt_idx], layout.row_height, stroke=1, fill=0)
        c.drawRightString(x + col_widths[vat_amt_idx] - 2, y + max(2.6, layout.row_height * 0.25), f"{deduction_vat:,.3f}")
        x += col_widths[vat_amt_idx]

        # Total deduction including VAT
        c.rect(x, y, col_widths[net_amt_idx], layout.row_height, stroke=1, fill=0)
        c.drawRightString(x + col_widths[net_amt_idx] - 2, y + max(2.6, layout.row_height * 0.25), f"{deduction_with_vat:,.3f}")
        x += col_widths[net_amt_idx]

        # ── TOTAL row ──
        y -= (layout.row_height - 0.2)
        c.setFillColorRGB(0.94, 0.94, 0.94)
        c.rect(left, y, width, layout.row_height, stroke=0, fill=1)
        c.setFillColorRGB(0.0, 0.0, 0.0)

        x = left
        total_cell_width = sum(col_widths[:label_span_cols])
        c.rect(x, y, total_cell_width, layout.row_height, stroke=1, fill=0)
        c.drawString(x + 2, y + max(2.6, layout.row_height * 0.25), "TOTAL")
        x += total_cell_width

        # Empty "No. of hours" and "UnitPrice" cells
        for i in range(first_empty_col, first_empty_col + 2):
            c.rect(x, y, col_widths[i], layout.row_height, stroke=1, fill=0)
            x += col_widths[i]

        # Amount: adjusted subtotal (subtotal − deduction)
        c.rect(x, y, col_widths[amount_idx], layout.row_height, stroke=1, fill=0)
        c.drawRightString(x + col_widths[amount_idx] - 2, y + max(2.6, layout.row_height * 0.25), f"{adjusted_subtotal:,.2f}")
        x += col_widths[amount_idx]

        # VAT rate
        c.rect(x, y, col_widths[vat_pct_idx], layout.row_height, stroke=1, fill=0)
        c.drawRightString(x + col_widths[vat_pct_idx] - 2, y + max(2.6, layout.row_height * 0.25), f"{vat_percent:.2f}")
        x += col_widths[vat_pct_idx]

        # Output VAT amount
        c.rect(x, y, col_widths[vat_amt_idx], layout.row_height, stroke=1, fill=0)
        c.drawRightString(x + col_widths[vat_amt_idx] - 2, y + max(2.6, layout.row_height * 0.25), f"{output_vat:,.4f}")
        x += col_widths[vat_amt_idx]

        # Final net = adjusted_subtotal + output_vat
        net_payable = final_net
        c.rect(x, y, col_widths[net_amt_idx], layout.row_height, stroke=1, fill=0)
        c.drawRightString(x + col_widths[net_amt_idx] - 2, y + max(2.6, layout.row_height * 0.25), f"{net_payable:,.2f}")

        y -= (layout.row_height - 0.35)
        c.rect(left, y, width, layout.row_height, stroke=1, fill=0)
        c.setFont("Helvetica", layout.font_size_data)
        in_words_text = f"In words - {self._amount_in_words(net_payable)}"
        c.drawString(left + 2, y + max(2.6, layout.row_height * 0.25), self._truncate(in_words_text, 86))
        return y

    def _draw_signature_footer(
        self,
        c: canvas.Canvas,
        layout: CompressedLayout,
        profile: CompanyProfile,
        signature_path: Optional[str],
        stamp_path: Optional[str],
        table_end_y: float,
    ) -> None:
        """Draw signature, stamp, and footer at bottom of page."""
        left = layout.margin_left
        right = layout.margin_right
        # Keep signature block clearly visible in lower-left safe zone.
        bottom_y = max(layout.margin_bottom + 20, min(table_end_y - 36, layout.margin_bottom + 56))

        # Render only the signing block to avoid duplicate owner footer/header text over template branding.
        c.setFont("Helvetica-Bold", max(7.0, layout.font_size_data - 0.5))
        c.drawString(left, bottom_y + 50, "Authorized Signatory")

        sign_x = left + 6
        stamp_gap = 14

        sig_width = 90
        sig_height = 42
        drew_signature = False
        if signature_path:
            try:
                from PIL import Image
                if os.path.exists(signature_path) and os.path.getsize(signature_path) > 128:
                    img = Image.open(signature_path)
                    aspect_ratio = img.width / img.height if img.height > 0 else 1.0
                    sig_width = min(120, int(sig_height * aspect_ratio))
                    c.drawImage(
                        signature_path,
                        sign_x,
                        bottom_y + 4,
                        width=sig_width,
                        height=sig_height,
                        preserveAspectRatio=True,
                        mask="auto"
                    )
                    drew_signature = True
            except Exception:
                drew_signature = False

        if not drew_signature:
            c.setStrokeColorRGB(0.2, 0.2, 0.2)
            c.setLineWidth(1.0)
            c.line(sign_x + 2, bottom_y + 12, sign_x + 58, bottom_y + 12)
            c.setFont("Helvetica", max(6.6, layout.font_size_data - 1.3))
            c.drawString(sign_x + 2, bottom_y + 14, "Signature")

        # Stamp (bottom-left, next to signature)
        stamp_x = sign_x + sig_width + stamp_gap
        drew_stamp = False
        if stamp_path:
            try:
                from PIL import Image
                if os.path.exists(stamp_path) and os.path.getsize(stamp_path) > 128:
                    img = Image.open(stamp_path)
                    stamp_height = 44
                    aspect_ratio = img.width / img.height if img.height > 0 else 1.0
                    stamp_width = min(86, int(stamp_height * aspect_ratio))
                    max_stamp_x = right - stamp_width - 2
                    stamp_x = min(stamp_x, max_stamp_x)
                    c.drawImage(
                        stamp_path,
                        stamp_x,
                        bottom_y + 5,
                        width=stamp_width,
                        height=stamp_height,
                        preserveAspectRatio=True,
                        mask="auto"
                    )
                    drew_stamp = True
            except Exception:
                drew_stamp = False

        if not drew_stamp:
            c.setStrokeColorRGB(0.17, 0.35, 0.6)
            c.setLineWidth(1.0)
            c.circle(stamp_x + 18, bottom_y + 20, 14, stroke=1, fill=0)
            c.setFont("Helvetica", max(6.4, layout.font_size_data - 1.4))
            c.drawString(stamp_x + 5, bottom_y + 17, "Stamp")

        # Keep footer untouched; owner template already contains official company footer/branding.

    def _format_date(self, raw: Optional[str]) -> str:
        if raw:
            value = raw.strip()
            for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y"):
                try:
                    return datetime.strptime(value, fmt).strftime("%d.%m.%Y")
                except Exception:
                    continue
            return value
        return datetime.now().strftime("%d.%m.%Y")

    def _month_label(self, raw: Optional[str]) -> str:
        if raw:
            value = raw.strip()
            for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y"):
                try:
                    return datetime.strptime(value, fmt).strftime("%B %Y")
                except Exception:
                    continue
            return value
        return "[Period]"

    def _truncate(self, text: str, max_len: int) -> str:
        if len(text) <= max_len:
            return text
        return text[: max_len - 3].rstrip() + "..."

    def _vertical_table_shift(self, row_count: int) -> float:
        if row_count <= 4:
            return 24.0
        if row_count <= 8:
            return 18.0
        if row_count <= 12:
            return 12.0
        if row_count <= 16:
            return 6.0
        return 0.0

    def _should_show_project_column(self, rows: Sequence[InvoiceRow]) -> bool:
        _BLANK_IDS = {"-", "--", "n/a", "na", "none", "null", "nil", "0", "undefined"}
        for row in rows:
            val = (getattr(row, "project_id", None) or "").strip()
            if val and val.lower() not in _BLANK_IDS:
                return True
        return False

    def _amount_in_words(self, amount: float) -> str:
        """Convert amount to words (simplified)."""
        # TODO: Implement proper number-to-words conversion
        # For now, return a placeholder
        return f"AED {amount:,.2f} only"
