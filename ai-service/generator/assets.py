<<<<<<< HEAD
﻿"""
=======
"""
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
generator/assets.py  –  Resolve template / signature / stamp assets.

Supports:
  - Plain file paths (checked for existence)
  - Base64 data URIs  (data:image/png;base64,…)
  - Raw base64 blobs  (PNG / JPEG / PDF auto-detected by magic bytes)
  - PDF template → converted to PNG for background use
"""

from __future__ import annotations

import base64
<<<<<<< HEAD
import hashlib
=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
import os
from typing import Optional

try:
    from pdf2image import convert_from_path as _convert
    _PDF2IMAGE_OK = True
except ImportError:
    _PDF2IMAGE_OK = False


<<<<<<< HEAD
_ASSET_PATH_CACHE = {}
_TEMPLATE_IMAGE_CACHE = {}


=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
def _find_poppler() -> Optional[str]:
    candidates = [
        r"C:\Program Files\poppler\Library\bin",
        r"C:\Program Files\poppler\bin",
    ]
    local = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages")
    if local and os.path.isdir(local):
        try:
            for name in os.listdir(local):
                if "poppler" not in name.lower():
                    continue
                for root, _dirs, files in os.walk(os.path.join(local, name)):
                    if "pdfinfo.exe" in files:
                        return root
        except Exception:
            pass
    for c in candidates:
        if os.path.exists(os.path.join(c, "pdfinfo.exe")):
            return c
    return None


def materialize_asset(value: Optional[str], out_dir: str, prefix: str) -> Optional[str]:
    """
    Resolve *value* (file path or base64 blob) into a concrete local file.
    Returns the resolved path or None.
    """
    if not value or not isinstance(value, str):
        return None
    v = value.strip()
    if not v:
        return None

<<<<<<< HEAD
    cache_key = hashlib.sha1(f"{prefix}|{v}".encode("utf-8", errors="ignore")).hexdigest()
    cached = _ASSET_PATH_CACHE.get(cache_key)
    if cached and os.path.exists(cached):
        return cached

    # Already a file on disk
    if os.path.exists(v):
        _ASSET_PATH_CACHE[cache_key] = v
=======
    # Already a file on disk
    if os.path.exists(v):
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
        return v

    # Data URI
    b64_payload = v
    ext = ".bin"
    if v.startswith("data:") and ";base64," in v:
        header, b64_payload = v.split(";base64,", 1)
        mime = header.split(":", 1)[1].lower()
        if "pdf" in mime:
            ext = ".pdf"
        elif "jpeg" in mime or "jpg" in mime:
            ext = ".jpg"
        else:
            ext = ".png"

    try:
        raw = base64.b64decode(b64_payload, validate=False)
    except Exception:
        return None

    if not raw:
        return None

    # Infer extension from magic bytes when no mime header
    if ext == ".bin":
        if raw.startswith(b"%PDF"):
            ext = ".pdf"
        elif raw.startswith(b"\x89PNG"):
            ext = ".png"
        elif raw.startswith(b"\xff\xd8\xff"):
            ext = ".jpg"
        else:
            ext = ".png"

    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{prefix}{ext}")
    try:
        with open(path, "wb") as fh:
            fh.write(raw)
<<<<<<< HEAD
        _ASSET_PATH_CACHE[cache_key] = path
=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
        return path
    except Exception:
        return None


def template_to_image(template_path: Optional[str], out_dir: str) -> Optional[str]:
    """
    Convert a PDF template (first page) to a PNG for use as background.
    Returns the PNG path or None.
    """
    if not template_path or not os.path.exists(template_path):
        return None

    ext = os.path.splitext(template_path)[1].lower()
    if ext in {".png", ".jpg", ".jpeg"}:
        return template_path

    if ext == ".pdf" and _PDF2IMAGE_OK:
        try:
<<<<<<< HEAD
            stat = os.stat(template_path)
            cache_key = f"{template_path}|{int(stat.st_mtime)}|{stat.st_size}"
            cached = _TEMPLATE_IMAGE_CACHE.get(cache_key)
            if cached and os.path.exists(cached):
                return cached
        except Exception:
            cache_key = template_path
        try:
=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
            kwargs = {"first_page": 1, "last_page": 1, "dpi": 180}
            pp = _find_poppler()
            if pp:
                kwargs["poppler_path"] = pp
            images = _convert(template_path, **kwargs)
            if not images:
                return None
            os.makedirs(out_dir, exist_ok=True)
            img_path = os.path.join(out_dir, "template_bg.png")
            images[0].save(img_path, "PNG")
<<<<<<< HEAD
            _TEMPLATE_IMAGE_CACHE[cache_key] = img_path
=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
            return img_path
        except Exception:
            return None

    return None
