<<<<<<< HEAD
﻿"""
=======
"""
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
Table boundary and line detection utilities.

This module focuses on robust table localization for scanned UAE labour sheets.
It performs:
- image enhancement
- skew correction
- morphology-based line detection
- contour filtering

All logic is offline and uses OpenCV only.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np
<<<<<<< HEAD
from pipeline.profiler import current, new_request_collector
=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TableContour:
    """Represents one detected table region."""

    x: int
    y: int
    w: int
    h: int
    area: int


@dataclass(frozen=True)
class TableDetectionResult:
    """Output of table detection pipeline."""

    contours: List[TableContour]
    horizontal_mask: np.ndarray
    vertical_mask: np.ndarray
    table_mask: np.ndarray
    binarized: np.ndarray
    deskew_angle: float


@dataclass
class TableDetectorConfig:
    """Tunable settings for table detection."""

    min_table_area_ratio: float = 0.01
    max_table_area_ratio: float = 0.95
    line_scale_divisor: int = 30
    morphology_iterations: int = 1
    deskew_max_angle_deg: float = 8.0
    adaptive_block_size: int = 31
    adaptive_c: int = 15
    debug_dir: Optional[str] = None


class TableDetector:
    """Detects table boundaries and rule lines from noisy document images."""

    def __init__(self, config: Optional[TableDetectorConfig] = None) -> None:
        self.config = config or TableDetectorConfig()

    def detect_tables(self, image: np.ndarray) -> TableDetectionResult:
        """
        Detect table contours and line masks from a page image.

        Args:
            image: BGR or grayscale numpy image.

        Returns:
            TableDetectionResult containing contours and intermediate masks.
        """

<<<<<<< HEAD
        prof = current()
        with (prof or new_request_collector()).time_stage("table_detector.detect_tables"):
            if image is None or image.size == 0:
                raise ValueError("Input image is empty")

            enhanced = self._enhance_image(image)
            deskewed, angle = self._deskew_image(enhanced)
            binary = self._binarize(deskewed)

            horizontal_mask, vertical_mask = self._detect_lines(binary)
            table_mask = cv2.bitwise_or(horizontal_mask, vertical_mask)

            contours = self._extract_table_contours(table_mask, deskewed.shape[:2])
=======
        if image is None or image.size == 0:
            raise ValueError("Input image is empty")

        enhanced = self._enhance_image(image)
        deskewed, angle = self._deskew_image(enhanced)
        binary = self._binarize(deskewed)

        horizontal_mask, vertical_mask = self._detect_lines(binary)
        table_mask = cv2.bitwise_or(horizontal_mask, vertical_mask)

        contours = self._extract_table_contours(table_mask, deskewed.shape[:2])
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

        self._debug_write("01_enhanced", enhanced)
        self._debug_write("02_deskewed", deskewed)
        self._debug_write("03_binary", binary)
        self._debug_write("04_horizontal_mask", horizontal_mask)
        self._debug_write("05_vertical_mask", vertical_mask)
        self._debug_write("06_table_mask", table_mask)
        self._debug_write("07_table_contours", self._render_contours(deskewed, contours))

        return TableDetectionResult(
            contours=contours,
            horizontal_mask=horizontal_mask,
            vertical_mask=vertical_mask,
            table_mask=table_mask,
            binarized=binary,
            deskew_angle=angle,
        )

    def detect_tables_from_path(self, image_path: str) -> TableDetectionResult:
        """Convenience wrapper to detect tables directly from an image path."""

        image = cv2.imread(image_path)
        if image is None:
            raise FileNotFoundError(f"Unable to read image: {image_path}")
        return self.detect_tables(image)

    def _enhance_image(self, image: np.ndarray) -> np.ndarray:
        """Improve local contrast and reduce noise before binarization."""

        gray = self._to_gray(image)
        denoised = cv2.fastNlMeansDenoising(gray, h=10)

        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        contrast = clahe.apply(denoised)

        return contrast

    def _deskew_image(self, gray_image: np.ndarray) -> Tuple[np.ndarray, float]:
        """Estimate skew using Hough lines and rotate image back to horizontal."""

        edges = cv2.Canny(gray_image, 50, 150, apertureSize=3)
        lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi / 180,
            threshold=80,
            minLineLength=max(gray_image.shape[1] // 8, 50),
            maxLineGap=20,
        )

        if lines is None:
            return gray_image, 0.0

        angles: List[float] = []
        for raw in lines:
            x1, y1, x2, y2 = raw[0]
            dx = x2 - x1
            dy = y2 - y1
            if dx == 0:
                continue
            angle = math.degrees(math.atan2(dy, dx))
            if abs(angle) <= self.config.deskew_max_angle_deg:
                angles.append(angle)

        if not angles:
            return gray_image, 0.0

        median_angle = float(np.median(angles))
        if abs(median_angle) < 0.2:
            return gray_image, median_angle

        h, w = gray_image.shape[:2]
        center = (w // 2, h // 2)
        matrix = cv2.getRotationMatrix2D(center, median_angle, 1.0)
        rotated = cv2.warpAffine(
            gray_image,
            matrix,
            (w, h),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_REPLICATE,
        )

        return rotated, median_angle

    def _binarize(self, gray_image: np.ndarray) -> np.ndarray:
        """Generate a binary inverse image suitable for morphology operations."""

        block_size = self.config.adaptive_block_size
        if block_size % 2 == 0:
            block_size += 1

        adaptive = cv2.adaptiveThreshold(
            gray_image,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            block_size,
            self.config.adaptive_c,
        )

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        cleaned = cv2.morphologyEx(adaptive, cv2.MORPH_OPEN, kernel, iterations=1)

        return cleaned

    def _detect_lines(self, binary: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Detect horizontal and vertical lines from binary image."""

        height, width = binary.shape[:2]
        line_len_h = max(width // self.config.line_scale_divisor, 20)
        line_len_v = max(height // self.config.line_scale_divisor, 20)

        horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (line_len_h, 1))
        vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, line_len_v))

        horizontal = cv2.morphologyEx(
            binary,
            cv2.MORPH_OPEN,
            horizontal_kernel,
            iterations=self.config.morphology_iterations,
        )

        vertical = cv2.morphologyEx(
            binary,
            cv2.MORPH_OPEN,
            vertical_kernel,
            iterations=self.config.morphology_iterations,
        )

        return horizontal, vertical

    def _extract_table_contours(self, table_mask: np.ndarray, shape: Sequence[int]) -> List[TableContour]:
        """Filter contours to probable table rectangles."""

        height, width = int(shape[0]), int(shape[1])
        page_area = max(height * width, 1)

        contours, _ = cv2.findContours(table_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        min_area = page_area * self.config.min_table_area_ratio
        max_area = page_area * self.config.max_table_area_ratio

        results: List[TableContour] = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            area = w * h

            if area < min_area or area > max_area:
                continue
            if w < 80 or h < 40:
                continue

            results.append(TableContour(x=x, y=y, w=w, h=h, area=area))

        results.sort(key=lambda c: (c.y, c.x))

        logger.info("Detected %s table contour(s)", len(results))
        return results

    def _render_contours(self, gray_image: np.ndarray, contours: List[TableContour]) -> np.ndarray:
        """Render contour boxes for debug visualization."""

        canvas = cv2.cvtColor(self._to_gray(gray_image), cv2.COLOR_GRAY2BGR)
        for item in contours:
            cv2.rectangle(canvas, (item.x, item.y), (item.x + item.w, item.y + item.h), (0, 255, 0), 2)
        return canvas

    def _debug_write(self, stem: str, image: np.ndarray) -> None:
        """Persist debug image if debug mode is enabled."""

        debug_dir = self.config.debug_dir
        if not debug_dir:
            return

        path = Path(debug_dir)
        path.mkdir(parents=True, exist_ok=True)

        out_path = path / f"{stem}.png"
        cv2.imwrite(str(out_path), image)

    @staticmethod
    def _to_gray(image: np.ndarray) -> np.ndarray:
        """Convert BGR images to grayscale while keeping grayscale inputs unchanged."""

        if len(image.shape) == 2:
            return image
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def detect_table_contours(image: np.ndarray, config: Optional[TableDetectorConfig] = None) -> List[TableContour]:
    """Small helper for one-shot table contour detection."""

    detector = TableDetector(config=config)
    return detector.detect_tables(image).contours
