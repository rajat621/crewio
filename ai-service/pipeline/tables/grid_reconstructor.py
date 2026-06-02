"""
Table grid reconstruction from line masks and OCR cells.

Builds a matrix representation and supports merged cells by assigning
row/column spans based on inferred boundaries.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np


OCRCell = Dict[str, Any]
BBox = Tuple[int, int, int, int]


@dataclass(frozen=True)
class GridCell:
    """Structured cell in reconstructed table grid."""

    row: int
    col: int
    row_span: int
    col_span: int
    bbox: BBox
    text: str
    confidence: float


@dataclass(frozen=True)
class GridReconstructionResult:
    """Output of grid reconstruction step."""

    table: List[List[str]]
    cells: List[GridCell]
    row_boundaries: List[int]
    col_boundaries: List[int]


@dataclass
class GridReconstructorConfig:
    """Settings for border extraction and boundary clustering."""

    min_line_coverage_ratio: float = 0.3
    boundary_merge_tolerance: int = 8
    min_cell_size_px: int = 6


class GridReconstructor:
    """Convert table contour contents into row/column matrix."""

    def __init__(self, config: Optional[GridReconstructorConfig] = None) -> None:
        self.config = config or GridReconstructorConfig()

    def reconstruct(
        self,
        table_image: np.ndarray,
        ocr_cells: Sequence[OCRCell],
        horizontal_mask: Optional[np.ndarray] = None,
        vertical_mask: Optional[np.ndarray] = None,
    ) -> GridReconstructionResult:
        """
        Reconstruct table grid from masks + OCR boxes.

        Args:
            table_image: Cropped table image.
            ocr_cells: OCR cell entries containing coordinates and text.
            horizontal_mask: Optional horizontal line mask for this table crop.
            vertical_mask: Optional vertical line mask for this table crop.

        Returns:
            GridReconstructionResult including matrix table[row][col].
        """

        if table_image is None or table_image.size == 0:
            raise ValueError("table_image is empty")

        h, w = table_image.shape[:2]

        if horizontal_mask is None or vertical_mask is None:
            horizontal_mask, vertical_mask = self._infer_line_masks(table_image)

        row_boundaries = self._infer_boundaries(horizontal_mask, axis=0, limit=h)
        col_boundaries = self._infer_boundaries(vertical_mask, axis=1, limit=w)

        row_boundaries = self._enrich_boundaries_with_cells(row_boundaries, ocr_cells, key="y", span_key="h", limit=h)
        col_boundaries = self._enrich_boundaries_with_cells(col_boundaries, ocr_cells, key="x", span_key="w", limit=w)

        if len(row_boundaries) < 2 or len(col_boundaries) < 2:
            # Fallback to OCR-only segmentation when borders are missing.
            row_boundaries = self._fallback_boundaries_from_cells(ocr_cells, key="y", span_key="h", limit=h)
            col_boundaries = self._fallback_boundaries_from_cells(ocr_cells, key="x", span_key="w", limit=w)

        row_count = max(len(row_boundaries) - 1, 0)
        col_count = max(len(col_boundaries) - 1, 0)

        table: List[List[str]] = [["" for _ in range(col_count)] for _ in range(row_count)]
        confidence_acc = [[[] for _ in range(col_count)] for _ in range(row_count)]

        grid_cells: List[GridCell] = []

        for raw_cell in ocr_cells:
            cell = self._normalize_cell(raw_cell)
            if cell["w"] < self.config.min_cell_size_px or cell["h"] < self.config.min_cell_size_px:
                continue

            row_start, row_end = self._span_indices(row_boundaries, cell["y"], cell["y"] + cell["h"])
            col_start, col_end = self._span_indices(col_boundaries, cell["x"], cell["x"] + cell["w"])

            if row_start is None or col_start is None:
                continue

            row_span = max(1, row_end - row_start + 1)
            col_span = max(1, col_end - col_start + 1)

            text = str(cell["text"])
            conf = float(cell["confidence"])

            # Store text in top-left slot and concatenate if multiple OCR boxes map there.
            base_text = table[row_start][col_start].strip()
            if base_text and text:
                table[row_start][col_start] = f"{base_text} {text}".strip()
            elif text:
                table[row_start][col_start] = text

            confidence_acc[row_start][col_start].append(conf)

            grid_cells.append(
                GridCell(
                    row=row_start,
                    col=col_start,
                    row_span=row_span,
                    col_span=col_span,
                    bbox=(cell["x"], cell["y"], cell["w"], cell["h"]),
                    text=text,
                    confidence=conf,
                )
            )

        return GridReconstructionResult(
            table=table,
            cells=grid_cells,
            row_boundaries=row_boundaries,
            col_boundaries=col_boundaries,
        )

    def _infer_line_masks(self, table_image: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Infer horizontal/vertical masks when detector masks are unavailable."""

        gray = self._to_gray(table_image)
        binary = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            31,
            15,
        )

        h, w = binary.shape[:2]
        horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(w // 30, 20), 1))
        vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(h // 30, 20)))

        horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horizontal_kernel, iterations=1)
        vertical = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vertical_kernel, iterations=1)

        return horizontal, vertical

    def _infer_boundaries(self, line_mask: np.ndarray, axis: int, limit: int) -> List[int]:
        """Find row/column boundaries from line occupancy projections."""

        if axis == 0:
            projection = np.sum(line_mask > 0, axis=1)
            line_len = line_mask.shape[1]
        else:
            projection = np.sum(line_mask > 0, axis=0)
            line_len = line_mask.shape[0]

        threshold = max(int(line_len * self.config.min_line_coverage_ratio), 1)
        indices = np.where(projection >= threshold)[0].tolist()

        if not indices:
            return [0, limit]

        merged = self._merge_nearby_points(indices, self.config.boundary_merge_tolerance)

        boundaries = [0] + [i for i in merged if 0 < i < limit] + [limit]
        boundaries = sorted(set(boundaries))

        # Ensure at least two boundaries.
        if len(boundaries) < 2:
            return [0, limit]

        return boundaries

    def _fallback_boundaries_from_cells(self, cells: Sequence[OCRCell], key: str, span_key: str, limit: int) -> List[int]:
        """Fallback segmentation based on OCR boxes only."""

        points: List[int] = [0, limit]

        for cell in cells:
            start = int(cell.get(key, 0))
            span = int(cell.get(span_key, 0))
            end = start + span
            if 0 < start < limit:
                points.append(start)
            if 0 < end < limit:
                points.append(end)

        merged = self._merge_nearby_points(sorted(points), self.config.boundary_merge_tolerance)
        boundaries = sorted(set([0, limit] + merged))

        return boundaries

    def _enrich_boundaries_with_cells(
        self,
        boundaries: List[int],
        cells: Sequence[OCRCell],
        key: str,
        span_key: str,
        limit: int,
    ) -> List[int]:
        """Add OCR-driven boundary hints to recover missing borders."""

        points = list(boundaries)
        for cell in cells:
            start = int(cell.get(key, 0))
            end = start + int(cell.get(span_key, 0))

            if 0 < start < limit:
                points.append(start)
            if 0 < end < limit:
                points.append(end)

        merged = self._merge_nearby_points(sorted(points), self.config.boundary_merge_tolerance)

        output = sorted(set([0, limit] + merged))
        return output

    def _span_indices(self, boundaries: List[int], start: int, end: int) -> Tuple[Optional[int], Optional[int]]:
        """Map a box [start, end] to boundary interval indices."""

        if len(boundaries) < 2:
            return None, None

        start_idx: Optional[int] = None
        end_idx: Optional[int] = None

        center_start = start + 1
        center_end = max(start + 1, end - 1)

        for idx in range(len(boundaries) - 1):
            left = boundaries[idx]
            right = boundaries[idx + 1]

            if start_idx is None and left <= center_start < right:
                start_idx = idx
            if left < center_end <= right:
                end_idx = idx

        if start_idx is None:
            start_idx = self._nearest_interval(boundaries, start)
        if end_idx is None:
            end_idx = self._nearest_interval(boundaries, end)

        if start_idx is None or end_idx is None:
            return None, None

        if end_idx < start_idx:
            start_idx, end_idx = end_idx, start_idx

        return start_idx, end_idx

    @staticmethod
    def _nearest_interval(boundaries: List[int], point: int) -> Optional[int]:
        """Return closest interval index for out-of-range points."""

        if len(boundaries) < 2:
            return None

        distances = []
        for idx in range(len(boundaries) - 1):
            mid = (boundaries[idx] + boundaries[idx + 1]) / 2.0
            distances.append((abs(mid - point), idx))

        distances.sort(key=lambda x: x[0])
        return distances[0][1] if distances else None

    @staticmethod
    def _merge_nearby_points(points: Sequence[int], tolerance: int) -> List[int]:
        """Cluster close boundary points into stable line positions."""

        if not points:
            return []

        merged: List[List[int]] = [[int(points[0])]]
        for value in points[1:]:
            if abs(value - merged[-1][-1]) <= tolerance:
                merged[-1].append(int(value))
            else:
                merged.append([int(value)])

        return [int(round(float(np.mean(group)))) for group in merged]

    @staticmethod
    def _normalize_cell(cell: OCRCell) -> OCRCell:
        """Normalize OCR cell dictionary."""

        return {
            "x": int(cell.get("x", 0)),
            "y": int(cell.get("y", 0)),
            "w": int(cell.get("w", 0)),
            "h": int(cell.get("h", 0)),
            "text": str(cell.get("text", "") or "").strip(),
            "confidence": float(cell.get("confidence", 0.0) or 0.0),
        }

    @staticmethod
    def _to_gray(image: np.ndarray) -> np.ndarray:
        """Convert image to grayscale."""

        if len(image.shape) == 2:
            return image
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def reconstruct_grid(
    table_image: np.ndarray,
    ocr_cells: Sequence[OCRCell],
    horizontal_mask: Optional[np.ndarray] = None,
    vertical_mask: Optional[np.ndarray] = None,
    config: Optional[GridReconstructorConfig] = None,
) -> GridReconstructionResult:
    """Convenience function for one-shot grid reconstruction."""

    return GridReconstructor(config=config).reconstruct(
        table_image=table_image,
        ocr_cells=ocr_cells,
        horizontal_mask=horizontal_mask,
        vertical_mask=vertical_mask,
    )
