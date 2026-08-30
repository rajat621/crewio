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


def resolve_layout(
    pdf_path: str,
    text_chunks: List[str],
    document_type: Optional[DocumentType] = None,
) -> LayoutClassificationResult:
    # extraction_strategy_router.plan_strategy() no longer branches on
    # layout_type at all - DIGITAL always goes native->vision, and every
    # other document always goes straight to Gemini Vision. That means
    # refining the layout label via probe_layout_geometry() (a full page
    # render + RapidOCR pass, ~50s+ on a multi-page doc, and the source of
    # this pipeline's worker-crashing extraction incidents) can never change
    # the extraction outcome, only a diagnostic label. Never pay for that
    # OCR pass; text-based classification is used purely for warnings/
    # diagnostics now.
    return classify_layout(text_chunks)
