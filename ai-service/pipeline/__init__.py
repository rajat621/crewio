"""
pipeline

Universal OCR extraction pipeline.

Modules:
- classifier
- text_extractor
- vision_extractor (compatibility wrapper)
- run

Supports:
- text PDFs
- scanned PDFs
- image PDFs
- attendance parsing
- invoice generation
"""

from .run import run_extraction

from .classifier import classify_pdf

from .text_extractor import (
    extract_text_pdf,
)

from .vision_extractor import (
    extract_vision_pdf,
)

__all__ = [
    "run_extraction",
    "classify_pdf",
    "extract_text_pdf",
    "extract_vision_pdf",
]