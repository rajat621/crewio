"""
document_classifier.py

STEP 1 of the extraction pipeline.

Determines whether an uploaded PDF is:
  1. DIGITAL    — structured text extractable with pdfplumber
  2. SCANNED    — image-based, requires Vision or OCR
  3. MIXED      — some pages digital, some scanned

This decision drives STEP 2 (extraction routing).
No contractor-specific logic. Generalizes to all timesheet formats.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import List, Tuple

logger = logging.getLogger(__name__)

# A page needs at least this many extractable characters to be "digital"
_DIGITAL_CHAR_THRESHOLD = 80
# Ratio of digital pages needed to classify whole doc as digital
_DIGITAL_PAGE_RATIO = 0.6


class DocumentType(str, Enum):
    DIGITAL = "digital"     # use native PDF extraction
    SCANNED = "scanned"     # use Vision (Gemini) primary, OCR fallback
    MIXED = "mixed"         # use Vision; fallback per-page


@dataclass(frozen=True)
class ClassificationResult:
    document_type: DocumentType
    total_pages: int
    digital_pages: int
    scanned_pages: int
    digital_ratio: float
    avg_chars_per_page: float
    confidence: float


def classify_document(pdf_path: str) -> ClassificationResult:
    """
    Classify a PDF as DIGITAL, SCANNED, or MIXED.

    Uses only character density analysis — no ML, no contractor assumptions.
    """
    try:
        import pdfplumber
    except ImportError:
        logger.warning("pdfplumber not available; defaulting to SCANNED")
        return ClassificationResult(
            document_type=DocumentType.SCANNED,
            total_pages=0,
            digital_pages=0,
            scanned_pages=0,
            digital_ratio=0.0,
            avg_chars_per_page=0.0,
            confidence=0.5,
        )

    page_char_counts: List[int] = []

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                page_char_counts.append(len(text.strip()))
    except Exception as exc:
        logger.warning("PDF open failed during classification: %s", exc)
        return ClassificationResult(
            document_type=DocumentType.SCANNED,
            total_pages=0,
            digital_pages=0,
            scanned_pages=0,
            digital_ratio=0.0,
            avg_chars_per_page=0.0,
            confidence=0.5,
        )

    total = len(page_char_counts)
    if total == 0:
        return ClassificationResult(
            document_type=DocumentType.SCANNED,
            total_pages=0,
            digital_pages=0,
            scanned_pages=0,
            digital_ratio=0.0,
            avg_chars_per_page=0.0,
            confidence=0.9,
        )

    digital_pages = sum(1 for c in page_char_counts if c >= _DIGITAL_CHAR_THRESHOLD)
    scanned_pages = total - digital_pages
    digital_ratio = digital_pages / total
    avg_chars = sum(page_char_counts) / total

    if digital_ratio >= _DIGITAL_PAGE_RATIO:
        doc_type = DocumentType.DIGITAL
        confidence = 0.9 if avg_chars > 300 else 0.75
    elif digital_ratio <= 0.1:
        doc_type = DocumentType.SCANNED
        confidence = 0.95 if avg_chars < 20 else 0.80
    else:
        doc_type = DocumentType.MIXED
        confidence = 0.85

    result = ClassificationResult(
        document_type=doc_type,
        total_pages=total,
        digital_pages=digital_pages,
        scanned_pages=scanned_pages,
        digital_ratio=digital_ratio,
        avg_chars_per_page=avg_chars,
        confidence=confidence,
    )

    logger.info(
        "document_classified type=%s pages=%d digital=%d scanned=%d confidence=%.2f",
        doc_type.value, total, digital_pages, scanned_pages, confidence,
    )
    return result