"""
Cell-level OCR extraction.

This module crops each detected cell region and runs RapidOCR offline.
It also applies confidence filtering and light image preprocessing.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

try:
    from rapidocr_onnxruntime import RapidOCR  # type: ignore

    _RAPID_OCR_AVAILABLE = True
except Exception:  # pragma: no cover - guarded import
    RapidOCR = None
    _RAPID_OCR_AVAILABLE = False

logger = logging.getLogger(__name__)


OCRCell = Dict[str, Any]
BBox = Tuple[int, int, int, int]


@dataclass
class CellExtractorConfig:
    """Config for OCR and preprocessing behavior."""

    min_box_w: int = 8
    min_box_h: int = 8
    pad_px: int = 2
    min_confidence: float = 0.45
    merge_line_breaks: bool = True
    sharpen: bool = True
    debug_dir: Optional[str] = None


class CellExtractor:
    """Extract text from table cell boxes using offline RapidOCR."""

    def __init__(self, config: Optional[CellExtractorConfig] = None) -> None:
        self.config = config or CellExtractorConfig()
        self._ocr_engine = RapidOCR() if _RAPID_OCR_AVAILABLE else None

    @property
    def is_ocr_available(self) -> bool:
        """Whether RapidOCR backend is available."""

        return self._ocr_engine is not None

    def extract_cells(self, image: np.ndarray, boxes: Sequence[BBox], table_offset: Tuple[int, int] = (0, 0)) -> List[OCRCell]:
        """
        OCR each cell and return position-preserving dictionaries.

        Args:
            image: BGR or grayscale image containing the table.
            boxes: Iterable of (x, y, w, h) boxes relative to image.
            table_offset: Optional absolute table offset in parent page.

        Returns:
            List of dict entries in the form:
            {x, y, w, h, text, confidence}
        """

        if image is None or image.size == 0:
            raise ValueError("Input image is empty")

        h_img, w_img = image.shape[:2]
        dx, dy = table_offset

        cells: List[OCRCell] = []

        for idx, box in enumerate(boxes):
            x, y, w, h = self._sanitize_box(box, w_img, h_img)
            if w < self.config.min_box_w or h < self.config.min_box_h:
                continue

            padded = self._apply_padding(x, y, w, h, w_img, h_img)
            crop = image[padded[1] : padded[1] + padded[3], padded[0] : padded[0] + padded[2]]

            prepared = self._prepare_crop(crop)
            text, conf = self._ocr_cell(prepared)

            cell = {
                "x": int(x + dx),
                "y": int(y + dy),
                "w": int(w),
                "h": int(h),
                "text": text,
                "confidence": float(conf),
            }
            cells.append(cell)

            self._debug_write(f"cell_{idx:04d}", prepared)

        return cells

    def _ocr_cell(self, crop: np.ndarray) -> Tuple[str, float]:
        """Run OCR with confidence-aware line filtering."""

        if self._ocr_engine is None:
            return "", 0.0

        try:
            result, _ = self._ocr_engine(crop)
        except Exception as exc:
            logger.warning("RapidOCR cell OCR failed: %s", exc)
            return "", 0.0

        if not result:
            return "", 0.0

        parts: List[str] = []
        confs: List[float] = []

        for item in result:
            text = str(item[1] or "").strip()
            score = float(item[2] or 0.0)
            if not text:
                continue
            if score < self.config.min_confidence:
                continue

            parts.append(text)
            confs.append(score)

        if not parts:
            return "", 0.0

        joiner = " " if self.config.merge_line_breaks else "\n"
        full_text = joiner.join(parts).strip()
        mean_conf = float(np.mean(confs)) if confs else 0.0

        return full_text, mean_conf

    def _prepare_crop(self, crop: np.ndarray) -> np.ndarray:
        """Enhance cell crop to improve OCR quality on faint scans."""

        gray = self._to_gray(crop)
        denoised = cv2.fastNlMeansDenoising(gray, h=8)

        resized = cv2.resize(denoised, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)

        _, binary = cv2.threshold(resized, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        if self.config.sharpen:
            kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
            binary = cv2.filter2D(binary, -1, kernel)

        return binary

    def _sanitize_box(self, box: BBox, max_w: int, max_h: int) -> BBox:
        """Clamp OCR box to image boundaries."""

        x, y, w, h = [int(v) for v in box]

        x = max(0, min(x, max_w - 1))
        y = max(0, min(y, max_h - 1))
        w = max(0, min(w, max_w - x))
        h = max(0, min(h, max_h - y))

        return x, y, w, h

    def _apply_padding(self, x: int, y: int, w: int, h: int, max_w: int, max_h: int) -> BBox:
        """Expand a box by a small padding margin."""

        p = max(int(self.config.pad_px), 0)

        x0 = max(0, x - p)
        y0 = max(0, y - p)
        x1 = min(max_w, x + w + p)
        y1 = min(max_h, y + h + p)

        return x0, y0, max(0, x1 - x0), max(0, y1 - y0)

    def _debug_write(self, stem: str, image: np.ndarray) -> None:
        """Write debug image if debug directory is configured."""

        if not self.config.debug_dir:
            return

        out_dir = Path(self.config.debug_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(out_dir / f"{stem}.png"), image)

    @staticmethod
    def _to_gray(image: np.ndarray) -> np.ndarray:
        """Convert BGR input to grayscale."""

        if len(image.shape) == 2:
            return image
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def extract_cell_texts(
    image: np.ndarray,
    boxes: Sequence[BBox],
    table_offset: Tuple[int, int] = (0, 0),
    config: Optional[CellExtractorConfig] = None,
) -> List[OCRCell]:
    """Convenience function for one-shot cell OCR."""

    extractor = CellExtractor(config=config)
    return extractor.extract_cells(image=image, boxes=boxes, table_offset=table_offset)
