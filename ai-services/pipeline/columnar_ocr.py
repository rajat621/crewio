from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Tuple

from pipeline.extraction_metrics import record_extraction_metric
from pipeline.ocr_box_repair import repair_ocr_box_geometry

try:
    from PIL import Image
except Exception:
    Image = None

try:
    import numpy as _np
except Exception:
    _np = None

try:
    from paddleocr import PaddleOCR as _PaddleOCR
except Exception:
    _PaddleOCR = None

try:
    from rapidocr_onnxruntime import RapidOCR as _RapidOCR
except Exception:
    _RapidOCR = None


def _call_paddle_on_image(paddle, image_np: Any) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    if paddle is None:
        return results
    raw = paddle.ocr(image_np, cls=True) or []
    for page in raw:
        for item in page or []:
            if not item or len(item) < 2:
                continue
            box = item[0]
            text = (item[1] or [""])[0]
            if not text:
                continue
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            x0, x1 = min(xs), max(xs)
            y0, y1 = min(ys), max(ys)
            results.append({"text": text, "bbox": [x0, y0, x1, y1]})
    return results


def _call_rapid_on_image(rapid, image_np: Any) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    if rapid is None:
        return results
    rapid_result, _ = rapid(image_np)
    for box, text, _score in rapid_result or []:
        if not text:
            continue
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        x0, x1 = min(xs), max(xs)
        y0, y1 = min(ys), max(ys)
        results.append({"text": text, "bbox": [x0, y0, x1, y1]})
    return results


def _vertical_projection_gaps(gray_np: Any, min_gap_px: int = 20) -> List[int]:
    # gray_np expected as 2D numpy array (0..255), count non-white pixels per column
    if _np is None:
        return []
    h, w = gray_np.shape[:2]
    mask = (gray_np < 250).astype(int)
    proj = mask.sum(axis=0)
    gaps: List[int] = []
    in_gap = False
    gap_start = 0
    for x in range(w):
        if proj[x] <= (h * 0.01):
            if not in_gap:
                in_gap = True
                gap_start = x
        else:
            if in_gap:
                gap_width = x - gap_start
                if gap_width >= min_gap_px:
                    gaps.append((gap_start + x) // 2)
                in_gap = False
    # handle trailing gap
    return gaps


def detect_column_regions(pil_image: Any, expected_separators: int = 3) -> List[Tuple[int, int]]:
    """Detect vertical column regions dynamically using projection profile.

    Returns list of (x0,x1) regions covering the page left-to-right.
    """
    if Image is None or _np is None:
        return [(0, 0)]
    img = pil_image.convert("L")
    img_np = _np.array(img)
    w = img_np.shape[1]
    gaps = _vertical_projection_gaps(img_np, max(8, w // 200))
    # convert gap positions into separators and produce regions
    separators = [0]
    separators.extend(gaps)
    separators.append(w)
    separators = sorted(set(separators))
    # Merge to produce contiguous regions
    regions: List[Tuple[int, int]] = []
    for i in range(len(separators) - 1):
        x0 = separators[i]
        x1 = separators[i + 1]
        if x1 - x0 < max(16, w // 200):
            continue
        regions.append((x0, x1))
    # If we detected too many regions, merge small ones from left
    if len(regions) > expected_separators + 2:
        # keep largest expected_separators+1 regions
        regions = sorted(regions, key=lambda r: r[1] - r[0], reverse=True)[: expected_separators + 1]
        regions = sorted(regions, key=lambda r: r[0])
    # If too few regions, split equally into 4
    if len(regions) < 2:
        step = max(1, w // 4)
        regions = [(i * step, min(w, (i + 1) * step)) for i in range(4)]
    return regions


def run_columnar_ocr(pil_image: Any, image_path: str | None = None) -> Dict[str, Any]:
    """Crop image into vertical regions, run OCR per crop, remap coordinates and detect merged tokens.

    Returns diagnostics and `tokens` list with global bbox coordinates.
    """
    diagnostics: Dict[str, Any] = {"events": [], "tokens": []}
    if Image is None or _np is None:
        diagnostics["error"] = "PIL or numpy not available"
        return diagnostics

    paddle = _PaddleOCR(use_angle_cls=True, lang="en", show_log=False) if _PaddleOCR else None
    rapid = _RapidOCR() if _RapidOCR else None

    regions = detect_column_regions(pil_image)
    diagnostics["events"].append({"event": "OCR_COLUMN_REGIONS_DETECTED", "regions": regions})

    img_w, img_h = pil_image.size
    img_np_full = _np.array(pil_image.convert("RGB"))

    all_tokens: List[Dict[str, Any]] = []
    for idx, (x0, x1) in enumerate(regions):
        crop = pil_image.crop((x0, 0, x1, img_h))
        diagnostics["events"].append({"event": "OCR_COLUMN_CROP_CREATED", "crop_index": idx, "x0": x0, "x1": x1})
        crop_np = _np.array(crop.convert("RGB"))
        # Prefer paddle first, else rapid
        tokens_for_crop: List[Dict[str, Any]] = []
        if paddle is not None:
            tokens_for_crop = _call_paddle_on_image(paddle, crop_np)
        if not tokens_for_crop and rapid is not None:
            tokens_for_crop = _call_rapid_on_image(rapid, crop_np)

        diagnostics["events"].append({"event": "OCR_COLUMN_TOKEN_COUNT", "crop_index": idx, "count": len(tokens_for_crop)})

        # Remap crop-local coords to global page coords
        for t in tokens_for_crop:
            bx0, by0, bx1, by1 = t["bbox"]
            global_bbox = [bx0 + x0, by0, bx1 + x0, by1]
            token_obj = {"text": t["text"], "bbox": global_bbox}
            all_tokens.append(token_obj)
        diagnostics["events"].append({"event": "OCR_COORDINATE_REMAP", "crop_index": idx, "mapped": len(tokens_for_crop)})

    raw_tokens = list(all_tokens)

    repair_input: List[Dict[str, Any]] = []
    for t in raw_tokens:
        bx0, by0, bx1, by1 = t["bbox"]
        repair_input.append({
            "x": int(bx0),
            "y": int(by0),
            "w": max(1, int(bx1 - bx0)),
            "h": max(1, int(by1 - by0)),
            "text": t.get("text", ""),
            "confidence": float(t.get("confidence", 0.90) or 0.90),
        })

    def _columnar_repair_event(event_name: str, payload: Dict[str, Any]) -> None:
        rec = {"event": event_name, **payload}
        # Preserve the legacy example field used by semantic_debug_dump.py.
        if "token" in payload and isinstance(payload.get("token"), dict):
            rec.setdefault("example", payload.get("token"))
        diagnostics["events"].append(rec)

    repaired_xywh, repair_debug = repair_ocr_box_geometry(
        repair_input,
        image=pil_image,
        ocr_engine=rapid,
        min_confidence=0.25,
        source="columnar_ocr",
        event_logger=_columnar_repair_event,
    )
    diagnostics["ocr_box_repair"] = repair_debug
    diagnostics["OCR_BOX_REPAIR_METRICS"] = repair_debug.get("metrics", {})
    repair_metrics = repair_debug.get("metrics", {}) if isinstance(repair_debug, dict) else {}
    record_extraction_metric(
        "OCR_REPAIR_METRICS",
        {
            "total_tokens_before": int(repair_metrics.get("total_tokens", 0) or 0),
            "total_tokens_after": int(repair_metrics.get("usable_tokens", 0) or 0),
            "oversized_tokens_before": int(repair_metrics.get("oversized_tokens", 0) or 0),
            "oversized_tokens_after": int(repair_metrics.get("oversized_tokens_after", 0) or 0),
            "reprocessed_tokens": int(repair_metrics.get("reprocessed_tokens", 0) or 0),
            "split_success_rate": float(repair_metrics.get("split_success_rate", 0.0) or 0.0),
        },
        stage="ocr_box_geometry_repair",
        extra={"source": "columnar_ocr", "image_path": image_path or ""},
    )

    all_tokens = []
    for t in repaired_xywh:
        x = int(t.get("x", 0))
        y = int(t.get("y", 0))
        w = max(1, int(t.get("w", 0)))
        h = max(1, int(t.get("h", 0)))
        all_tokens.append({
            "text": t.get("text", ""),
            "bbox": [x, y, x + w, y + h],
            "confidence": float(t.get("confidence", 0.0) or 0.0),
            "ocr_box_repair": t.get("ocr_box_repair"),
        })

    diagnostics["tokens"] = all_tokens

    # compute token heights and detect merged/oversized tokens
    heights = []
    for t in all_tokens:
        _, y0, _, y1 = t["bbox"]
        heights.append(max(1.0, float(y1 - y0)))
    if heights:
        import statistics

        median_h = statistics.median(heights)
        max_h = max(heights)
        # define normal as median of heights <= 75th percentile
        p75 = float(_np.percentile(heights, 75))
        normal_heights = [h for h in heights if h <= p75]
        normal = statistics.median(normal_heights) if normal_heights else median_h
        diagnostics["MEDIAN_TOKEN_HEIGHT"] = median_h
        diagnostics["MAX_TOKEN_HEIGHT"] = max_h
        diagnostics["normal_text_height"] = normal

        oversized_tokens: List[Dict[str, Any]] = []
        oversized_count = 0
        page_h = float(img_h)
        for t in all_tokens:
            _, y0, _, y1 = t["bbox"]
            h = max(1.0, float(y1 - y0))
            is_oversized = (h > 4.0 * median_h) or (h > page_h * 0.08)
            if is_oversized:
                oversized_count += 1
                oversized_tokens.append({
                    "text": t.get("text"),
                    "x": int(t["bbox"][0]),
                    "y": int(t["bbox"][1]),
                    "w": int(t["bbox"][2] - t["bbox"][0]),
                    "h": int(t["bbox"][3] - t["bbox"][1]),
                })

        diagnostics["OVERSIZED_TOKEN_COUNT"] = oversized_count
        diagnostics["OVERSIZED_EXAMPLES"] = oversized_tokens[:10]

        # Emit events per token: decide reject vs split-required
        split_re = re.compile(r"\s{2,}|\d{4,}|\.\d+\.\d+")
        for ex in oversized_tokens[:50]:
            ttext = ex.get("text") if isinstance(ex.get("text"), str) else ""
            if len(ttext) > 40 or split_re.search(ttext or ""):
                diagnostics["events"].append({"event": "OCR_BOX_SPLIT_REQUIRED", "example": ex})
            else:
                diagnostics["events"].append({"event": "OCR_BOX_REJECTED", "example": ex})

        # If oversized tokens exceed 20% of tokens, declare oversized layout and skip semantic reconstruction
        if float(oversized_count) / max(1.0, float(len(all_tokens))) > 0.2:
            diagnostics["events"].append({"event": "OVERSIZED_OCR_LAYOUT_DETECTED", "oversized_count": oversized_count, "total_tokens": len(all_tokens)})

        # detect merged tokens via regex as before
        merged_samples = []
        merged_re = re.compile(r"(\d+\.){3,}|[A-Z]{6,}|\w{30,}")
        for t in all_tokens:
            _, y0, _, y1 = t["bbox"]
            h = max(1.0, float(y1 - y0))
            text = t["text"]
            if h > 2.0 * normal or merged_re.search(text):
                merged_samples.append(text)
        diagnostics["merged_token_samples"] = merged_samples
        if merged_samples:
            diagnostics["events"].append({"event": "OCR_MERGED_TOKEN_DETECTED", "examples": merged_samples[:10]})

        # If unreliable and input looked like a PDF image (caller may pass image_path)
        if float(median_h) > (2.0 * float(normal)) and image_path and image_path.lower().endswith(".pdf"):
            diagnostics["events"].append({"event": "OCR_MARKED_UNRELIABLE", "reason": "median_height_gt_2x_normal"})
            diagnostics["events"].append({"event": "OCR_TRIGGER_VISION_EXTRACTOR", "provider": "gemini"})

    # Investigate OCR engine configuration (PaddleOCR)
    try:
        import inspect
        if _PaddleOCR is not None:
            sig = inspect.signature(_PaddleOCR)
            diagnostics["OCR_ENGINE_SIGNATURE"] = str(sig)
            # heuristic: if PaddleOCR class doc or name contains rec/cls hints
            diagnostics["OCR_ENGINE_TYPE"] = _PaddleOCR.__name__
            diagnostics["events"].append({"event": "OCR_ENGINE_SIGNATURE", "signature": str(sig), "type": _PaddleOCR.__name__})
    except Exception:
        pass

    return diagnostics
