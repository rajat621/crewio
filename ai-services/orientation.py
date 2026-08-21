"""
orientation.py

STEP 0 (pre-extraction) — Page orientation detection and auto-rotation.

Per spec: "The system must detect page orientation and automatically
rotate documents before extraction."

Strategy (in order of preference):
  1. Tesseract OSD (Orientation and Script Detection) — accurate, handles
     0/90/180/270 rotation, available offline (tesseract is on this
     system). This is the primary method.
  2. Heuristic fallback using text-region aspect/density via OpenCV if
     Tesseract OSD is unavailable or fails (e.g. very sparse/low-quality
     scan) — looks at which rotation produces the most "text-like"
     horizontal line structure.

Applied to every page image BEFORE it is sent to native/vision/OCR
extraction, so downstream extractors never need to reason about rotation.
"""

from __future__ import annotations

import logging
from typing import Tuple

logger = logging.getLogger(__name__)


def detect_and_correct_orientation(image) -> Tuple["object", int, float]:
    """
    Detect rotation angle (0/90/180/270) of a page image and return the
    corrected (upright) image.

    Returns:
        (corrected_image, rotation_applied_degrees, confidence)
    """
    angle, confidence = _detect_rotation_tesseract(image)

    if angle is None:
        angle, confidence = _detect_rotation_heuristic(image)

    if not angle:
        return image, 0, confidence

    corrected = image.rotate(-angle, expand=True)
    logger.info("orientation_corrected rotation=%d confidence=%.2f", angle, confidence)
    return corrected, angle, confidence


def _detect_rotation_tesseract(image) -> Tuple[int, float]:
    """
    Use Tesseract's OSD mode to detect rotation. Returns (angle, confidence)
    where angle is one of 0/90/180/270, or (None, 0.0) if OSD could not
    determine orientation (e.g. blank page, no text).
    """
    try:
        import pytesseract

        osd = pytesseract.image_to_osd(image)
        rotate = 0
        conf = 0.0
        for line in osd.splitlines():
            line = line.strip()
            if line.startswith("Rotate:"):
                rotate = int(line.split(":")[1].strip())
            elif line.startswith("Orientation confidence:"):
                conf = float(line.split(":")[1].strip())

        # Normalize tesseract confidence (roughly 0-30+ range) to 0-1
        norm_conf = min(1.0, conf / 10.0) if conf else 0.5
        return rotate, norm_conf

    except Exception as exc:
        logger.debug("orientation_tesseract_osd_unavailable: %s", exc)
        return None, 0.0


def _detect_rotation_heuristic(image) -> Tuple[int, float]:
    """
    Fallback heuristic: render the image at 0/90/180/270 and pick the
    rotation that produces the most horizontal-line-like structure,
    which is typical of tabular timesheets. Uses OpenCV only — no
    external OCR call, so this works even when tesseract OSD fails on
    very low quality scans.
    """
    try:
        import cv2
        import numpy as np

        best_angle = 0
        best_score = -1.0

        base = image.convert("L")
        for angle in (0, 90, 180, 270):
            rotated = base.rotate(-angle, expand=True)
            arr = np.array(rotated)
            edges = cv2.Canny(arr, 50, 150)

            # Horizontal line strength via row-wise sum variance — tabular
            # documents have strong horizontal lines (rules, row borders)
            # when correctly oriented.
            row_sums = edges.sum(axis=1)
            score = float(row_sums.std())

            if score > best_score:
                best_score = score
                best_angle = angle

        # This heuristic is much less reliable than OSD; cap confidence
        return best_angle, 0.4

    except Exception as exc:
        logger.debug("orientation_heuristic_failed: %s", exc)
        return 0, 0.0


def correct_pages(images) -> list:
    """Apply orientation correction to a list of page images, in place semantics
    (returns a new list of corrected images, original list untouched)."""
    corrected_pages = []
    for idx, img in enumerate(images, 1):
        try:
            corrected, angle, conf = detect_and_correct_orientation(img)
            if angle:
                logger.info("orientation page=%d rotated=%d confidence=%.2f", idx, angle, conf)
            corrected_pages.append(corrected)
        except Exception as exc:
            logger.warning("orientation_correction_failed page=%d error=%s", idx, exc)
            corrected_pages.append(img)
    return corrected_pages
