"""Safe content zone detector for template-safe invoice rendering."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Tuple

from generator.templates.template_analyzer import TemplateAnalysis


@dataclass(frozen=True)
class SafeZone:
    content_top: int
    content_bottom: int
    content_left: int
    content_right: int

    def to_dict(self) -> Dict[str, int]:
        return {
            "content_top": self.content_top,
            "content_bottom": self.content_bottom,
            "content_left": self.content_left,
            "content_right": self.content_right,
        }


class SafeZoneDetector:
    """Build safe rendering bounds from template analysis while avoiding branding zones."""

    def detect(self, analysis: TemplateAnalysis, image_shape: Tuple[int, int]) -> SafeZone:
        h, w = int(image_shape[0]), int(image_shape[1])

        top = max(analysis.header_bottom + 6, int(h * 0.15))
        bottom = min(analysis.footer_top - 4, int(h * 0.92))
        left = max(analysis.content_left + 8, int(w * 0.07))
        right = min(analysis.content_right - 8, int(w * 0.93))

        # Push away from side branding if large region overlaps edge.
        for x, y, bw, bh in analysis.logo_regions:
            if x < w * 0.2 and bw > w * 0.12:
                left = max(left, x + bw + 10)
            if (x + bw) > w * 0.8 and bw > w * 0.12:
                right = min(right, x - 10)

        if bottom <= top + 180:
            top = int(h * 0.18)
            bottom = int(h * 0.90)

        if right <= left + 220:
            left = int(w * 0.1)
            right = int(w * 0.9)

        return SafeZone(
            content_top=int(top),
            content_bottom=int(bottom),
            content_left=int(left),
            content_right=int(right),
        )
