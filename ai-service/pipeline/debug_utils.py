"""Debug export helpers for table extraction pipeline."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Sequence
import logging

import cv2
import numpy as np


class DebugExporter:
    """Persist debug artifacts for OCR/table processing."""

    def __init__(self, enabled: bool, output_dir: str | None) -> None:
        self.enabled = bool(enabled and output_dir)
        self.base_dir = Path(output_dir) if output_dir else None
        if self.enabled and self.base_dir:
            self.base_dir.mkdir(parents=True, exist_ok=True)

    def image(self, name: str, image: np.ndarray) -> None:
        if not self.enabled or self.base_dir is None:
            return
        out_path = self.base_dir / f"{name}.png"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(out_path), image)

    def json(self, name: str, payload: Any) -> None:
        if not self.enabled or self.base_dir is None:
            return
        out_path = self.base_dir / f"{name}.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, ensure_ascii=False)

    def table_preview(self, name: str, image: np.ndarray, row_bounds: Sequence[int], col_bounds: Sequence[int]) -> None:
        if not self.enabled or self.base_dir is None:
            return

        canvas = image.copy()
        if len(canvas.shape) == 2:
            canvas = cv2.cvtColor(canvas, cv2.COLOR_GRAY2BGR)

        h, w = canvas.shape[:2]
        for y in row_bounds:
            yy = int(max(0, min(y, h - 1)))
            cv2.line(canvas, (0, yy), (w - 1, yy), (0, 255, 0), 1)

        for x in col_bounds:
            xx = int(max(0, min(x, w - 1)))
            cv2.line(canvas, (xx, 0), (xx, h - 1), (255, 0, 0), 1)

        self.image(name, canvas)

    def ocr_overlay(self, name: str, image: np.ndarray, cells: Sequence[Dict[str, Any]]) -> None:
        if not self.enabled or self.base_dir is None:
            return

        canvas = image.copy()
        if len(canvas.shape) == 2:
            canvas = cv2.cvtColor(canvas, cv2.COLOR_GRAY2BGR)

        for cell in cells:
            x = int(cell.get("x", 0))
            y = int(cell.get("y", 0))
            w = int(cell.get("w", 0))
            h = int(cell.get("h", 0))
            txt = str(cell.get("text", ""))

            cv2.rectangle(canvas, (x, y), (x + w, y + h), (0, 165, 255), 1)
            if txt:
                cv2.putText(canvas, txt[:24], (x, max(0, y - 3)), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 0), 1)

        self.image(name, canvas)


class NoOpDebug:
    """No-op debug shim used when debug is disabled or missing.

    Methods mirror DebugExporter but do nothing. Keeps `enabled` and
    `base_dir` attributes for callers that check them.
    """

    enabled: bool = False
    base_dir = None

    def image(self, *args, **kwargs) -> None:
        return None

    def json(self, *args, **kwargs) -> None:
        return None

    def text(self, *args, **kwargs) -> None:
        return None

    def save(self, *args, **kwargs) -> None:
        return None

    def table_preview(self, *args, **kwargs) -> None:
        return None

    def ocr_overlay(self, *args, **kwargs) -> None:
        return None


def ensure_debug(debug_obj: Any) -> Any:
    """Return a valid debug object. If `debug_obj` is falsy, return a NoOpDebug.

    Also emits a small log/profiler entry indicating debug mode state.
    """
    logger = logging.getLogger(__name__)
    # Avoid importing profiler at module import time to reduce coupling.
    try:
        if debug_obj:
            logger.info("Debug mode enabled")
            try:
                from pipeline.profiler import current

                prof = current()
                if prof:
                    prof.set_meta("debug_mode", True)
            except Exception:
                pass
            return debug_obj
    except Exception:
        # defensive: fallthrough to null debug
        pass

    logger.info("Debug mode disabled — using NoOpDebug shim")
    try:
        from pipeline.profiler import current

        prof = current()
        if prof:
            prof.set_meta("debug_mode", False)
    except Exception:
        pass
    return NoOpDebug()
