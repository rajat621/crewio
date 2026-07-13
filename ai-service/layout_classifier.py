"""
layout_classifier.py

Layout-aware classification for construction timesheets.

This module is intentionally heuristic and additive:
- no supplier templates
- no hardcoded coordinates
- robust to unseen layouts
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from enum import Enum
from typing import List, Optional

from document_classifier import DocumentType
from layout_geometry import LayoutGeometryProfile, probe_layout_geometry

logger = logging.getLogger(__name__)


class LayoutType(str, Enum):
    ATTENDANCE_MATRIX_WITH_SUMMARY = "attendance_matrix_with_summary"
    ATTENDANCE_PLUS_BILLING_SUMMARY = ATTENDANCE_MATRIX_WITH_SUMMARY
    EMPLOYEE_DAILY_SHEET = "employee_daily_sheet"
    EMPLOYEE_ONLY = EMPLOYEE_DAILY_SHEET
    TRADE_SUMMARY_ONLY = "trade_summary_only"
    INVOICE_STYLE = "invoice_style"
    NATIVE_TABLE = "native_table"
    MIXED_LAYOUT = "mixed_layout"
    MIXED = MIXED_LAYOUT
    MULTI_PAGE_SUMMARY = "multi_page_summary"
    PROJECT_SUMMARY = "project_summary"
    PROJECT_TRADE = "project_trade"
    DEDUCTION_HEAVY = "deduction_heavy"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class LayoutClassificationResult:
    layout_type: LayoutType
    confidence: float
    has_employee_markers: bool
    has_project_markers: bool
    has_trade_markers: bool
    has_deduction_markers: bool
    has_summary_markers: bool


_EMPLOYEE_RE = re.compile(
    r"\b(employee|emp\s*id|labou?r\s*code|attendance|days\s*worked|name)\b",
    re.I,
)
_PROJECT_RE = re.compile(
    r"\b(project|project\s*id|site|work\s*order|p\d{3,8}[a-z0-9]*)\b",
    re.I,
)
_TRADE_RE = re.compile(
    r"\b(trade|designation|craft|worker\s*type|skill|mason|carpenter|helper|electrician|plumber)\b",
    re.I,
)
_DEDUCTION_RE = re.compile(
    r"\b(deduction|deductions|absent|advance|loan|mess|gas|transport|penalty|fine)\b",
    re.I,
)
_SUMMARY_RE = re.compile(
    r"\b(summary|subtotal|gross\s*total|net\s*(amount|payable)|total\s*hours|total\s*amount|vat)\b",
    re.I,
)
_ATTENDANCE_RE = re.compile(
    r"\b(present|absent|attendance|days\s*worked|overtime|ot|shift|daily)\b|\b[1-9]\b",
    re.I,
)


def _safe_text(text: str) -> str:
    return " ".join(str(text or "").split())


def classify_layout(text_chunks: List[str]) -> LayoutClassificationResult:
    """
    Classify inferred layout from extracted text snippets.

    `text_chunks` can be page texts, table headers, or mixed content.
    """
    corpus = "\n".join(_safe_text(t) for t in (text_chunks or []))

    employee_hits = len(_EMPLOYEE_RE.findall(corpus))
    project_hits = len(_PROJECT_RE.findall(corpus))
    trade_hits = len(_TRADE_RE.findall(corpus))
    deduction_hits = len(_DEDUCTION_RE.findall(corpus))
    summary_hits = len(_SUMMARY_RE.findall(corpus))
    attendance_hits = len(_ATTENDANCE_RE.findall(corpus))

    has_employee = employee_hits > 0
    has_project = project_hits > 0
    has_trade = trade_hits > 0
    has_deduction = deduction_hits > 0
    has_summary = summary_hits > 0
    has_attendance = attendance_hits > 0

    if has_employee and has_summary and has_attendance:
        layout = LayoutType.ATTENDANCE_MATRIX_WITH_SUMMARY
    elif has_employee and has_attendance and not has_summary:
        layout = LayoutType.EMPLOYEE_DAILY_SHEET
    elif has_trade and has_summary and not has_employee:
        layout = LayoutType.TRADE_SUMMARY_ONLY
    elif has_project and has_trade and not has_employee:
        layout = LayoutType.NATIVE_TABLE
    elif has_project and has_employee and has_trade:
        layout = LayoutType.MIXED_LAYOUT
    elif has_deduction and summary_hits >= 2 and employee_hits == 0:
        layout = LayoutType.INVOICE_STYLE
    elif has_employee and has_project and has_trade:
        layout = LayoutType.MIXED_LAYOUT
    elif has_project and has_trade and not has_employee:
        layout = LayoutType.NATIVE_TABLE
    elif has_trade and has_summary and not has_employee:
        layout = LayoutType.TRADE_SUMMARY_ONLY
    elif has_employee:
        layout = LayoutType.EMPLOYEE_DAILY_SHEET
    else:
        layout = LayoutType.UNKNOWN

    total_hits = employee_hits + project_hits + trade_hits + deduction_hits + summary_hits
    dominant = max(employee_hits, project_hits, trade_hits, deduction_hits, summary_hits, 1)
    confidence = min(0.98, 0.55 + (dominant / max(total_hits, 1)) * 0.4)

    result = LayoutClassificationResult(
        layout_type=layout,
        confidence=round(confidence, 4),
        has_employee_markers=has_employee,
        has_project_markers=has_project,
        has_trade_markers=has_trade,
        has_deduction_markers=has_deduction,
        has_summary_markers=has_summary,
    )

    logger.info(
        "layout_classified type=%s confidence=%.2f employee=%s project=%s trade=%s deductions=%s summary=%s",
        result.layout_type.value,
        result.confidence,
        result.has_employee_markers,
        result.has_project_markers,
        result.has_trade_markers,
        result.has_deduction_markers,
        result.has_summary_markers,
    )
    return result


def _geometry_to_layout(geometry: LayoutGeometryProfile) -> LayoutClassificationResult:
    if geometry.page_count <= 0:
        return LayoutClassificationResult(
            layout_type=LayoutType.UNKNOWN,
            confidence=0.0,
            has_employee_markers=False,
            has_project_markers=False,
            has_trade_markers=False,
            has_deduction_markers=False,
            has_summary_markers=False,
        )

    if geometry.mixed_pages:
        layout = LayoutType.MIXED_LAYOUT
    elif geometry.attendance_pages and geometry.summary_pages:
        layout = LayoutType.ATTENDANCE_MATRIX_WITH_SUMMARY
    elif geometry.attendance_pages:
        layout = LayoutType.EMPLOYEE_DAILY_SHEET
    elif geometry.multi_page_summary_pages > 1 and geometry.page_count > 1:
        layout = LayoutType.MULTI_PAGE_SUMMARY
    elif geometry.invoice_pages:
        layout = LayoutType.INVOICE_STYLE
    elif geometry.summary_pages:
        layout = LayoutType.TRADE_SUMMARY_ONLY
    elif geometry.native_table_pages:
        layout = LayoutType.NATIVE_TABLE
    else:
        layout = LayoutType.UNKNOWN

    confidence = 0.52
    if layout == LayoutType.ATTENDANCE_MATRIX_WITH_SUMMARY:
        confidence = min(0.95, 0.70 + geometry.average_alignment * 0.25)
    elif layout == LayoutType.EMPLOYEE_DAILY_SHEET:
        confidence = min(0.93, 0.66 + geometry.average_alignment * 0.22)
    elif layout == LayoutType.TRADE_SUMMARY_ONLY:
        confidence = min(0.90, 0.62 + geometry.average_alignment * 0.20)
    elif layout == LayoutType.INVOICE_STYLE:
        confidence = min(0.92, 0.64 + geometry.average_alignment * 0.20)
    elif layout == LayoutType.MULTI_PAGE_SUMMARY:
        confidence = min(0.90, 0.68 + geometry.average_alignment * 0.18)
    elif layout == LayoutType.NATIVE_TABLE:
        confidence = min(0.90, 0.60 + geometry.average_alignment * 0.20)

    return LayoutClassificationResult(
        layout_type=layout,
        confidence=round(confidence, 4),
        has_employee_markers=geometry.attendance_pages > 0,
        has_project_markers=geometry.native_table_pages > 0,
        has_trade_markers=geometry.summary_pages > 0,
        has_deduction_markers=geometry.has_invoice_header,
        has_summary_markers=geometry.summary_pages > 0 or geometry.has_summary_header,
    )


def resolve_layout(
    pdf_path: str,
    text_chunks: List[str],
    document_type: Optional[DocumentType] = None,
) -> LayoutClassificationResult:
    text_result = classify_layout(text_chunks)

    needs_geometry = (
        text_result.layout_type == LayoutType.UNKNOWN
        or text_result.confidence < 0.68
        or document_type != DocumentType.DIGITAL
    )
    if not needs_geometry:
        return text_result

    geometry = probe_layout_geometry(pdf_path)
    geometry_result = _geometry_to_layout(geometry)

    if geometry_result.layout_type == LayoutType.UNKNOWN:
        return text_result

    if text_result.layout_type == LayoutType.UNKNOWN:
        return geometry_result

    if geometry_result.confidence >= text_result.confidence or document_type != DocumentType.DIGITAL:
        logger.info(
            "layout_geometry_resolved type=%s confidence=%.2f page_count=%d summary_pages=%d attendance_pages=%d native_table_pages=%d",
            geometry_result.layout_type.value,
            geometry_result.confidence,
            geometry.page_count,
            geometry.summary_pages,
            geometry.attendance_pages,
            geometry.native_table_pages,
        )
        return geometry_result

    return text_result
