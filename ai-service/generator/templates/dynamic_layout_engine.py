<<<<<<< HEAD
﻿"""Dynamic, template-safe invoice layout renderer with business normalization and pagination."""
=======
"""Dynamic, template-safe invoice layout renderer with business normalization and pagination."""
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Sequence, Tuple

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from schema import CompanyProfile, ExtractionResult
from generator.templates.content_positioner import ContentPositioner
from generator.templates.pagination_engine import PaginationEngine


@dataclass(frozen=True)
class NormalizedInvoiceRow:
    trade: str
    project_id: Optional[str]
    employee_id: Optional[str]
    hours: float
    amount: float
    deductions: float
    overtime: float
    rate: float


class DynamicLayoutEngine:
    """Render invoice content inside safe zone while preserving owner template branding."""

    def __init__(self, page_size=A4) -> None:
        self.page_width, self.page_height = page_size
        self.pagination = PaginationEngine()
        self.positioner = ContentPositioner()

    def normalize_rows(self, result: ExtractionResult) -> List[Dict[str, object]]:
        grouped: Dict[Tuple[str, Optional[str]], Dict[str, object]] = {}

        for row in result.rows:
            if row.project_id:
                key = (row.trade, row.project_id)
            else:
                key = (row.trade, None)

            if key not in grouped:
                grouped[key] = {
                    "trade": row.trade,
                    "project_id": row.project_id,
                    "employee_id": row.employee_id,
                    "hours": 0.0,
                    "amount": 0.0,
                    "deductions": 0.0,
                    "overtime": 0.0,
                    "rate": row.rate,
                }

            item = grouped[key]
            item["hours"] = round(float(item["hours"]) + float(row.hours or 0.0), 2)
            item["amount"] = round(float(item["amount"]) + float(row.amount or 0.0), 2)
            item["deductions"] = round(float(item["deductions"]) + float(row.deduction_total or 0.0), 2)
            item["overtime"] = round(float(item["overtime"]) + float(row.overtime_hours or 0.0), 2)

        return list(grouped.values())

    def render(
        self,
        c: canvas.Canvas,
        result: ExtractionResult,
        profile: CompanyProfile,
        safe_zone: Dict[str, int],
        client_details: Dict[str, str],
        signature_path: Optional[str],
        stamp_path: Optional[str],
        on_page_start: Optional[Callable[[int], None]] = None,
    ) -> None:
        normalized = self.normalize_rows(result)
        chunks = self.pagination.paginate(normalized, safe_zone=safe_zone)

        row_height_px = 22

        for idx, chunk in enumerate(chunks):
            if idx > 0:
                c.showPage()

            if on_page_start:
                on_page_start(idx)

            pos = self.positioner.compute(
                safe_zone=safe_zone,
                page_height_pts=self.page_height,
                rows_on_page=max(1, len(chunk.rows)),
                row_height_pts=row_height_px,
            )

            self._draw_header(c, safe_zone, profile, client_details, pos.invoice_title_y, pos.client_block_y, chunk.page_number)
            self._draw_table(c, safe_zone, chunk.rows, pos.table_top_y, row_height_px)

            if idx == len(chunks) - 1:
                self._draw_totals(c, safe_zone, result, pos.totals_start_y)
                self._draw_signature_block(c, safe_zone, profile, signature_path, stamp_path, pos.signature_block_y)
            else:
                self._draw_carry_forward(c, safe_zone, pos.totals_start_y, chunk.carry_forward_amount)

    def _draw_header(
        self,
        c: canvas.Canvas,
        safe_zone: Dict[str, int],
        profile: CompanyProfile,
        client: Dict[str, str],
        title_y: float,
        client_y: float,
        page_number: int,
    ) -> None:
        left = safe_zone["content_left"]
        right = safe_zone["content_right"]

        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString((left + right) / 2, title_y, "Tax Invoice")

        c.setFont("Helvetica", 8)
        c.drawRightString(right, title_y, f"Page {page_number}")

        c.setFont("Helvetica-Bold", 9)
        c.drawString(left, client_y, f"Invoice No: {profile.invoice_number}")
        c.drawString(left + 220, client_y, f"Date: {profile.invoice_date or ''}")

        c.setFont("Helvetica-Bold", 9)
        c.drawString(left, client_y - 14, client.get("name") or "Client")
        c.setFont("Helvetica", 8)
        c.drawString(left, client_y - 26, f"TRN: {client.get('trn') or '-'}")
        c.drawString(left, client_y - 38, client.get("address") or "")

    def _draw_table(self, c: canvas.Canvas, safe_zone: Dict[str, int], rows: Sequence[Dict[str, object]], table_top: float, row_h: float) -> None:
        left = safe_zone["content_left"]
        right = safe_zone["content_right"]
        width = right - left

        columns = ["SI", "Trade", "Project", "Hours", "Rate", "Amount", "Overtime", "Deductions"]
        fracs = [0.06, 0.23, 0.12, 0.10, 0.10, 0.14, 0.12, 0.13]

        x = left
        y = table_top
        c.setFont("Helvetica-Bold", 7)

        col_w: List[float] = []
        for h, f in zip(columns, fracs):
            w = width * f
            col_w.append(w)
            c.rect(x, y, w, 18, stroke=1, fill=0)
            c.drawString(x + 2, y + 5, h)
            x += w

        c.setFont("Helvetica", 7)
        y -= 22

        for idx, row in enumerate(rows, 1):
            x = left
            vals = [
                str(idx),
                str(row.get("trade") or ""),
                str(row.get("project_id") or "-"),
                f"{float(row.get('hours') or 0.0):.2f}",
                f"{float(row.get('rate') or 0.0):.2f}",
                f"{float(row.get('amount') or 0.0):,.2f}",
                f"{float(row.get('overtime') or 0.0):.2f}",
                f"{float(row.get('deductions') or 0.0):,.2f}",
            ]
            for i, val in enumerate(vals):
                w = col_w[i]
                c.rect(x, y, w, row_h, stroke=1, fill=0)
                c.drawString(x + 2, y + 6, val)
                x += w
            y -= row_h

    def _draw_totals(self, c: canvas.Canvas, safe_zone: Dict[str, int], result: ExtractionResult, start_y: float) -> None:
        left = safe_zone["content_left"]
        right = safe_zone["content_right"]

        c.setFont("Helvetica-Bold", 9)
        c.drawRightString(right, start_y, f"Subtotal: {result.financials.subtotal:,.2f}")
        c.drawRightString(right, start_y - 14, f"VAT: {result.financials.total_vat:,.2f}")
        c.drawRightString(right, start_y - 28, f"Deductions: {result.financials.total_deduction:,.2f}")
        c.drawRightString(right, start_y - 42, f"Net Payable: {result.financials.net_payable:,.2f}")

    def _draw_carry_forward(self, c: canvas.Canvas, safe_zone: Dict[str, int], y: float, amount: float) -> None:
        right = safe_zone["content_right"]
        c.setFont("Helvetica-Bold", 8)
        c.drawRightString(right, y, f"Carry Forward: {amount:,.2f}")

    def _draw_signature_block(
        self,
        c: canvas.Canvas,
        safe_zone: Dict[str, int],
        profile: CompanyProfile,
        signature_path: Optional[str],
        stamp_path: Optional[str],
        y: float,
    ) -> None:
        left = safe_zone["content_left"]
        right = safe_zone["content_right"]

        c.setFont("Helvetica-Bold", 9)
        c.drawString(left, y, f"Thanks and Regards, {profile.name}")
        c.setFont("Helvetica", 8)
        c.drawString(left, y - 12, f"TRN: {profile.trn}")

        if signature_path:
            try:
                c.drawImage(signature_path, left, y - 80, width=120, height=55, preserveAspectRatio=True, mask="auto")
            except Exception:
                pass

        if stamp_path:
            try:
                c.drawImage(stamp_path, right - 130, y - 80, width=120, height=55, preserveAspectRatio=True, mask="auto")
            except Exception:
                pass
