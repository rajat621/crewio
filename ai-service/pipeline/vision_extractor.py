"""
pipeline/vision_extractor.py

Offline OCR extractor replacement.

This file is now kept ONLY for compatibility.

No Anthropic.
No Claude Vision.
No external AI APIs.

All extraction is delegated to:
- RapidOCR
- OpenCV
- text_extractor.py
"""

from __future__ import annotations

import logging

from schema import (
    ExtractionResult,
    InvoiceFinancials,
    InvoiceLayout,
    TimesheetFormat,
    TimesheetMetadata,
)

from pipeline.text_extractor import extract_text_pdf

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Compatibility flags
# ---------------------------------------------------------------------------

_PDF2IMAGE_OK = True

_ANTHROPIC_OK = False

# ---------------------------------------------------------------------------
# Compatibility wrapper
# ---------------------------------------------------------------------------

def extract_vision_pdf(
    pdf_path: str,
    fmt: TimesheetFormat,
    layout: InvoiceLayout,
    dpi: int = 300,
) -> ExtractionResult:
    """
    Legacy compatibility wrapper.

    Previous system used:
    - Anthropic Vision API
    - Claude Sonnet

    New system uses:
    - RapidOCR
    - OpenCV
    - Offline extraction

    This function now redirects to text_extractor.
    """

    logger.info(
        "Vision extractor redirected to OCR pipeline"
    )

    try:

        result = extract_text_pdf(
            pdf_path=pdf_path,
            fmt=fmt,
            layout=layout,
        )

        result.used_vision = False

        result.used_ocr = True

        return result

    except Exception as exc:

        logger.exception(
            "OCR extraction failed: %s",
            exc,
        )

        return ExtractionResult(
            success=False,
            format=fmt,
            layout=layout,
            rows=[],
            financials=InvoiceFinancials(),
            metadata=TimesheetMetadata(),
            confidence=0.0,
            used_ocr=True,
            used_vision=False,
            error=str(exc),
        )