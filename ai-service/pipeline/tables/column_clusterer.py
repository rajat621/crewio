"""
X-axis clustering for OCR cells.

Aligns OCR boxes into dynamic columns while handling uneven spacing.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

import numpy as np


OCRCell = Dict[str, Any]


@dataclass
class ColumnClusterConfig:
    """Settings controlling column detection and alignment."""

    x_tolerance_px: float = 14.0
    x_tolerance_ratio: float = 0.45
    min_column_width: int = 6
    dynamic_split_ratio: float = 1.8


@dataclass(frozen=True)
class ColumnCluster:
    """One detected column with center and assigned cells."""

    x_left: int
    x_right: int
    x_center: float
    cells: List[OCRCell]


class ColumnClusterer:
    """Dynamic column clustering using X-center distances."""

    def __init__(self, config: Optional[ColumnClusterConfig] = None) -> None:
        self.config = config or ColumnClusterConfig()

    def cluster_columns(self, cells: Sequence[OCRCell]) -> List[ColumnCluster]:
        """
        Cluster OCR cells into columns.

        Args:
            cells: OCR cell dictionaries with x/y/w/h/text.

        Returns:
            Column clusters sorted from left to right.
        """

        normalized = [self._normalize_cell(c) for c in cells if self._is_valid_cell(c)]
        if not normalized:
            return []

        normalized.sort(key=lambda item: item["_x_center"])

        columns: List[List[OCRCell]] = []
        col_centers: List[float] = []

        for cell in normalized:
            x_center = float(cell["_x_center"])
            match_idx = self._find_matching_column(col_centers, x_center, float(cell["w"]))

            if match_idx is None:
                columns.append([cell])
                col_centers.append(x_center)
                continue

            columns[match_idx].append(cell)
            col_centers[match_idx] = float(np.mean([c["_x_center"] for c in columns[match_idx]]))

        # Secondary pass: split overly broad clusters caused by sparse rows.
        columns = self._split_wide_columns(columns)

        clusters: List[ColumnCluster] = []
        for col_cells in columns:
            col_cells.sort(key=lambda item: (item["y"], item["x"]))

            x_left = int(min(item["x"] for item in col_cells))
            x_right = int(max(item["x"] + item["w"] for item in col_cells))
            width = x_right - x_left

            if width < self.config.min_column_width:
                continue

            clusters.append(
                ColumnCluster(
                    x_left=x_left,
                    x_right=x_right,
                    x_center=float(np.mean([item["_x_center"] for item in col_cells])),
                    cells=[self._strip_internal_fields(item) for item in col_cells],
                )
            )

        clusters.sort(key=lambda col: col.x_center)
        return clusters

    def _split_wide_columns(self, columns: List[List[OCRCell]]) -> List[List[OCRCell]]:
        """Split columns that likely contain two merged logical columns."""

        if len(columns) <= 1:
            return columns

        widths = []
        for column in columns:
            left = min(c["x"] for c in column)
            right = max(c["x"] + c["w"] for c in column)
            widths.append(float(right - left))

        baseline = float(np.median(widths)) if widths else 0.0
        if baseline <= 0:
            return columns

        split_columns: List[List[OCRCell]] = []

        for column, width in zip(columns, widths):
            if width <= baseline * self.config.dynamic_split_ratio or len(column) < 4:
                split_columns.append(column)
                continue

            x_values = sorted(c["_x_center"] for c in column)
            gaps = [x_values[i + 1] - x_values[i] for i in range(len(x_values) - 1)]
            if not gaps:
                split_columns.append(column)
                continue

            max_gap_idx = int(np.argmax(gaps))
            max_gap = gaps[max_gap_idx]
            if max_gap < self.config.x_tolerance_px * 1.5:
                split_columns.append(column)
                continue

            pivot = (x_values[max_gap_idx] + x_values[max_gap_idx + 1]) / 2.0
            left_group = [c for c in column if c["_x_center"] <= pivot]
            right_group = [c for c in column if c["_x_center"] > pivot]

            if left_group:
                split_columns.append(left_group)
            if right_group:
                split_columns.append(right_group)

        return split_columns

    def _find_matching_column(self, centers: List[float], x_center: float, cell_width: float) -> Optional[int]:
        """Find nearest compatible column by center distance."""

        tolerance = max(self.config.x_tolerance_px, cell_width * self.config.x_tolerance_ratio)

        best_idx: Optional[int] = None
        best_dist = float("inf")

        for idx, center in enumerate(centers):
            dist = abs(center - x_center)
            if dist <= tolerance and dist < best_dist:
                best_dist = dist
                best_idx = idx

        return best_idx

    @staticmethod
    def _normalize_cell(cell: OCRCell) -> OCRCell:
        """Normalize coordinates and text fields."""

        x = int(cell.get("x", 0))
        w = int(cell.get("w", 0))

        output = dict(cell)
        output["x"] = x
        output["y"] = int(cell.get("y", 0))
        output["w"] = w
        output["h"] = int(cell.get("h", 0))
        output["text"] = str(cell.get("text", "") or "").strip()
        output["confidence"] = float(cell.get("confidence", 0.0) or 0.0)
        output["_x_center"] = x + (w / 2.0)
        if "page_number" in cell:
            try:
                output["page_number"] = int(cell.get("page_number", 0) or 0)
            except Exception:
                output["page_number"] = cell.get("page_number")
        return output

    @staticmethod
    def _strip_internal_fields(cell: OCRCell) -> OCRCell:
        """Remove temporary fields used by clustering."""

        output = dict(cell)
        output.pop("_x_center", None)
        return output

    @staticmethod
    def _is_valid_cell(cell: OCRCell) -> bool:
        """Guardrail for malformed cells."""

        try:
            return int(cell.get("w", 0)) > 0 and int(cell.get("h", 0)) > 0
        except Exception:
            return False


def cluster_columns(cells: Sequence[OCRCell], config: Optional[ColumnClusterConfig] = None) -> List[ColumnCluster]:
    """Convenience function for dynamic column clustering."""

    return ColumnClusterer(config=config).cluster_columns(cells=cells)
