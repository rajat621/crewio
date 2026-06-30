"""Dynamic content positioning with collision-avoidance in safe area."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class ContentPositions:
    client_block_y: float
    invoice_title_y: float
    table_top_y: float
    totals_start_y: float
    signature_block_y: float


class ContentPositioner:
    """Compute adaptive Y positions to avoid template collisions and footer overlap."""

    def compute(self, safe_zone: Dict[str, int], page_height_pts: float, rows_on_page: int, row_height_pts: float) -> ContentPositions:
        top = float(safe_zone["content_top"])
        bottom = float(safe_zone["content_bottom"])

        invoice_title_y = top - 14
        client_block_y = invoice_title_y - 18
        table_top_y = client_block_y - 58

        table_height = rows_on_page * row_height_pts
        totals_start_y = table_top_y - table_height - 24

        signature_block_y = max(bottom + 24, totals_start_y - 72)

        if signature_block_y < bottom + 12:
            signature_block_y = bottom + 12

        return ContentPositions(
            client_block_y=client_block_y,
            invoice_title_y=invoice_title_y,
            table_top_y=table_top_y,
            totals_start_y=totals_start_y,
            signature_block_y=signature_block_y,
        )
