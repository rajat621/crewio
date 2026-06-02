"""Centralized extraction configuration for OCR and table reconstruction."""

from __future__ import annotations

import os
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, Optional


@dataclass
class MorphologyConfig:
    horizontal_kernel_width: int = 40
    vertical_kernel_height: int = 40
    open_iterations: int = 2


@dataclass
class OCRConfig:
    min_confidence: float = 0.45
    dpi: int = 300


@dataclass
class RowClusterConfigModel:
    y_tolerance_px: float = 12.0
    y_tolerance_ratio: float = 0.45


@dataclass
class ColumnClusterConfigModel:
    x_tolerance_px: float = 14.0
    x_tolerance_ratio: float = 0.45


@dataclass
class SkewCorrectionConfig:
    enabled: bool = True
    max_angle_deg: float = 8.0


@dataclass
class PreprocessingConfig:
    adaptive_block_size: int = 31
    adaptive_c: int = 15
    denoise_h: int = 10
    clahe_clip_limit: float = 2.5


@dataclass
class DebugExportConfig:
    enabled: bool = False
    output_dir: Optional[str] = None


@dataclass
class TemplateTuning:
    attendance_row_min_tokens: int = 5
    attendance_row_min_markers: int = 2
    low_text_threshold_chars: int = 700


@dataclass
class ExtractionConfig:
    morphology: MorphologyConfig = field(default_factory=MorphologyConfig)
    ocr: OCRConfig = field(default_factory=OCRConfig)
    row_cluster: RowClusterConfigModel = field(default_factory=RowClusterConfigModel)
    column_cluster: ColumnClusterConfigModel = field(default_factory=ColumnClusterConfigModel)
    skew: SkewCorrectionConfig = field(default_factory=SkewCorrectionConfig)
    preprocessing: PreprocessingConfig = field(default_factory=PreprocessingConfig)
    debug: DebugExportConfig = field(default_factory=DebugExportConfig)
    template: TemplateTuning = field(default_factory=TemplateTuning)


_TEMPLATE_OVERRIDES: Dict[str, Dict[str, Any]] = {
    "mcc": {
        "template": {
            "attendance_row_min_tokens": 6,
            "attendance_row_min_markers": 2,
            "low_text_threshold_chars": 800,
        },
        "row_cluster": {
            "y_tolerance_px": 11.0,
        },
        "column_cluster": {
            "x_tolerance_px": 12.0,
        },
    },
    "bkc": {
        "template": {
            "attendance_row_min_tokens": 5,
            "attendance_row_min_markers": 1,
            "low_text_threshold_chars": 1000,
        },
        "row_cluster": {
            "y_tolerance_px": 14.0,
        },
        "column_cluster": {
            "x_tolerance_px": 16.0,
        },
    },
    "generic": {
        "template": {
            "attendance_row_min_tokens": 4,
            "attendance_row_min_markers": 1,
            "low_text_threshold_chars": 650,
        },
    },
}


def load_extraction_config() -> ExtractionConfig:
    """Load extraction configuration from defaults and environment flags."""

    cfg = ExtractionConfig()

    default_debug_dir = Path(__file__).resolve().parents[1] / "storage" / "debug"

    debug_flag = os.getenv("AI_EXTRACT_DEBUG", "false").strip().lower() == "true"
    debug_dir = os.getenv("AI_EXTRACT_DEBUG_DIR", "").strip()
    ocr_conf = os.getenv("AI_OCR_MIN_CONF", "").strip()

    cfg.debug.enabled = debug_flag
    cfg.debug.output_dir = debug_dir or str(default_debug_dir)

    if ocr_conf:
        try:
            cfg.ocr.min_confidence = float(ocr_conf)
        except Exception:
            pass

    return cfg


def apply_template_overrides(config: ExtractionConfig, template_name: str) -> ExtractionConfig:
    """Apply template-specific tuning in place and return config."""

    block = _TEMPLATE_OVERRIDES.get((template_name or "").lower())
    if not block:
        return config

    for section, values in block.items():
        target = getattr(config, section, None)
        if target is None:
            continue
        for key, value in values.items():
            if hasattr(target, key):
                setattr(target, key, value)

    return config


def config_to_dict(config: ExtractionConfig) -> Dict[str, Any]:
    """Serialize configuration for logging or debugging."""

    return asdict(config)


def apply_runtime_overrides(config: ExtractionConfig, overrides: Optional[Dict[str, Any]]) -> ExtractionConfig:
    """Apply runtime overrides in the form: {section: {field: value}}."""

    if not overrides:
        return config

    for section, values in overrides.items():
        target = getattr(config, section, None)
        if target is None or not isinstance(values, dict):
            continue
        for key, value in values.items():
            if hasattr(target, key):
                setattr(target, key, value)

    return config
