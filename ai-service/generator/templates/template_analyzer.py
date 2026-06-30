"""Template image analysis for header/footer/branding safe rendering boundaries."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

import cv2
import numpy as np


@dataclass(frozen=True)
class TemplateAnalysis:
    header_bottom: int
    footer_top: int
    content_left: int
    content_right: int
    logo_regions: List[Tuple[int, int, int, int]]
    watermark_regions: List[Tuple[int, int, int, int]]


class TemplateAnalyzer:
    """Detect printable white zone boundaries and branding-heavy regions."""

    def analyze(self, image_bgr: np.ndarray) -> TemplateAnalysis:
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape[:2]

        # Whitespace projection helps identify body region.
        row_dark = np.mean(gray < 230, axis=1)
        col_dark = np.mean(gray < 230, axis=0)

        header_bottom = self._find_transition(row_dark, start=0, end=max(h // 2, 1), threshold=0.08, default=h // 6)
        footer_top = self._find_transition_reverse(row_dark, start=h - 1, end=h // 2, threshold=0.08, default=h - (h // 7))

        content_left = self._find_transition(col_dark, start=0, end=max(w // 2, 1), threshold=0.05, default=w // 10)
        content_right = self._find_transition_reverse(col_dark, start=w - 1, end=w // 2, threshold=0.05, default=w - (w // 10))

        # Detect dense graphic regions (logos, side branding, watermark blocks).
        logo_regions = self._find_graphic_regions(gray, area_min=(w * h) * 0.002)
        watermark_regions = self._find_watermark_regions(gray)

        # Keep safe area sane.
        if footer_top <= header_bottom + 120:
            header_bottom = max(header_bottom, int(h * 0.18))
            footer_top = min(footer_top, int(h * 0.84))

        if content_right <= content_left + 180:
            content_left = max(content_left, int(w * 0.08))
            content_right = min(content_right, int(w * 0.92))

        return TemplateAnalysis(
            header_bottom=int(header_bottom),
            footer_top=int(footer_top),
            content_left=int(content_left),
            content_right=int(content_right),
            logo_regions=logo_regions,
            watermark_regions=watermark_regions,
        )

    def _find_graphic_regions(self, gray: np.ndarray, area_min: float) -> List[Tuple[int, int, int, int]]:
        thr = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 12)
        contours, _ = cv2.findContours(thr, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        regions: List[Tuple[int, int, int, int]] = []

        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            area = w * h
            if area < area_min:
                continue
            if w < 35 or h < 20:
                continue
            regions.append((x, y, w, h))

        regions.sort(key=lambda r: r[2] * r[3], reverse=True)
        return regions[:20]

    def _find_watermark_regions(self, gray: np.ndarray) -> List[Tuple[int, int, int, int]]:
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blur, 60, 160)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        merged = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(merged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        out: List[Tuple[int, int, int, int]] = []
        h, w = gray.shape[:2]
        for cnt in contours:
            x, y, cw, ch = cv2.boundingRect(cnt)
            area = cw * ch
            if area < (w * h) * 0.01:
                continue
            if cw < w * 0.25 or ch < h * 0.05:
                continue
            out.append((x, y, cw, ch))

        return out[:8]

    def _find_transition(self, signal: np.ndarray, start: int, end: int, threshold: float, default: int) -> int:
        for i in range(start, end):
            if float(signal[i]) <= threshold:
                return i
        return default

    def _find_transition_reverse(self, signal: np.ndarray, start: int, end: int, threshold: float, default: int) -> int:
        for i in range(start, end, -1):
            if float(signal[i]) <= threshold:
                return i
        return default
