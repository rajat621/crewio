"""PDF/image to PIL image conversion for local vision extraction."""

from __future__ import annotations

from pathlib import Path
from typing import List

from PIL import Image
from pdf2image import convert_from_path

from config_runtime import CONFIG


_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def pdf_to_images(path: str) -> List[Image.Image]:
    from pipeline.page_preprocessing import preprocess_pages_for_ocr
    from pipeline.profiler import current, new_request_collector

    source = Path(path)
    max_pages = max(1, int(CONFIG.resource_limits.vision_max_pages or 1))
    dpi = int(__import__("os").getenv("VISION_IMAGE_DPI", "220") or "220")

    if source.suffix.lower() in _IMAGE_EXTENSIONS:
        with Image.open(source) as img:
            prof = current()
            with (prof or new_request_collector()).time_stage("preprocessing"):
                preprocessed = preprocess_pages_for_ocr([img.convert("RGB")], target_long_edge=2200)
            return [Image.fromarray(page.image[:, :, ::-1]).convert("RGB") if page.image.ndim == 3 else Image.fromarray(page.image).convert("RGB") for page in preprocessed]

    prof = current()
    from pipeline.profiler import new_request_collector as _newpc
    with (prof or _newpc()).time_stage("rasterization"):
        pages = convert_from_path(str(source), dpi=dpi, first_page=1, last_page=max_pages)
    with (prof or _newpc()).time_stage("preprocessing"):
        preprocessed = preprocess_pages_for_ocr(pages, target_long_edge=2200)
    return [Image.fromarray(page.image[:, :, ::-1]).convert("RGB") if page.image.ndim == 3 else Image.fromarray(page.image).convert("RGB") for page in preprocessed]
