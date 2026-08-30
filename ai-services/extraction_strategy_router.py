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

    OCR is never selected, for any document type or layout. It was a source
    of unreliable, occasionally worker-crashing extractions (rendering +
    RapidOCR run inside a gunicorn request thread - see the ai-services
    invoice-extraction incident history) and is strictly worse than Gemini
    Vision for this document class. Gemini Vision is the only fallback for
    scanned/mixed documents regardless of inferred layout; layout_type is
    kept only for diagnostics/warnings, not for routing.

    - DIGITAL docs still prefer native extraction first, falling back to
      Vision if native comes back empty/invalid.
    - Every other document (scanned/mixed) always uses Vision, with no
      fallback stage - if Vision fails, the document is surfaced for human
      review rather than silently handed to OCR.
    """
    if document_type == DocumentType.DIGITAL:
        return ExtractionStrategy(
            primary=ExtractionStage.NATIVE,
            fallbacks=[ExtractionStage.VISION],
            reason="digital_pdf_prefers_native",
        )

    return ExtractionStrategy(
        primary=ExtractionStage.VISION,
        fallbacks=[],
        reason=f"non_digital_always_vision_layout={layout_type.value}",
    )
