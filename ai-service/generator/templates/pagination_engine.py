"""Pagination engine for multi-page invoice tables with repeated headers and carry-forward."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Sequence


@dataclass(frozen=True)
class PageChunk:
    page_number: int
    rows: List[Dict[str, Any]]
    carry_forward_amount: float


class PaginationEngine:
    """Split normalized rows into page chunks using available safe-zone height."""

    def paginate(
        self,
        rows: Sequence[Dict[str, Any]],
        safe_zone: Dict[str, int],
        row_height_px: int = 22,
        header_height_px: int = 30,
        reserved_bottom_px: int = 120,
    ) -> List[PageChunk]:
        content_height = max(0, safe_zone["content_top"] - safe_zone["content_bottom"])
        table_capacity_height = max(80, content_height - reserved_bottom_px)
        max_rows = max(4, (table_capacity_height - header_height_px) // row_height_px)

        chunks: List[PageChunk] = []
        carry = 0.0
        page = 1

        for start in range(0, len(rows), max_rows):
            slice_rows = list(rows[start : start + max_rows])
            chunks.append(PageChunk(page_number=page, rows=slice_rows, carry_forward_amount=round(carry, 2)))
            carry += sum(float(r.get("amount", 0.0) or 0.0) for r in slice_rows)
            page += 1

        if not chunks:
            chunks.append(PageChunk(page_number=1, rows=[], carry_forward_amount=0.0))

        return chunks
