from __future__ import annotations

from typing import Any, List, Tuple

try:
    import numpy as _np
except ImportError:
    _np = None

try:
    from paddleocr import PaddleOCR as _PaddleOCR
except ImportError:
    _PaddleOCR = None

try:
    from rapidocr_onnxruntime import RapidOCR as _RapidOCR
except ImportError:
    _RapidOCR = None


class PaddleRapidOCRProvider:
    def __init__(self) -> None:
        self.paddle = _PaddleOCR(use_angle_cls=True, lang="en", show_log=False) if _PaddleOCR else None
        self.rapid = _RapidOCR() if _RapidOCR else None
        try:
            from pipeline.profiler import current
            prof = current()
            if self.rapid is not None and prof:
                prof.incr("rapid_model_init", 1)
        except Exception:
            pass

    def available(self) -> bool:
        return self.paddle is not None or self.rapid is not None

    def image_tokens(self, image_obj: Any) -> List[Tuple[float, float, str]]:
        if _np is None:
            return []

        image_np = _np.array(image_obj)
        tokens: List[Tuple[float, float, str]] = []

        if self.paddle is not None:
            paddle_result = self.paddle.ocr(image_np, cls=True) or []
            for page in paddle_result:
                for item in page or []:
                    if not item or len(item) < 2:
                        continue
                    box = item[0]
                    text = (item[1] or [""])[0]
                    if not text:
                        continue
                    y = sum(point[1] for point in box) / 4
                    x = sum(point[0] for point in box) / 4
                    tokens.append((y, x, text))

        if not tokens and self.rapid is not None:
            rapid_result, _ = self.rapid(image_np)
            for box, text, _score in rapid_result or []:
                if not text:
                    continue
                y = sum(point[1] for point in box) / 4
                x = sum(point[0] for point in box) / 4
                tokens.append((y, x, text))

        return tokens
