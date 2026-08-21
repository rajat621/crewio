from __future__ import annotations

import json
import math
import os
import statistics
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

try:
    import cv2
except Exception:  # pragma: no cover - optional at import time
    cv2 = None

try:
    import numpy as np
except Exception:  # pragma: no cover - optional at import time
    np = None


OCRToken = Dict[str, Any]
EventLogger = Callable[[str, Dict[str, Any]], None]


REPAIR_DEBUG_PATH = Path("temp") / "ocr_box_repair_debug.json"


def _clean_text(value: Any) -> str:
    return " ".join(str(value or "").split())


def _token_box(token: OCRToken) -> Tuple[int, int, int, int]:
    x = int(float(token.get("x", 0) or 0))
    y = int(float(token.get("y", 0) or 0))
    w = int(float(token.get("w", token.get("width", 0)) or 0))
    h = int(float(token.get("h", token.get("height", 0)) or 0))
    return x, y, w, h


def _normalize_token(token: OCRToken) -> OCRToken:
    x, y, w, h = _token_box(token)
    out = dict(token)
    out["x"] = x
    out["y"] = y
    out["w"] = max(1, w)
    out["h"] = max(1, h)
    out["text"] = _clean_text(out.get("text"))
    try:
        out["confidence"] = float(out.get("confidence", 0.0) or 0.0)
    except Exception:
        out["confidence"] = 0.0
    return out


def _image_size(image: Any) -> Tuple[int, int]:
    if image is None:
        return 0, 0
    if hasattr(image, "size") and not hasattr(image, "shape"):
        try:
            w, h = image.size
            return int(w), int(h)
        except Exception:
            return 0, 0
    if hasattr(image, "shape"):
        try:
            h, w = image.shape[:2]
            return int(w), int(h)
        except Exception:
            return 0, 0
    return 0, 0


def _median_height(tokens: Sequence[OCRToken]) -> float:
    heights = [float(_token_box(t)[3]) for t in tokens if _token_box(t)[3] > 0 and _clean_text(t.get("text"))]
    return float(statistics.median(heights)) if heights else 0.0


def _target_child_height(tokens: Sequence[OCRToken], median_height: float, image_height: int) -> int:
    heights = sorted(float(_token_box(t)[3]) for t in tokens if _token_box(t)[3] > 0)
    small_heights = [h for h in heights if median_height <= 0 or h <= median_height * 2.5]
    if small_heights:
        base = statistics.median(small_heights)
    elif median_height > 0:
        base = median_height
    elif image_height > 0:
        base = image_height * 0.018
    else:
        base = 24.0
    if image_height > 0:
        base = min(base, image_height * 0.025)
    return int(max(8, min(58, round(base))))


def _is_oversized(token: OCRToken, median_height: float, image_height: int) -> bool:
    _x, _y, _w, h = _token_box(token)
    if h <= 0:
        return False
    by_median = bool(median_height > 0 and h > (median_height * 2.5))
    by_page = bool(image_height > 0 and h > (float(image_height) * 0.08))
    return by_median or by_page


def _event_payload(token: OCRToken, *, reason: str = "") -> Dict[str, Any]:
    x, y, w, h = _token_box(token)
    payload = {
        "text": _clean_text(token.get("text"))[:160],
        "x": x,
        "y": y,
        "w": w,
        "h": h,
    }
    if reason:
        payload["reason"] = reason
    return payload


def _emit(events: List[Dict[str, Any]], logger: Optional[EventLogger], event: str, **payload: Any) -> None:
    rec = {"event": event, **payload}
    events.append(rec)
    if logger is not None:
        try:
            logger(event, payload)
        except Exception:
            pass


def _crop_image(image: Any, token: OCRToken, pad: int = 4) -> Tuple[Any, Tuple[int, int]]:
    if image is None:
        return None, (0, 0)
    img_w, img_h = _image_size(image)
    x, y, w, h = _token_box(token)
    x0 = max(0, x - pad)
    y0 = max(0, y - pad)
    x1 = min(img_w, x + w + pad) if img_w else x + w + pad
    y1 = min(img_h, y + h + pad) if img_h else y + h + pad
    if x1 <= x0 or y1 <= y0:
        return None, (0, 0)
    try:
        if hasattr(image, "crop") and not hasattr(image, "shape"):
            return image.crop((x0, y0, x1, y1)), (x0, y0)
        return image[y0:y1, x0:x1], (x0, y0)
    except Exception:
        return None, (0, 0)


def _parse_ocr_result(result: Any, offset: Tuple[int, int], min_confidence: float) -> List[OCRToken]:
    parsed: List[OCRToken] = []
    if not result:
        return parsed

    # RapidOCR returns (result, elapsed); Paddle-like wrappers may return only result.
    raw = result[0] if isinstance(result, tuple) and len(result) >= 1 else result
    if not raw:
        return parsed

    ox, oy = offset
    for item in raw or []:
        try:
            box_pts, text, score = item[0], item[1], float(item[2] or 0.0)
        except Exception:
            continue
        if not _clean_text(text) or score < min_confidence:
            continue
        try:
            xs = [int(float(p[0])) for p in box_pts]
            ys = [int(float(p[1])) for p in box_pts]
        except Exception:
            continue
        x0, y0 = min(xs), min(ys)
        x1, y1 = max(xs), max(ys)
        parsed.append({
            "x": int(x0 + ox),
            "y": int(y0 + oy),
            "w": max(1, int(x1 - x0)),
            "h": max(1, int(y1 - y0)),
            "text": _clean_text(text),
            "confidence": score,
            "ocr_box_repair": "reprocessed",
        })
    return parsed


def _rerun_ocr_on_region(
    image: Any,
    token: OCRToken,
    ocr_engine: Any,
    *,
    min_confidence: float,
) -> List[OCRToken]:
    if ocr_engine is None:
        return []
    crop, offset = _crop_image(image, token)
    if crop is None:
        return []
    if np is not None and not hasattr(crop, "shape"):
        try:
            crop = np.array(crop)
        except Exception:
            pass
    try:
        result = ocr_engine(crop)
    except Exception:
        return []
    return _parse_ocr_result(result, offset, min_confidence)


def _split_token_heuristically(token: OCRToken, child_height: int) -> List[OCRToken]:
    text = _clean_text(token.get("text"))
    if not text:
        return []
    parts = text.split()
    if len(parts) < 2:
        return []

    x, y, w, h = _token_box(token)
    if w <= 0 or h <= 0:
        return []

    # Prefer horizontal word boxes because downstream row clustering expects word-level geometry.
    total_chars = sum(max(1, len(p)) for p in parts)
    gap = max(2, min(10, int(round(w * 0.012))))
    available_w = max(len(parts), w - (gap * (len(parts) - 1)))
    cursor = float(x)
    center_y = float(y) + (float(h) / 2.0)
    child_y = int(round(center_y - (float(child_height) / 2.0)))
    child_y = max(y, min(child_y, max(y, y + h - child_height)))

    children: List[OCRToken] = []
    for idx, part in enumerate(parts):
        if idx == len(parts) - 1:
            child_w = max(1, int(round((x + w) - cursor)))
        else:
            child_w = max(1, int(round(available_w * (max(1, len(part)) / max(1, total_chars)))))
        child = {
            "x": int(round(cursor)),
            "y": child_y,
            "w": child_w,
            "h": int(child_height),
            "text": part,
            "confidence": float(token.get("confidence", 0.0) or 0.0),
            "ocr_box_repair": "split",
        }
        children.append(child)
        cursor += child_w + gap

    return children


def _write_debug_file(payload: Dict[str, Any], path: Path = REPAIR_DEBUG_PATH) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        existing: Dict[str, Any] = {"runs": []}
        if path.exists():
            try:
                existing = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(existing, dict):
                    existing = {"runs": []}
            except Exception:
                existing = {"runs": []}
        runs = existing.setdefault("runs", [])
        if isinstance(runs, list):
            runs.append(payload)
            # Keep file bounded but preserve latest diagnostics.
            del runs[:-25]
        existing["latest"] = payload
        path.write_text(json.dumps(existing, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    except Exception:
        pass


def repair_ocr_box_geometry(
    tokens: Sequence[OCRToken],
    *,
    image: Any = None,
    image_height: Optional[int] = None,
    image_width: Optional[int] = None,
    ocr_engine: Any = None,
    min_confidence: float = 0.25,
    source: str = "ocr",
    page_index: Optional[int] = None,
    event_logger: Optional[EventLogger] = None,
    debug_path: Path = REPAIR_DEBUG_PATH,
) -> Tuple[List[OCRToken], Dict[str, Any]]:
    """Repair OCR geometry before existing row clustering/semantic assembly.

    Oversized boxes are never copied to the returned token list. Each oversized
    token is either replaced with tighter OCR children, replaced with heuristic
    word boxes, or marked unreliable and excluded.
    """

    normalized = [_normalize_token(t) for t in tokens if _clean_text(t.get("text"))]
    img_w, img_h = _image_size(image)
    if image_height is None:
        image_height = img_h
    if image_width is None:
        image_width = img_w
    image_height = int(image_height or 0)
    image_width = int(image_width or 0)

    median_h = _median_height(normalized)
    child_h = _target_child_height(normalized, median_h, image_height)
    events: List[Dict[str, Any]] = []
    repaired: List[OCRToken] = []
    oversized_originals: List[OCRToken] = []
    reprocessed_tokens = 0
    split_successes = 0
    split_attempts = 0
    unreliable_count = 0

    for token in normalized:
        if not _is_oversized(token, median_h, image_height):
            repaired.append(token)
            continue

        oversized_originals.append(token)
        _emit(events, event_logger, "OCR_BOX_REJECTED", token=_event_payload(token, reason="oversized_geometry"))

        accepted_children: List[OCRToken] = []
        reocr_children = _rerun_ocr_on_region(image, token, ocr_engine, min_confidence=min_confidence)
        if reocr_children:
            accepted_children = [
                _normalize_token(child)
                for child in reocr_children
                if _clean_text(child.get("text")) and not _is_oversized(_normalize_token(child), median_h or child_h, image_height)
            ]
            if accepted_children:
                reprocessed_tokens += len(accepted_children)
                _emit(
                    events,
                    event_logger,
                    "OCR_BOX_REPROCESSED",
                    token=_event_payload(token),
                    children=len(accepted_children),
                )
                repaired.extend(accepted_children)
                continue

        _emit(events, event_logger, "OCR_BOX_SPLIT_REQUIRED", token=_event_payload(token))
        split_attempts += 1
        split_children = _split_token_heuristically(token, child_h)
        split_children = [
            _normalize_token(child)
            for child in split_children
            if _clean_text(child.get("text")) and not _is_oversized(_normalize_token(child), median_h or child_h, image_height)
        ]
        if split_children:
            split_successes += 1
            _emit(
                events,
                event_logger,
                "OCR_BOX_SPLIT_SUCCESS",
                token=_event_payload(token),
                children=len(split_children),
            )
            repaired.extend(split_children)
            continue

        _emit(events, event_logger, "OCR_BOX_SPLIT_FAILED", token=_event_payload(token), reason="no_valid_child_boxes")
        unreliable = dict(token)
        unreliable["ocr_box_repair"] = "unreliable_excluded"
        unreliable["unreliable"] = True
        unreliable_count += 1
        _emit(events, event_logger, "OCR_MARKED_UNRELIABLE", token=_event_payload(unreliable), reason="oversized_unsplittable")

    repaired.sort(key=lambda item: (float(item.get("y", 0)), float(item.get("x", 0))))

    final_median = _median_height(repaired)
    final_oversized = sum(1 for t in repaired if _is_oversized(t, final_median or median_h, image_height))
    metrics = {
        "total_tokens": len(normalized),
        "usable_tokens": len(repaired),
        "oversized_tokens": len(oversized_originals),
        "reprocessed_tokens": int(reprocessed_tokens),
        "split_success_rate": float(split_successes / split_attempts) if split_attempts else 0.0,
        "median_token_height_before": float(median_h or 0.0),
        "median_token_height_after": float(final_median or 0.0),
        "oversized_tokens_after": int(final_oversized),
        "unreliable_tokens": int(unreliable_count),
    }

    payload = {
        "source": source,
        "page_index": page_index,
        "image_width": image_width,
        "image_height": image_height,
        "thresholds": {
            "median_multiplier": 2.5,
            "image_height_ratio": 0.08,
            "child_height_px": child_h,
        },
        "metrics": metrics,
        "events": events,
        "oversized_examples": [_event_payload(t) for t in oversized_originals[:25]],
    }
    _write_debug_file(payload, debug_path)
    return repaired, payload
