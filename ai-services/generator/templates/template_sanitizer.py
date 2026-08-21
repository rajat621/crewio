"""Template classification and sanitization for production-safe invoice rendering."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

import cv2
import numpy as np

from generator.templates.template_analyzer import TemplateAnalyzer
from generator.templates.template_loader import TemplateAsset

try:
    import pdfplumber
except Exception:  # pragma: no cover
    pdfplumber = None

try:
    import pytesseract
except Exception:  # pragma: no cover
    pytesseract = None


class TemplateClass:
    CLEAN_LETTERHEAD = "CLEAN_LETTERHEAD"
    DIRTY_TEMPLATE = "DIRTY_TEMPLATE"


@dataclass(frozen=True)
class TemplateSanitizationResult:
    template_asset: Optional[TemplateAsset]
    classification: str
    dirty_score: float
    reasons: Sequence[str]


class TemplateSanitizer:
    """Classify templates and sanitize invoice-heavy regions when needed."""

    _KEYWORDS = {
        "tax invoice",
        "invoice",
        "invoice no",
        "invoice date",
        "subtotal",
        "total",
        "total deduction",
        "vat",
        "vat amount",
        "net amount",
        "amount",
        "s.no",
        "si no",
        "trade",
        "hours",
        "unit price",
        "project",
        "authorized signatory",
    }

    def __init__(self, work_dir: str) -> None:
        self.work_dir = work_dir

    def classify_and_sanitize(self, asset: Optional[TemplateAsset]) -> TemplateSanitizationResult:
        if not asset or not asset.page_images:
            return TemplateSanitizationResult(asset, TemplateClass.CLEAN_LETTERHEAD, 0.0, ())

        first_page = asset.page_images[0]
        image = cv2.imread(first_page)
        if image is None:
            return TemplateSanitizationResult(asset, TemplateClass.CLEAN_LETTERHEAD, 0.0, ("template_read_failed",))

        text = self._extract_template_text(asset, image)
        score, reasons = self._score_dirty_template(image, text)
        classification = TemplateClass.DIRTY_TEMPLATE if score >= 3.0 else TemplateClass.CLEAN_LETTERHEAD

        if classification == TemplateClass.CLEAN_LETTERHEAD:
            return TemplateSanitizationResult(asset, classification, score, tuple(reasons))

        sanitized_pages = self._sanitize_pages(asset.page_images)
        if not sanitized_pages:
            return TemplateSanitizationResult(asset, classification, score, tuple(reasons + ["sanitize_failed"]))

        sanitized_asset = TemplateAsset(
            source_path=asset.source_path,
            page_images=sanitized_pages,
            width_px=asset.width_px,
            height_px=asset.height_px,
            dpi=asset.dpi,
            is_pdf=asset.is_pdf,
        )
        return TemplateSanitizationResult(
            sanitized_asset,
            classification,
            score,
            tuple(reasons + ["central_content_sanitized"]),
        )

    def _extract_template_text(self, asset: TemplateAsset, image_bgr: np.ndarray) -> str:
        text_chunks: List[str] = []

        if asset.source_path.lower().endswith(".pdf") and pdfplumber is not None and os.path.exists(asset.source_path):
            try:
                with pdfplumber.open(asset.source_path) as pdf:
                    if pdf.pages:
                        text_chunks.append(pdf.pages[0].extract_text() or "")
            except Exception:
                pass

        if pytesseract is not None:
            try:
                gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
                text_chunks.append(pytesseract.image_to_string(gray, config="--psm 6"))
            except Exception:
                pass

        return "\n".join(text_chunks).lower()

    def _score_dirty_template(self, image_bgr: np.ndarray, text: str) -> Tuple[float, List[str]]:
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape[:2]
        reasons: List[str] = []
        score = 0.0

        # Heuristic 1: table line density in central region.
        cx1, cx2 = int(w * 0.14), int(w * 0.86)
        cy1, cy2 = int(h * 0.16), int(h * 0.88)
        central = gray[cy1:cy2, cx1:cx2]

        bin_inv = cv2.threshold(central, 210, 255, cv2.THRESH_BINARY_INV)[1]
        hk = cv2.getStructuringElement(cv2.MORPH_RECT, (max(central.shape[1] // 25, 20), 1))
        vk = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(central.shape[0] // 30, 18)))
        h_lines = cv2.morphologyEx(bin_inv, cv2.MORPH_OPEN, hk)
        v_lines = cv2.morphologyEx(bin_inv, cv2.MORPH_OPEN, vk)
        line_density = float(np.count_nonzero(h_lines | v_lines)) / float(max(central.size, 1))
        if line_density > 0.02:
            score += 1.5
            reasons.append(f"table_line_density={line_density:.4f}")

        # Heuristic 2: contour/text density in center.
        c_contours, _ = cv2.findContours(bin_inv, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        dense_boxes = 0
        numeric_like = 0
        for cnt in c_contours:
            x, y, cw, ch = cv2.boundingRect(cnt)
            area = cw * ch
            if area < 80:
                continue
            if cw > central.shape[1] * 0.65 and ch < 8:
                dense_boxes += 1
            if 16 <= cw <= 130 and 8 <= ch <= 30:
                numeric_like += 1
        if dense_boxes >= 10:
            score += 1.0
            reasons.append(f"dense_grid_rows={dense_boxes}")
        if numeric_like >= 45:
            score += 0.8
            reasons.append(f"numeric_box_count={numeric_like}")

        # Heuristic 3: keyword hit-rate.
        keyword_hits = [kw for kw in self._KEYWORDS if kw in text]
        if len(keyword_hits) >= 3:
            score += 1.2
            reasons.append(f"invoice_keywords={len(keyword_hits)}")

        # Heuristic 4: repeated numeric rows from OCR/PDF text.
        numeric_rows = 0
        for line in text.splitlines():
            line_norm = line.strip()
            if not line_norm:
                continue
            numbers = re.findall(r"\d+(?:[\.,]\d+)?", line_norm)
            if len(numbers) >= 2 and len(line_norm) <= 120:
                numeric_rows += 1
        if numeric_rows >= 6:
            score += 1.0
            reasons.append(f"numeric_rows={numeric_rows}")

        return score, reasons

    def _sanitize_pages(self, page_images: Sequence[str]) -> List[str]:
        out_paths: List[str] = []
        analyzer = TemplateAnalyzer()
        for idx, src in enumerate(page_images):
            image = cv2.imread(src)
            if image is None:
                continue

            sanitized = image.copy()
            h, w = sanitized.shape[:2]
            analysis = analyzer.analyze(image)

            x1, y1, x2, y2 = self._detect_content_block(image)

            # Aggressively sanitize body band while preserving top/header, side branding, and footer.
            body_x1 = max(int(w * 0.08), analysis.content_left + 2)
            body_x2 = min(int(w * 0.995), max(analysis.content_right + 10, int(w * 0.94)))
            body_y1 = max(int(h * 0.14), analysis.header_bottom + 4)
            body_y2 = min(int(h * 0.90), analysis.footer_top - 4)

            # Expand with detected content block so stale tables/totals are fully removed.
            x1 = max(body_x1, min(x1, body_x1))
            x2 = min(body_x2, max(x2, body_x2))
            y1 = max(body_y1, min(y1, body_y1))
            y2 = min(body_y2, max(y2, body_y2))

            if x2 <= x1 + 60 or y2 <= y1 + 60:
                x1, y1, x2, y2 = int(w * 0.10), int(h * 0.16), int(w * 0.90), int(h * 0.88)

            # Preserve faint watermark tones while removing darker/high-density invoice artifacts.
            region = sanitized[y1:y2, x1:x2]
            region_gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)

            dark_mask = cv2.threshold(region_gray, 208, 255, cv2.THRESH_BINARY_INV)[1]

            line_bin = cv2.threshold(region_gray, 220, 255, cv2.THRESH_BINARY_INV)[1]
            hk = cv2.getStructuringElement(cv2.MORPH_RECT, (max((x2 - x1) // 26, 18), 1))
            vk = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max((y2 - y1) // 28, 16)))
            line_mask = cv2.morphologyEx(line_bin, cv2.MORPH_OPEN, hk) | cv2.morphologyEx(line_bin, cv2.MORPH_OPEN, vk)

            blackhat = cv2.morphologyEx(region_gray, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7)))
            text_mask = cv2.threshold(blackhat, 20, 255, cv2.THRESH_BINARY)[1]

            artifact_mask = dark_mask | line_mask | text_mask
            artifact_mask = cv2.dilate(artifact_mask, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1)

            region[artifact_mask > 0] = 255
            sanitized[y1:y2, x1:x2] = region

            out_path = os.path.join(self.work_dir, f"sanitized_template_page_{idx + 1:03d}.png")
            cv2.imwrite(out_path, sanitized)
            out_paths.append(out_path)

        return out_paths

    def _detect_content_block(self, image_bgr: np.ndarray) -> Tuple[int, int, int, int]:
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape[:2]

        # Concentrate on center where invoice data blocks typically live.
        roi_x1, roi_x2 = int(w * 0.1), int(w * 0.9)
        roi_y1, roi_y2 = int(h * 0.12), int(h * 0.9)
        roi = gray[roi_y1:roi_y2, roi_x1:roi_x2]

        inv = cv2.threshold(roi, 215, 255, cv2.THRESH_BINARY_INV)[1]
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 7))
        merged = cv2.morphologyEx(inv, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(merged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        boxes: List[Tuple[int, int, int, int]] = []
        for cnt in contours:
            x, y, bw, bh = cv2.boundingRect(cnt)
            area = bw * bh
            if area < (w * h) * 0.0015:
                continue
            if bw < w * 0.08 or bh < h * 0.015:
                continue
            boxes.append((x + roi_x1, y + roi_y1, bw, bh))

        if not boxes:
            return int(w * 0.16), int(h * 0.2), int(w * 0.84), int(h * 0.82)

        x1 = min(b[0] for b in boxes)
        y1 = min(b[1] for b in boxes)
        x2 = max(b[0] + b[2] for b in boxes)
        y2 = max(b[1] + b[3] for b in boxes)

        pad_x = int(w * 0.015)
        pad_y = int(h * 0.015)
        return max(0, x1 - pad_x), max(0, y1 - pad_y), min(w, x2 + pad_x), min(h, y2 + pad_y)
