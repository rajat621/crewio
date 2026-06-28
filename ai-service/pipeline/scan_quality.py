<<<<<<< HEAD
﻿"""Scan quality scoring and preprocessing tuning hints."""
=======
"""Scan quality scoring and preprocessing tuning hints."""
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List

import cv2
import numpy as np


@dataclass(frozen=True)
class ScanQualityResult:
    score: float
    blur_score: float
    skew_deg: float
    contrast_score: float
    noise_score: float
    border_score: float
    issues: List[str]
    tuning: Dict[str, float]


def _normalize(value: float, low: float, high: float) -> float:
    if high <= low:
        return 0.0
    v = (value - low) / (high - low)
    return max(0.0, min(1.0, v))


def score_scan_quality(image: np.ndarray) -> ScanQualityResult:
    """Score page quality and return tuning hints for extraction pipeline."""

    gray = image if len(image.shape) == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    blur_score = _normalize(lap_var, 20.0, 220.0)

    contrast = float(np.std(gray))
    contrast_score = _normalize(contrast, 18.0, 70.0)

    den = cv2.GaussianBlur(gray, (3, 3), 0)
    noise_est = float(np.mean(cv2.absdiff(gray, den)))
    noise_score = 1.0 - _normalize(noise_est, 3.0, 22.0)

    edges = cv2.Canny(gray, 50, 150)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=80, minLineLength=max(gray.shape[1] // 8, 50), maxLineGap=20)

    angles = []
    if lines is not None:
        for raw in lines:
            x1, y1, x2, y2 = raw[0]
            dx = x2 - x1
            dy = y2 - y1
            if dx == 0:
                continue
            angle = math.degrees(math.atan2(dy, dx))
            if abs(angle) < 20:
                angles.append(angle)

    skew_deg = float(np.median(angles)) if angles else 0.0
    skew_score = 1.0 - _normalize(abs(skew_deg), 0.0, 8.0)

    h, w = gray.shape[:2]
    border = 8
    border_pixels = np.concatenate([
        gray[:border, :].reshape(-1),
        gray[-border:, :].reshape(-1),
        gray[:, :border].reshape(-1),
        gray[:, -border:].reshape(-1),
    ])
    border_contrast = float(np.std(border_pixels))
    border_score = _normalize(border_contrast, 8.0, 40.0)

    overall = float(np.mean([blur_score, contrast_score, noise_score, skew_score, border_score]))

    issues: List[str] = []
    tuning: Dict[str, float] = {}

    if blur_score < 0.45:
        issues.append("blur")
        tuning["sharpen_strength"] = 1.3
    if contrast_score < 0.45:
        issues.append("low_contrast")
        tuning["clahe_clip_limit"] = 3.2
    if noise_score < 0.45:
        issues.append("noisy_scan")
        tuning["denoise_h"] = 14.0
    if abs(skew_deg) > 2.0:
        issues.append("skew")
        tuning["deskew_max_angle_deg"] = max(abs(skew_deg) + 1.0, 8.0)
    if border_score < 0.4:
        issues.append("missing_borders")
        tuning["morph_open_iterations"] = 2.0

    return ScanQualityResult(
        score=round(overall, 4),
        blur_score=round(blur_score, 4),
        skew_deg=round(skew_deg, 3),
        contrast_score=round(contrast_score, 4),
        noise_score=round(noise_score, 4),
        border_score=round(border_score, 4),
        issues=issues,
        tuning=tuning,
    )
