from typing import Any, Dict, List


def score_extraction(extracted: Dict[str, Any]) -> Dict[str, Any]:
    invoice_rows = extracted.get("invoice_summary", {}).get("rows", [])
    attendance_rows = extracted.get("attendance", {}).get("rows", [])
    pipeline = extracted.get("pipeline", {})

    score = 0.0
    if invoice_rows:
        score += 0.45
    if attendance_rows:
        score += 0.25
    if pipeline.get("used_ocr"):
        score += 0.10
    if extracted.get("invoice_summary", {}).get("totals", {}).get("net_total"):
        score += 0.20

    score = min(1.0, score)

    checks: List[Dict[str, Any]] = [
        {
            "name": "invoice_rows_detected",
            "pass": len(invoice_rows) > 0,
            "value": len(invoice_rows),
        },
        {
            "name": "attendance_rows_detected",
            "pass": len(attendance_rows) > 0,
            "value": len(attendance_rows),
        },
        {
            "name": "net_total_present",
            "pass": float(extracted.get("invoice_summary", {}).get("totals", {}).get("net_total") or 0) > 0,
            "value": float(extracted.get("invoice_summary", {}).get("totals", {}).get("net_total") or 0),
        },
    ]

    extracted["validation"] = {
        "confidence_score": round(score, 3),
        "checks": checks,
    }
    return extracted
