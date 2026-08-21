"""
layout_geometry.py

OCR geometry probing for table-style layout classification.

This module reconstructs page structure from OCR tokens using the same
token -> line -> table shape path that the extraction layer relies on.
It is used only for layout inference and strategy selection.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import median
from typing import Iterable, List, Sequence, Tuple

from ocr_extractor import _cluster_tokens_into_lines, _line_text, _render_pages, _run_ocr_on_image


_MONTH_NAMES = {
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
}
_DAY_MARKERS = {"p", "a", "h", "w", "o", "off", "m", "l", "s", "-"}


@dataclass(frozen=True)
class PageGeometryProfile:
    page_index: int
    token_count: int
    line_count: int
    x_band_count: int
    alignment_score: float
    has_day_header: bool
    has_summary_header: bool
    has_invoice_header: bool
    attendance_rows: int
    summary_rows: int
    invoice_rows: int
    table_kind: str


@dataclass(frozen=True)
class LayoutGeometryProfile:
    page_count: int
    page_profiles: Tuple[PageGeometryProfile, ...]
    attendance_pages: int
    summary_pages: int
    invoice_pages: int
    native_table_pages: int
    mixed_pages: int
    multi_page_summary_pages: int
    average_alignment: float
    max_x_band_count: int
    has_day_header: bool
    has_summary_header: bool
    has_invoice_header: bool


def _cluster_values(values: Sequence[int], tolerance: int) -> List[float]:
    if not values:
        return []
    sorted_values = sorted(int(value) for value in values)
    clusters: List[List[int]] = [[sorted_values[0]]]
    for value in sorted_values[1:]:
        if abs(value - clusters[-1][-1]) <= tolerance:
            clusters[-1].append(value)
        else:
            clusters.append([value])
    return [sum(cluster) / len(cluster) for cluster in clusters]


def _token_text(token: dict) -> str:
    return str(token.get("text") or "").strip()


def _is_numeric_token(token: dict) -> bool:
    text = _token_text(token).replace(",", "")
    if not text:
        return False
    if text.count(".") > 1:
        return False
    try:
        float(text)
        return True
    except ValueError:
        return False


def _is_day_token(token: dict) -> bool:
    text = _token_text(token).lower()
    if text in _DAY_MARKERS:
        return True
    if text.isdigit():
        value = int(text)
        return 1 <= value <= 31
    return False


def _page_band_count(lines: Sequence[Sequence[dict]]) -> Tuple[int, float]:
    token_xs: List[int] = []
    token_widths: List[int] = []
    for line in lines:
        for token in line:
            text = _token_text(token)
            if not text:
                continue
            token_xs.append(int(token.get("x", 0)))
            width = int(token.get("w", 0))
            if width > 0:
                token_widths.append(width)

    if not token_xs:
        return 0, 0.0

    tolerance = max(18, int(median(token_widths) * 1.35) if token_widths else 24)
    bands = _cluster_values(token_xs, tolerance=tolerance)
    band_hits = 0
    for line in lines:
        for token in line:
            text = _token_text(token)
            if not text:
                continue
            x = int(token.get("x", 0))
            if any(abs(x - band) <= tolerance for band in bands):
                band_hits += 1
    alignment_score = band_hits / max(1, len(token_xs))
    return len(bands), round(min(1.0, alignment_score), 4)


def _line_has_day_header(line: Sequence[dict]) -> bool:
    texts = [_token_text(token).lower() for token in line if _token_text(token)]
    if not texts:
        return False
    if any(month in texts for month in _MONTH_NAMES):
        day_like = sum(1 for token in line if _is_day_token(token))
        return day_like >= 8
    numeric_days = [int(text) for text in texts if text.isdigit() and 1 <= int(text) <= 31]
    return len(numeric_days) >= 10


def _line_has_summary_header(text: str) -> bool:
    normalized = text.lower().replace(" ", "")
    return all(keyword in normalized for keyword in ("trade", "hour", "rate", "amount"))


def _line_has_invoice_header(text: str) -> bool:
    normalized = text.lower().replace(" ", "")
    return any(keyword in normalized for keyword in ("subtotal", "nettotal", "netpayable", "vat", "deduction", "grosstotal"))


def _attendance_row_score(line: Sequence[dict]) -> int:
    texts = [_token_text(token).lower() for token in line if _token_text(token)]
    month_index = next((idx for idx, text in enumerate(texts) if text in _MONTH_NAMES), -1)
    if month_index < 0:
        return 0
    tail_tokens = line[month_index + 1 :]
    day_like = sum(1 for token in tail_tokens if _is_day_token(token) or _is_numeric_token(token))
    leading_tokens = line[:month_index]
    return 1 if day_like >= 8 and len(leading_tokens) >= 3 else 0


def _summary_row_score(line: Sequence[dict]) -> int:
    text = _line_text(list(line))
    numeric_tokens = [token for token in line if _is_numeric_token(token)]
    first_numeric = next((idx for idx, token in enumerate(line) if _is_numeric_token(token)), -1)
    prelude = line[:first_numeric] if first_numeric >= 0 else line
    has_trade_like = any(any(ch.isalpha() for ch in _token_text(token)) for token in prelude)
    return 1 if has_trade_like and len(numeric_tokens) >= 3 and not _line_has_invoice_header(text) else 0


def probe_layout_geometry(pdf_path: str, max_pages: int = 2, dpi: int = 150) -> LayoutGeometryProfile:
    pages = _render_pages(pdf_path, dpi=dpi)
    if not pages:
        return LayoutGeometryProfile(
            page_count=0,
            page_profiles=(),
            attendance_pages=0,
            summary_pages=0,
            invoice_pages=0,
            native_table_pages=0,
            mixed_pages=0,
            multi_page_summary_pages=0,
            average_alignment=0.0,
            max_x_band_count=0,
            has_day_header=False,
            has_summary_header=False,
            has_invoice_header=False,
        )

    profiles: List[PageGeometryProfile] = []
    for page_index, page in enumerate(pages[:max_pages], 1):
        tokens = _run_ocr_on_image(page)
        lines = _cluster_tokens_into_lines(tokens)
        band_count, alignment_score = _page_band_count(lines)
        has_day_header = any(_line_has_day_header(line) for line in lines)
        has_summary_header = any(_line_has_summary_header(_line_text(line)) for line in lines)
        has_invoice_header = any(_line_has_invoice_header(_line_text(line)) for line in lines)
        attendance_rows = sum(_attendance_row_score(line) for line in lines)
        summary_rows = sum(_summary_row_score(line) for line in lines)
        invoice_rows = sum(1 for line in lines if _line_has_invoice_header(_line_text(line)))

        if has_day_header and summary_rows:
            table_kind = "attendance_matrix_with_summary"
        elif has_day_header and attendance_rows:
            table_kind = "employee_daily_sheet"
        elif summary_rows >= 2:
            table_kind = "trade_summary_only"
        elif has_invoice_header:
            table_kind = "invoice_style"
        elif band_count >= 4 and alignment_score >= 0.55:
            table_kind = "native_table"
        else:
            table_kind = "unknown"

        if attendance_rows and summary_rows:
            table_kind = "mixed_layout"

        profiles.append(
            PageGeometryProfile(
                page_index=page_index,
                token_count=len(tokens),
                line_count=len(lines),
                x_band_count=band_count,
                alignment_score=alignment_score,
                has_day_header=has_day_header,
                has_summary_header=has_summary_header,
                has_invoice_header=has_invoice_header,
                attendance_rows=attendance_rows,
                summary_rows=summary_rows,
                invoice_rows=invoice_rows,
                table_kind=table_kind,
            )
        )

    attendance_pages = sum(1 for profile in profiles if profile.table_kind in {"attendance_matrix_with_summary", "employee_daily_sheet"})
    summary_pages = sum(1 for profile in profiles if profile.table_kind in {"trade_summary_only", "attendance_matrix_with_summary", "mixed_layout"})
    invoice_pages = sum(1 for profile in profiles if profile.table_kind == "invoice_style")
    native_table_pages = sum(1 for profile in profiles if profile.table_kind == "native_table")
    mixed_pages = sum(1 for profile in profiles if profile.table_kind == "mixed_layout")
    multi_page_summary_pages = sum(1 for profile in profiles if profile.summary_rows >= 2)
    average_alignment = round(sum(profile.alignment_score for profile in profiles) / max(len(profiles), 1), 4)
    max_x_band_count = max((profile.x_band_count for profile in profiles), default=0)

    return LayoutGeometryProfile(
        page_count=len(pages),
        page_profiles=tuple(profiles),
        attendance_pages=attendance_pages,
        summary_pages=summary_pages,
        invoice_pages=invoice_pages,
        native_table_pages=native_table_pages,
        mixed_pages=mixed_pages,
        multi_page_summary_pages=multi_page_summary_pages,
        average_alignment=average_alignment,
        max_x_band_count=max_x_band_count,
        has_day_header=any(profile.has_day_header for profile in profiles),
        has_summary_header=any(profile.has_summary_header for profile in profiles),
        has_invoice_header=any(profile.has_invoice_header for profile in profiles),
    )