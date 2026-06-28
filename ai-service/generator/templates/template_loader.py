"""Template loading and normalization for dynamic owner-company invoice backgrounds."""

from __future__ import annotations

import base64
import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from PIL import Image

try:
    from pdf2image import convert_from_path
except Exception:  # pragma: no cover
    convert_from_path = None


_TEMPLATE_ASSET_CACHE = {}
_TEMPLATE_ASSET_CACHE_LOCK = threading.Lock()


@dataclass(frozen=True)
class TemplateAsset:
    source_path: str
    page_images: List[str]
    width_px: int
    height_px: int
    dpi: int
    is_pdf: bool


class TemplateLoader:
    """Load template from file path or DB blob and normalize to page images."""

    def __init__(self, work_dir: str, dpi: int = 200) -> None:
        self.work_dir = Path(work_dir)
        self.work_dir.mkdir(parents=True, exist_ok=True)
        self.dpi = dpi

    def load(
        self,
        local_path: Optional[str] = None,
        db_blob: Optional[bytes] = None,
        db_blob_base64: Optional[str] = None,
        blob_name: str = "owner_template",
    ) -> Optional[TemplateAsset]:
        template_path = self._materialize(local_path=local_path, db_blob=db_blob, db_blob_base64=db_blob_base64, blob_name=blob_name)
        if not template_path or not os.path.exists(template_path):
            return None

        try:
            stat = os.stat(template_path)
            cache_key = f"{template_path}|{int(stat.st_mtime)}|{stat.st_size}|{self.dpi}"
        except Exception:
            cache_key = f"{template_path}|{self.dpi}"

        with _TEMPLATE_ASSET_CACHE_LOCK:
            cached = _TEMPLATE_ASSET_CACHE.get(cache_key)
            if cached is not None:
                return cached

        ext = Path(template_path).suffix.lower()
        is_pdf = ext == ".pdf"

        if is_pdf:
            if convert_from_path is None:
                return None
            images = convert_from_path(template_path, dpi=self.dpi)
            if not images:
                return None

            page_paths: List[str] = []
            for idx, img in enumerate(images, 1):
                page_path = str(self.work_dir / f"template_page_{idx:03d}.png")
                img.save(page_path, "PNG")
                page_paths.append(page_path)
        else:
            page_paths = [template_path]

        with Image.open(page_paths[0]) as im:
            w, h = im.size

        asset = TemplateAsset(
            source_path=template_path,
            page_images=page_paths,
            width_px=w,
            height_px=h,
            dpi=self.dpi,
            is_pdf=is_pdf,
        )
        with _TEMPLATE_ASSET_CACHE_LOCK:
            _TEMPLATE_ASSET_CACHE[cache_key] = asset
        return asset

    def _materialize(
        self,
        local_path: Optional[str],
        db_blob: Optional[bytes],
        db_blob_base64: Optional[str],
        blob_name: str,
    ) -> Optional[str]:
        if local_path and os.path.exists(local_path):
            return local_path

        raw: Optional[bytes] = None
        if db_blob:
            raw = db_blob
        elif db_blob_base64:
            try:
                payload = db_blob_base64
                if db_blob_base64.startswith("data:") and ";base64," in db_blob_base64:
                    payload = db_blob_base64.split(";base64,", 1)[1]
                raw = base64.b64decode(payload, validate=False)
            except Exception:
                raw = None

        if not raw:
            return None

        ext = ".png"
        if raw.startswith(b"%PDF"):
            ext = ".pdf"
        elif raw.startswith(b"\xff\xd8\xff"):
            ext = ".jpg"
        elif raw.startswith(b"\x89PNG"):
            ext = ".png"

        out = self.work_dir / f"{blob_name}{ext}"
        out.write_bytes(raw)
        return str(out)
