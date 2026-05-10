from typing import Any, Dict, List


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float))


def validate_invoice_rows(rows: List[Dict[str, Any]]) -> bool:
    if not isinstance(rows, list):
        return False
    if not rows:
        return False
    for row in rows:
        if not isinstance(row, dict):
            return False
        trade = row.get("trade")
        hours = row.get("hours")
        rate = row.get("rate")
        amount = row.get("amount")
        if not trade:
            return False
        if not _is_number(hours) or float(hours) < 0:
            return False
        if not _is_number(rate) or float(rate) < 0:
            return False
        if not _is_number(amount) or float(amount) < 0:
            return False
    return True


def validate_attendance_rows(rows: List[Dict[str, Any]]) -> bool:
    if not isinstance(rows, list):
        return False
    if not rows:
        return False
    valid_count = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        if row.get("employee_id") or row.get("employee_name"):
            valid_count += 1
    return valid_count > 0


def validate_extracted_data(data: Dict[str, Any]) -> bool:
    """Validate normalized extraction payload from hybrid pipeline."""
    if not isinstance(data, dict):
        return False

    invoice_rows = data.get("invoice_summary", {}).get("rows", [])
    attendance_rows = data.get("attendance", {}).get("rows", [])

    # At least one valid extraction category should pass.
    return validate_invoice_rows(invoice_rows) or validate_attendance_rows(attendance_rows)
