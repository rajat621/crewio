"""
confidence_scoring.py
Additive, deterministic confidence scoring for extraction pipeline.
- OCR readability
- table extraction quality
- semantic normalization confidence
- totals consistency
- row merge confidence
- overall extraction confidence
All functions return confidence scores and metadata only.
"""

from typing import Dict, Any

def score_ocr_readability(ocr_text: str) -> Dict[str, Any]:
    # Heuristic: score based on non-empty, printable, and non-garbage ratio
    if not ocr_text:
        return {"score": 0.0, "reason": "empty text"}
    printable = sum(c.isprintable() for c in ocr_text)
    ratio = printable / max(1, len(ocr_text))
    score = min(1.0, max(0.0, ratio))
    return {"score": score, "reason": "printable ratio"}

def score_table_quality(table: list) -> Dict[str, Any]:
    # Heuristic: score based on row/column consistency and non-empty cells
    if not table or not isinstance(table, list):
        return {"score": 0.0, "reason": "no table data"}
    row_lengths = [len(row) for row in table if isinstance(row, list)]
    if not row_lengths:
        return {"score": 0.0, "reason": "no valid rows"}
    consistent = len(set(row_lengths)) == 1
    non_empty = sum(cell not in (None, "") for row in table for cell in row)
    total = sum(len(row) for row in table)
    fill_ratio = non_empty / max(1, total)
    score = 0.7 * fill_ratio + 0.3 * (1.0 if consistent else 0.0)
    return {"score": score, "reason": "fill ratio and consistency"}

def score_semantic_confidence(normalized: dict) -> Dict[str, Any]:
    # Heuristic: score based on presence of key fields
    required = ["invoice_number", "date", "total"]
    present = sum(1 for k in required if k in normalized and normalized[k])
    score = present / len(required)
    return {"score": score, "reason": f"{present}/{len(required)} key fields present"}

def score_totals_consistency(rows: list, total: float) -> Dict[str, Any]:
    # Heuristic: sum of row totals vs. reported total
    if not rows or total is None:
        return {"score": 0.0, "reason": "missing data"}
    try:
        row_sum = sum(float(r.get("total", 0)) for r in rows if isinstance(r, dict))
        diff = abs(row_sum - total)
        rel_err = diff / max(1.0, abs(total))
        score = max(0.0, 1.0 - rel_err)
        return {"score": score, "reason": f"relative error {rel_err:.2f}"}
    except Exception as e:
        return {"score": 0.0, "reason": f"error: {e}"}

def score_row_merge_confidence(merged_rows: list, original_rows: list) -> Dict[str, Any]:
    # Heuristic: score based on number of merges vs. originals
    if not original_rows:
        return {"score": 0.0, "reason": "no original rows"}
    merges = len(original_rows) - len(merged_rows)
    ratio = merges / max(1, len(original_rows))
    score = max(0.0, 1.0 - ratio)
    return {"score": score, "reason": f"{merges} merges out of {len(original_rows)}"}

def score_overall(confidences: Dict[str, float]) -> Dict[str, Any]:
    # Weighted average of all confidence scores
    if not confidences:
        return {"score": 0.0, "reason": "no confidences"}
    weights = {k: 1.0 for k in confidences}
    total_weight = sum(weights.values())
    weighted = sum(confidences[k] * weights[k] for k in confidences)
    score = weighted / max(1e-6, total_weight)
    return {"score": score, "reason": "weighted average"}
