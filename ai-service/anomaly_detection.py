"""
anomaly_detection.py
Additive, deterministic anomaly heuristics for extraction pipeline.
No ML, only rule-based checks.
"""
from typing import Dict, Any, List

def detect_missing_totals(rows: List[dict], total: float) -> Dict[str, Any]:
    if total is None or total == 0:
        return {"anomaly": True, "type": "missing_total", "reason": "No total present"}
    return {"anomaly": False}

def detect_abnormal_hours(rows: List[dict], max_hours: float = 24.0) -> Dict[str, Any]:
    for r in rows:
        hours = r.get("hours")
        if hours is not None and (hours < 0 or hours > max_hours):
            return {"anomaly": True, "type": "abnormal_hours", "reason": f"Row with hours={hours}"}
    return {"anomaly": False}

def detect_vat_inconsistencies(rows: List[dict], vat_rate: float = 0.2) -> Dict[str, Any]:
    for r in rows:
        vat = r.get("vat")
        total = r.get("total")
        if vat is not None and total is not None:
            expected = total * vat_rate
            if abs(vat - expected) > 0.01 * total:
                return {"anomaly": True, "type": "vat_inconsistency", "reason": f"VAT mismatch: {vat} vs {expected}"}
    return {"anomaly": False}

def detect_row_total_mismatches(rows: List[dict]) -> Dict[str, Any]:
    for r in rows:
        subtotal = r.get("subtotal")
        total = r.get("total")
        if subtotal is not None and total is not None and abs(subtotal - total) > 0.01 * total:
            return {"anomaly": True, "type": "row_total_mismatch", "reason": f"Subtotal {subtotal} vs total {total}"}
    return {"anomaly": False}

def detect_duplicate_employee(rows: List[dict]) -> Dict[str, Any]:
    seen = set()
    for r in rows:
        emp = r.get("employee_id")
        if emp in seen:
            return {"anomaly": True, "type": "duplicate_employee", "reason": f"Duplicate {emp}"}
        seen.add(emp)
    return {"anomaly": False}

def detect_malformed_table(table: list) -> Dict[str, Any]:
    if not table or not isinstance(table, list):
        return {"anomaly": True, "type": "malformed_table", "reason": "No table data"}
    row_lengths = [len(row) for row in table if isinstance(row, list)]
    if not row_lengths or len(set(row_lengths)) > 1:
        return {"anomaly": True, "type": "malformed_table", "reason": "Inconsistent row lengths"}
    return {"anomaly": False}

def detect_schema_shift(data: dict, expected_keys: List[str]) -> Dict[str, Any]:
    missing = [k for k in expected_keys if k not in data]
    if missing:
        return {"anomaly": True, "type": "schema_shift", "reason": f"Missing keys: {missing}"}
    return {"anomaly": False}
