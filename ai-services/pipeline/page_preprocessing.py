"""Reusable page preprocessing helpers for OCR and vision extraction."""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np
from pipeline.profiler import current


BBox = Tuple[int, int, int, int]


@dataclass
class PagePreprocessResult:
    image: np.ndarray
    orientation_deg: int = 0
    deskew_deg: float = 0.0
    content_bbox: Optional[BBox] = None
    timings_ms: Dict[str, int] = field(default_factory=dict)
    skipped_steps: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


def _now_ms(started: float) -> int:
    return int((time.time() - started) * 1000)


def _ensure_bgr(image: Any) -> np.ndarray:
    if isinstance(image, np.ndarray):
        if image.ndim == 2:
            return cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        if image.shape[2] == 4:
            return cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
        return image.copy()

    if hasattr(image, "convert"):
        pil = image.convert("RGB")
        return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

    raise TypeError(f"Unsupported image type: {type(image)!r}")


def _to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return image
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def _rotate_right_angle(image: np.ndarray, angle_deg: int) -> np.ndarray:
    angle = int(angle_deg) % 360
    if angle == 90:
        return cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
    if angle == 180:
        return cv2.rotate(image, cv2.ROTATE_180)
    if angle == 270:
        return cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return image.copy()


def _rotate_arbitrary(image: np.ndarray, angle_deg: float) -> np.ndarray:
    if abs(float(angle_deg)) < 0.05:
        return image.copy()

    h, w = image.shape[:2]
    center = (w // 2, h // 2)
    matrix = cv2.getRotationMatrix2D(center, float(angle_deg), 1.0)
    return cv2.warpAffine(
        image,
        matrix,
        (w, h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )


def _content_mask(gray: np.ndarray) -> np.ndarray:
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    if cv2.countNonZero(binary) < max(32, int(gray.size * 0.001)):
        return cv2.adaptiveThreshold(
            blurred,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            31,
            15,
        )
    return binary


def detect_content_region(image: Any, pad_px: int = 14, min_area_ratio: float = 0.001) -> Optional[BBox]:
    bgr = _ensure_bgr(image)
    gray = _to_gray(bgr)
    mask = _content_mask(gray)

    row_profile = mask.sum(axis=1).astype(np.float32)
    col_profile = mask.sum(axis=0).astype(np.float32)

    if not np.any(row_profile) or not np.any(col_profile):
        return None

    row_threshold = max(float(row_profile.max()) * 0.02, float(row_profile.mean()) * 1.3, 255.0)
    col_threshold = max(float(col_profile.max()) * 0.02, float(col_profile.mean()) * 1.3, 255.0)

    active_rows = np.where(row_profile >= row_threshold)[0]
    active_cols = np.where(col_profile >= col_threshold)[0]

    if active_rows.size == 0 or active_cols.size == 0:
        non_zero = cv2.findNonZero(mask)
        if non_zero is None:
            return None
        x, y, w, h = cv2.boundingRect(non_zero)
    else:
        y0 = int(active_rows[0])
        y1 = int(active_rows[-1]) + 1
        x0 = int(active_cols[0])
        x1 = int(active_cols[-1]) + 1
        x, y, w, h = x0, y0, x1 - x0, y1 - y0

    if w <= 0 or h <= 0:
        return None

    image_h, image_w = gray.shape[:2]
    if (w * h) < (image_h * image_w * float(min_area_ratio)):
        return None

    pad = max(int(pad_px), int(min(image_h, image_w) * 0.02))
    x0 = max(0, x - pad)
    y0 = max(0, y - pad)
    x1 = min(image_w, x + w + pad)
    y1 = min(image_h, y + h + pad)

    return x0, y0, max(0, x1 - x0), max(0, y1 - y0)


def remove_white_margins(image: Any, pad_px: int = 14) -> Tuple[np.ndarray, Optional[BBox], Dict[str, Any]]:
    started = time.time()
    bgr = _ensure_bgr(image)
    bbox = detect_content_region(bgr, pad_px=pad_px)
    if bbox is None:
        return bgr, None, {"margin_removed": False, "timing_ms": _now_ms(started)}

    x, y, w, h = bbox
    cropped = bgr[y : y + h, x : x + w]
    return cropped, bbox, {"margin_removed": True, "timing_ms": _now_ms(started)}


def _orientation_score(image: np.ndarray) -> float:
    gray = _to_gray(image)
    mask = _content_mask(gray)

    row_profile = mask.sum(axis=1).astype(np.float32)
    col_profile = mask.sum(axis=0).astype(np.float32)

    row_std = float(np.std(row_profile) / max(float(np.mean(row_profile)) + 1.0, 1.0))
    col_std = float(np.std(col_profile) / max(float(np.mean(col_profile)) + 1.0, 1.0))

    top = float(mask[: max(1, mask.shape[0] // 3), :].sum())
    bottom = float(mask[-max(1, mask.shape[0] // 3) :, :].sum())
    balance = (top - bottom) / max(top + bottom, 1.0)

    line_score = 0.0
    edges = cv2.Canny(mask, 50, 150)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=70,
        minLineLength=max(gray.shape[1] // 10, 40),
        maxLineGap=18,
    )
    if lines is not None:
        horizontal = 0.0
        vertical = 0.0
        for raw in lines:
            x1, y1, x2, y2 = raw[0]
            dx = x2 - x1
            dy = y2 - y1
            if dx == 0 and dy == 0:
                continue
            length = float(math.hypot(dx, dy))
            angle = abs(math.degrees(math.atan2(dy, dx))) % 180.0
            if angle <= 20.0 or angle >= 160.0:
                horizontal += length
            elif 70.0 <= angle <= 110.0:
                vertical += length
        line_score = (horizontal - vertical) / max(horizontal + vertical, 1.0)

    return (1.6 * line_score) + (0.8 * row_std) + (0.35 * col_std) + (0.2 * balance)


def detect_page_orientation(image: Any, max_dim: int = 1400) -> Dict[str, Any]:
    bgr = _ensure_bgr(image)
    gray = _to_gray(bgr)

    h, w = gray.shape[:2]
    scale = 1.0
    longest = max(h, w)
    if longest > max_dim:
        scale = float(max_dim) / float(longest)
        gray = cv2.resize(gray, (max(1, int(round(w * scale))), max(1, int(round(h * scale)))), interpolation=cv2.INTER_AREA)

    content = detect_content_region(gray, pad_px=10) or (0, 0, gray.shape[1], gray.shape[0])
    x, y, cw, ch = content
    sample = gray[y : y + ch, x : x + cw]

    scores: Dict[int, float] = {}
    for angle in (0, 90, 180, 270):
        rotated = _rotate_right_angle(sample, angle)
        scores[angle] = _orientation_score(rotated)

    best_angle = max(scores, key=scores.get)
    sorted_scores = sorted(scores.values(), reverse=True)
    confidence = 0.0
    if len(sorted_scores) >= 2:
        confidence = max(0.0, sorted_scores[0] - sorted_scores[1])

    return {
        "angle": int(best_angle),
        "confidence": round(float(confidence), 4),
        "scores": {str(k): round(float(v), 4) for k, v in scores.items()},
        "sample_shape": [int(sample.shape[0]), int(sample.shape[1])],
        "downscale_factor": round(float(scale), 4),
    }


def auto_rotate_page(image: Any, orientation: Optional[Dict[str, Any]] = None) -> Tuple[np.ndarray, Dict[str, Any]]:
    bgr = _ensure_bgr(image)
    info = dict(orientation or detect_page_orientation(bgr))
    angle = int(info.get("angle", 0) or 0) % 360
    rotated = _rotate_right_angle(bgr, angle)
    info["applied"] = angle in {90, 180, 270}
    info["rotation_deg"] = angle
    return rotated, info


def deskew_page(image: Any, max_angle_deg: float = 8.0) -> Tuple[np.ndarray, Dict[str, Any]]:
    bgr = _ensure_bgr(image)
    gray = _to_gray(bgr)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (3, 3), 0), 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=80,
        minLineLength=max(gray.shape[1] // 8, 50),
        maxLineGap=20,
    )

    angles: List[float] = []
    if lines is not None:
        for raw in lines:
            x1, y1, x2, y2 = raw[0]
            dx = x2 - x1
            dy = y2 - y1
            if dx == 0:
                continue
            angle = math.degrees(math.atan2(dy, dx))
            if abs(angle) <= float(max_angle_deg):
                angles.append(angle)

    if not angles:
        mask = _content_mask(gray)
        coords = cv2.findNonZero(mask)
        if coords is not None and len(coords) > 20:
            rect = cv2.minAreaRect(coords)
            angle = float(rect[-1])
            if angle < -45.0:
                angle = 90.0 + angle
            elif angle > 45.0:
                angle = angle - 90.0
            if abs(angle) <= float(max_angle_deg):
                angles.append(angle)

    if not angles:
        return bgr, {"deskew_deg": 0.0, "applied": False}

    median_angle = float(np.median(angles))
    if abs(median_angle) < 0.2:
        return bgr, {"deskew_deg": round(median_angle, 4), "applied": False}

    rotated = _rotate_arbitrary(bgr, median_angle)
    return rotated, {"deskew_deg": round(median_angle, 4), "applied": True}


def upscale_for_ocr(image: Any, min_long_edge: int = 2200) -> Tuple[np.ndarray, Dict[str, Any]]:
    bgr = _ensure_bgr(image)
    h, w = bgr.shape[:2]
    long_edge = max(h, w)
    if long_edge <= 0 or long_edge >= int(min_long_edge):
        return bgr, {"upscaled": False, "scale": 1.0}

    scale = float(min_long_edge) / float(long_edge)
    resized = cv2.resize(
        bgr,
        (max(1, int(round(w * scale))), max(1, int(round(h * scale)))),
        interpolation=cv2.INTER_CUBIC,
    )
    return resized, {"upscaled": True, "scale": round(scale, 4)}


def preprocess_page_for_ocr(
    image: Any,
    *,
    target_long_edge: int = 2200,
    margin_pad_px: int = 14,
    max_orientation_dim: int = 1400,
    max_deskew_angle_deg: float = 8.0,
) -> PagePreprocessResult:
    started = time.time()
    warnings: List[str] = []
    skipped_steps: List[str] = []
    timings: Dict[str, int] = {}

    try:
        base = _ensure_bgr(image)
    except Exception as exc:
        raise RuntimeError(f"PAGE_PREPROCESS_INPUT_INVALID:{exc}") from exc

    try:
        margin_started = time.time()
        # time and record per-step timings to profiler when enabled
        from pipeline.profiler import current
        prof = current()
        if prof:
            prof.start("margin_removal")
        cropped, bbox, margin_meta = remove_white_margins(base, pad_px=margin_pad_px)
        if prof:
            prof.stop("margin_removal")
        timings["margin_removal_ms"] = int(margin_meta.get("timing_ms", 0) or _now_ms(margin_started))
    except Exception as exc:
        cropped = base
        bbox = None
        warnings.append(f"margin_removal_failed:{exc}")
        skipped_steps.append("margin_removal")
        timings["margin_removal_ms"] = 0

    try:
        orientation_started = time.time()
        if prof:
            prof.start("orientation_detection")
        orientation = detect_page_orientation(cropped, max_dim=max_orientation_dim)
        rotated, orientation_meta = auto_rotate_page(cropped, orientation)
        orientation_deg = int(orientation_meta.get("rotation_deg", 0) or 0)
        timings["orientation_ms"] = _now_ms(orientation_started)
        if prof:
            prof.stop("orientation_detection")
    except Exception as exc:
        rotated = cropped
        orientation_deg = 0
        warnings.append(f"orientation_failed:{exc}")
        skipped_steps.append("orientation")
        timings["orientation_ms"] = 0

    try:
        deskew_started = time.time()
        if prof:
            prof.start("deskew")
        deskewed, deskew_meta = deskew_page(rotated, max_angle_deg=max_deskew_angle_deg)
        deskew_deg = float(deskew_meta.get("deskew_deg", 0.0) or 0.0)
        timings["deskew_ms"] = _now_ms(deskew_started)
        if prof:
            prof.stop("deskew")
    except Exception as exc:
        deskewed = rotated
        deskew_deg = 0.0
        warnings.append(f"deskew_failed:{exc}")
        skipped_steps.append("deskew")
        timings["deskew_ms"] = 0

    try:
        content_started = time.time()
        if prof:
            prof.start("content_detection")
        content_bbox = detect_content_region(deskewed, pad_px=max(10, margin_pad_px))
        timings["content_detection_ms"] = _now_ms(content_started)
        if prof:
            prof.stop("content_detection")
        if content_bbox is not None:
            x, y, w, h = content_bbox
            deskewed = deskewed[y : y + h, x : x + w]
        else:
            skipped_steps.append("content_crop")
    except Exception as exc:
        content_bbox = None
        warnings.append(f"content_detection_failed:{exc}")
        skipped_steps.append("content_detection")
        timings["content_detection_ms"] = 0

    try:
        upscale_started = time.time()
        if prof:
            prof.start("upscale")
        upscaled, upscale_meta = upscale_for_ocr(deskewed, min_long_edge=max(1600, int(target_long_edge)))
        timings["upscale_ms"] = _now_ms(upscale_started)
        if prof:
            prof.stop("upscale")
        if not bool(upscale_meta.get("upscaled")):
            skipped_steps.append("upscale")
    except Exception as exc:
        upscaled = deskewed
        warnings.append(f"upscale_failed:{exc}")
        skipped_steps.append("upscale")
        timings["upscale_ms"] = 0

    timings["total_ms"] = _now_ms(started)

    return PagePreprocessResult(
        image=upscaled,
        orientation_deg=orientation_deg,
        deskew_deg=deskew_deg,
        content_bbox=bbox,
        timings_ms=timings,
        skipped_steps=skipped_steps,
        warnings=warnings,
    )


def preprocess_pages_for_ocr(
    pages: Sequence[Any],
    *,
    target_long_edge: int = 2200,
    margin_pad_px: int = 14,
    max_orientation_dim: int = 1400,
    max_deskew_angle_deg: float = 8.0,
) -> List[PagePreprocessResult]:
    results: List[PagePreprocessResult] = []
    prof = current()
    for page in pages or []:
        try:
            results.append(
                preprocess_page_for_ocr(
                    page,
                    target_long_edge=target_long_edge,
                    margin_pad_px=margin_pad_px,
                    max_orientation_dim=max_orientation_dim,
                    max_deskew_angle_deg=max_deskew_angle_deg,
                )
            )
        except Exception as exc:
            try:
                base = _ensure_bgr(page)
            except Exception:
                base = np.zeros((1, 1, 3), dtype=np.uint8)
            results.append(
                PagePreprocessResult(
                    image=base,
                    skipped_steps=["page_preprocess_failed"],
                    warnings=[f"page_preprocess_failed:{exc}"],
                    timings_ms={"total_ms": 0},
                )
            )
    return results