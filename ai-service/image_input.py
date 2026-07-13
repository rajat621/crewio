"""
image_input.py

Unified input loader. Per spec the system must accept:
  - computer-generated PDFs
  - scanned PDFs
  - image-based PDFs
  - mixed PDFs
  - mobile camera photos
  - JPG / PNG / TIFF (including multi-page TIFF)

This module is the single entry point that converts ANY supported input
file into a list of PIL Image pages, applying EXIF auto-orientation for
camera photos along the way. Downstream extractors (native/vision/ocr)
only ever deal with: (a) a pdf_path for native text extraction, or
(b) a list of PIL Images for vision/OCR.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

PDF_EXTENSIONS = {".pdf"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp"}


def is_pdf(path: str) -> bool:
    return Path(path).suffix.lower() in PDF_EXTENSIONS


def is_image(path: str) -> bool:
    return Path(path).suffix.lower() in IMAGE_EXTENSIONS


def is_supported(path: str) -> bool:
    return is_pdf(path) or is_image(path)


def load_pages_as_images(path: str, dpi: int = 300, max_pages: int = 10) -> List["object"]:
    """
    Load any supported input file as a list of PIL Image pages (RGB).

    - PDF: rendered page-by-page via pdf2image at the given DPI.
    - JPG/PNG/BMP/WEBP: single-page image, EXIF-orientation corrected.
    - TIFF: all frames extracted (multi-page TIFF support, e.g. scanned
      multi-page mobile-scanner output), EXIF-orientation corrected per
      frame where present.

    Returns a list of PIL.Image.Image in RGB mode. Never raises for
    "no images found" — returns [] and lets the caller decide how to
    handle that (e.g. trigger OCR/vision failure path).
    """
    from PIL import Image, ImageOps

    ext = Path(path).suffix.lower()

    if ext in PDF_EXTENSIONS:
        return _load_pdf_pages(path, dpi=dpi, max_pages=max_pages)

    if ext not in IMAGE_EXTENSIONS:
        logger.warning("image_input unsupported_extension path=%s ext=%s", path, ext)
        return []

    images: List["object"] = []
    try:
        with Image.open(path) as im:
            if ext in {".tif", ".tiff"}:
                # Multi-page TIFF: iterate all frames
                frame_idx = 0
                while True:
                    try:
                        im.seek(frame_idx)
                    except EOFError:
                        break
                    frame = im.convert("RGB")
                    frame = _apply_exif_orientation(frame, im)
                    images.append(frame.copy())
                    frame_idx += 1
                    if frame_idx >= max_pages:
                        break
            else:
                corrected = ImageOps.exif_transpose(im)
                if corrected is None:
                    corrected = im
                images.append(corrected.convert("RGB"))
    except Exception as exc:
        logger.warning("image_input load_failed path=%s error=%s", path, exc)
        return []

    return images


def _apply_exif_orientation(frame, original_im):
    """Apply EXIF orientation tag to a TIFF frame if present."""
    from PIL import ImageOps
    try:
        corrected = ImageOps.exif_transpose(original_im)
        if corrected is not None:
            return corrected.convert("RGB")
    except Exception:
        pass
    return frame


def _load_pdf_pages(pdf_path: str, dpi: int, max_pages: int) -> List["object"]:
    try:
        from pdf2image import convert_from_path

        poppler_path = _find_poppler()
        kwargs = {"dpi": dpi}
        if poppler_path:
            kwargs["poppler_path"] = poppler_path

        pages = convert_from_path(
            pdf_path, first_page=1, last_page=max_pages, **kwargs
        )
        return [p.convert("RGB") for p in pages]
    except Exception as exc:
        logger.warning("image_input pdf_render_failed path=%s error=%s", pdf_path, exc)
        return []


def _find_poppler() -> Optional[str]:
    candidates = [
        r"C:\Program Files\poppler\Library\bin",
        r"C:\Program Files\poppler\bin",
    ]
    for c in candidates:
        if os.path.exists(os.path.join(c, "pdfinfo.exe")):
            return c
    return None
