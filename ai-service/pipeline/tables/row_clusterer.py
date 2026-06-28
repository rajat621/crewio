<<<<<<< HEAD
﻿"""
=======
"""
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
Y-axis clustering for OCR cells.

Groups OCR boxes into logical rows even when scans are slightly skewed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np


OCRCell = Dict[str, Any]


@dataclass
class RowClusterConfig:
    """Settings controlling row clustering behavior."""

    y_tolerance_px: float = 12.0
    y_tolerance_ratio: float = 0.45
    min_row_height: int = 8
    use_skew_correction: bool = True


@dataclass(frozen=True)
class RowCluster:
    """One row cluster and its bounding coordinates."""

    y_top: int
    y_bottom: int
    cells: List[OCRCell]


class RowClusterer:
    """Tolerance-based clustering of OCR cells by vertical alignment."""

    def __init__(self, config: Optional[RowClusterConfig] = None) -> None:
        self.config = config or RowClusterConfig()

    def cluster_rows(self, cells: Sequence[OCRCell], skew_angle_deg: float = 0.0) -> List[RowCluster]:
        """
        Group OCR cells into rows.

        Args:
            cells: OCR cells containing x,y,w,h,text fields.
            skew_angle_deg: Optional document skew angle for positional correction.

        Returns:
            Row clusters sorted from top to bottom.
        """

        cleaned_cells = [self._normalize_cell(c) for c in cells if self._is_valid_cell(c)]
        if not cleaned_cells:
            return []

        adjusted = self._apply_skew_compensation(cleaned_cells, skew_angle_deg)
        adjusted.sort(key=lambda item: item["_y_center"])

        rows: List[List[OCRCell]] = []
        row_centers: List[float] = []

        for cell in adjusted:
            y_center = float(cell["_y_center"])
            matched_idx = self._find_matching_row(row_centers, y_center, float(cell["h"]))

            if matched_idx is None:
                rows.append([cell])
                row_centers.append(y_center)
                continue

            rows[matched_idx].append(cell)
            row_centers[matched_idx] = float(np.mean([item["_y_center"] for item in rows[matched_idx]]))

        clusters: List[RowCluster] = []
        for row_cells in rows:
            row_cells.sort(key=lambda item: (item["x"], item["y"]))

            y_top = int(min(item["y"] for item in row_cells))
            y_bottom = int(max(item["y"] + item["h"] for item in row_cells))

            if (y_bottom - y_top) < self.config.min_row_height:
                continue

            clusters.append(
                RowCluster(
                    y_top=y_top,
                    y_bottom=y_bottom,
                    cells=[self._strip_internal_fields(item) for item in row_cells],
                )
            )

        clusters.sort(key=lambda row: row.y_top)
        return clusters

    def _find_matching_row(self, row_centers: List[float], y_center: float, cell_height: float) -> Optional[int]:
        """Find existing row index for cell, using dynamic tolerance."""

        tolerance = max(self.config.y_tolerance_px, cell_height * self.config.y_tolerance_ratio)

        best_idx: Optional[int] = None
        best_dist = float("inf")

        for idx, center in enumerate(row_centers):
            dist = abs(center - y_center)
            if dist <= tolerance and dist < best_dist:
                best_dist = dist
                best_idx = idx

        return best_idx

    def _apply_skew_compensation(self, cells: List[OCRCell], skew_angle_deg: float) -> List[OCRCell]:
        """Adjust y-center with x-based compensation for skewed scans."""

        if not self.config.use_skew_correction or abs(skew_angle_deg) < 0.01:
            for cell in cells:
                cell["_y_center"] = cell["y"] + (cell["h"] / 2.0)
            return cells

        slope = np.tan(np.deg2rad(skew_angle_deg))
        x_origin = min(float(c["x"]) for c in cells)

        for cell in cells:
            x_center = float(cell["x"] + (cell["w"] / 2.0))
            y_center = float(cell["y"] + (cell["h"] / 2.0))
            compensated = y_center - ((x_center - x_origin) * slope)
            cell["_y_center"] = compensated

        return cells

    @staticmethod
    def _normalize_cell(cell: OCRCell) -> OCRCell:
        """Ensure coordinate values are numeric and text exists."""

        return {
            "x": int(cell.get("x", 0)),
            "y": int(cell.get("y", 0)),
            "w": int(cell.get("w", 0)),
            "h": int(cell.get("h", 0)),
            "text": str(cell.get("text", "") or "").strip(),
            "confidence": float(cell.get("confidence", 0.0) or 0.0),
        }

    @staticmethod
    def _strip_internal_fields(cell: OCRCell) -> OCRCell:
        """Drop temporary clustering fields before returning output."""

        output = dict(cell)
        output.pop("_y_center", None)
        return output

    @staticmethod
    def _is_valid_cell(cell: OCRCell) -> bool:
        """Basic guardrail for malformed boxes."""

        try:
            w = int(cell.get("w", 0))
            h = int(cell.get("h", 0))
        except Exception:
            return False

        return w > 0 and h > 0


def cluster_rows(cells: Sequence[OCRCell], skew_angle_deg: float = 0.0, config: Optional[RowClusterConfig] = None) -> List[RowCluster]:
    """Convenience function for row clustering."""

    return RowClusterer(config=config).cluster_rows(cells=cells, skew_angle_deg=skew_angle_deg)
