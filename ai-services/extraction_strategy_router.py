"""
extraction_strategy_router.py

Generalized extraction strategy planner that chooses the order of extractors
without changing public API contracts.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import List

from document_classifier import DocumentType
from layout_classifier import LayoutType


class ExtractionStage(str, Enum):
    NATIVE = "native"
    VISION = "vision"
    OCR = "ocr"


@dataclass(frozen=True)
class ExtractionStrategy:
    primary: ExtractionStage
    fallbacks: List[ExtractionStage]
    reason: str


def plan_strategy(document_type: DocumentType, layout_type: LayoutType) -> ExtractionStrategy:
    """
    Build an extraction order based on document type + inferred layout.

    This remains conservative:
    - DIGITAL docs still prefer native extraction first
    - SCANNED/MIXED docs still prefer vision first
    - OCR remains final fallback
    """
    if document_type == DocumentType.DIGITAL:
        return ExtractionStrategy(
            primary=ExtractionStage.NATIVE,
            fallbacks=[ExtractionStage.VISION, ExtractionStage.OCR],
            reason="digital_pdf_prefers_native",
        )

    if layout_type == LayoutType.ATTENDANCE_MATRIX_WITH_SUMMARY:
        return ExtractionStrategy(
            primary=ExtractionStage.OCR,
            fallbacks=[ExtractionStage.VISION],
            reason="attendance_matrix_with_summary_prefers_ocr_geometry",
        )

    if layout_type == LayoutType.EMPLOYEE_DAILY_SHEET:
        return ExtractionStrategy(
            primary=ExtractionStage.OCR,
            fallbacks=[ExtractionStage.VISION],
            reason="employee_daily_sheet_prefers_ocr_geometry",
        )

    if layout_type == LayoutType.TRADE_SUMMARY_ONLY:
        return ExtractionStrategy(
            primary=ExtractionStage.OCR,
            fallbacks=[ExtractionStage.VISION],
            reason="trade_summary_only_prefers_ocr_geometry",
        )

    if layout_type == LayoutType.MULTI_PAGE_SUMMARY:
        return ExtractionStrategy(
            primary=ExtractionStage.OCR,
            fallbacks=[ExtractionStage.VISION],
            reason="multi_page_summary_prefers_ocr_geometry",
        )

    if layout_type == LayoutType.INVOICE_STYLE:
        return ExtractionStrategy(
            primary=ExtractionStage.VISION,
            fallbacks=[ExtractionStage.OCR],
            reason="invoice_style_prefers_vision_semantics",
        )

    if layout_type == LayoutType.NATIVE_TABLE:
        return ExtractionStrategy(
            primary=ExtractionStage.OCR,
            fallbacks=[ExtractionStage.VISION],
            reason="native_table_prefers_ocr_geometry",
        )

    if layout_type == LayoutType.MIXED_LAYOUT:
        return ExtractionStrategy(
            primary=ExtractionStage.VISION,
            fallbacks=[ExtractionStage.OCR],
            reason="mixed_layout_prefers_vision_then_ocr",
        )

    return ExtractionStrategy(
        primary=ExtractionStage.VISION,
        fallbacks=[ExtractionStage.OCR],
        reason="scanned_pdf_prefers_vision",
    )
