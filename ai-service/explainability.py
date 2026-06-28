"""
explainability.py
Additive, deterministic explainability metadata for extraction pipeline.
"""
from typing import Dict, Any, List

def explain_fallback_activation(fallback_used: bool, reason: str = "") -> Dict[str, Any]:
    if fallback_used:
        return {"explain": True, "type": "fallback", "reason": reason}
    return {"explain": False}

def explain_row_merges(merges: int, total_rows: int) -> Dict[str, Any]:
    if merges > 0:
        return {"explain": True, "type": "row_merge", "reason": f"{merges} merges out of {total_rows}"}
    return {"explain": False}

def explain_totals_correction(corrected: bool, original: float, corrected_value: float) -> Dict[str, Any]:
    if corrected:
        return {"explain": True, "type": "totals_correction", "reason": f"{original} corrected to {corrected_value}"}
    return {"explain": False}

def explain_ocr_fallback(ocr_fallback: bool, reason: str = "") -> Dict[str, Any]:
    if ocr_fallback:
        return {"explain": True, "type": "ocr_fallback", "reason": reason}
    return {"explain": False}

def explain_semantic_rejection(rejected: bool, reason: str = "") -> Dict[str, Any]:
    if rejected:
        return {"explain": True, "type": "semantic_rejection", "reason": reason}
    return {"explain": False}

def explain_validation_correction(corrected: bool, field: str, original, corrected_value) -> Dict[str, Any]:
    if corrected:
        return {"explain": True, "type": "validation_correction", "field": field, "reason": f"{original} corrected to {corrected_value}"}
    return {"explain": False}
