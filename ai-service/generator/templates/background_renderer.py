"""Background renderer preserving owner branding across pages."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from generator.templates.template_loader import TemplateAsset


@dataclass(frozen=True)
class RenderedPageBackground:
    page_index: int
    image_path: Optional[str]


class BackgroundRenderer:
    """Render template backgrounds for one or multiple pages."""

    def __init__(self, page_size=A4) -> None:
        self.page_width, self.page_height = page_size

    def draw_background(self, c: canvas.Canvas, asset: Optional[TemplateAsset], page_index: int) -> RenderedPageBackground:
        if not asset or not asset.page_images:
            return RenderedPageBackground(page_index=page_index, image_path=None)

        src = asset.page_images[min(page_index, len(asset.page_images) - 1)]

        c.drawImage(
            src,
            0,
            0,
            width=self.page_width,
            height=self.page_height,
            preserveAspectRatio=False,
            mask="auto",
        )

        return RenderedPageBackground(page_index=page_index, image_path=src)
