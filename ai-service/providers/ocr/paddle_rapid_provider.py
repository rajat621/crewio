from __future__ import annotations

from typing import Any, Dict, List

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

    def image_tokens(self, image_obj: Any, page_number: int = 1) -> List[Dict[str, Any]]:
        if _np is None:
            return []

        image_np = _np.array(image_obj)
        tokens: List[Dict[str, Any]] = []

        def _append_token(box: Any, text: Any, score: Any) -> None:
            if not text:
                return
            xs = [int(point[0]) for point in box]
            ys = [int(point[1]) for point in box]
            left = min(xs)
            top = min(ys)
            right = max(xs)
            bottom = max(ys)
            tokens.append(
                {
                    "text": str(text).strip(),
                    "x": int(left),
                    "y": int(top),
                    "w": int(max(0, right - left)),
                    "h": int(max(0, bottom - top)),
                    "confidence": float(score or 0.0),
                    "page_number": int(page_number),
                }
            )

        if self.paddle is not None:
            paddle_result = self.paddle.ocr(image_np, cls=True) or []
            for page in paddle_result:
                for item in page or []:
                    if not item or len(item) < 2:
                        continue
                    box = item[0]
                    text = (item[1] or [""])[0]
                    score = item[1][1] if isinstance(item[1], (list, tuple)) and len(item[1]) > 1 else 0.0
                    _append_token(box, text, score)

        if not tokens and self.rapid is not None:
            rapid_result, _ = self.rapid(image_np)
            for box, text, _score in rapid_result or []:
                _append_token(box, text, _score)

        return tokens
