"""Simple filesystem-backed cache utilities for OCR/preprocessing artifacts.

Stores pickled values keyed by SHA256 under a configurable cache directory.
"""
from __future__ import annotations

import os
import pickle
from pathlib import Path
from typing import Any, Optional


def _ensure_cache_dir(cache_dir: str) -> Path:
    p = Path(cache_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


def load_ocr_cache(cache_dir: str, hkey: str) -> Optional[Any]:
    try:
        p = _ensure_cache_dir(cache_dir) / f"{hkey}.pkl"
        if not p.exists():
            return None
        with p.open("rb") as fh:
            return pickle.load(fh)
    except Exception:
        return None


def store_ocr_cache(cache_dir: str, hkey: str, value: Any) -> bool:
    try:
        p = _ensure_cache_dir(cache_dir) / f"{hkey}.pkl"
        with p.open("wb") as fh:
            pickle.dump(value, fh)
        return True
    except Exception:
        return False
