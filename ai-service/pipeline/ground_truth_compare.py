"""Ground-truth comparison engine for extraction validation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

from schema import ExtractionResult


@dataclass(frozen=True)
class CompareMismatch:
    field: str
    expected: Any
    actual: Any
    detail: str


def _norm_str(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _num_close(expected: float, actual: float, abs_tol: float = 0.5, rel_tol: float = 0.02) -> bool:
    diff = abs(expected - actual)
    if diff <= abs_tol:
        return True
    base = max(abs(expected), 1.0)
    return (diff / base) <= rel_tol


def compare_result_to_ground_truth(result: ExtractionResult, expected: Dict[str, Any]) -> Dict[str, Any]:
    """Compare extraction result to expected ground truth with tolerance-aware numeric checks."""

    mismatches: List[CompareMismatch] = []

    expected_rows: List[Dict[str, Any]] = expected.get("rows", [])
    actual_rows = result.rows

    if len(expected_rows) != len(actual_rows):
        mismatches.append(
            CompareMismatch(
                field="rows.count",
                expected=len(expected_rows),
                actual=len(actual_rows),
                detail="Row count mismatch",
            )
        )

    for idx, exp_row in enumerate(expected_rows):
        if idx >= len(actual_rows):
            break

        act = actual_rows[idx]

        for field_name in ["trade", "project_id", "employee_id"]:
            exp_v = _norm_str(exp_row.get(field_name))
            act_v = _norm_str(getattr(act, field_name, None))
            if exp_v and exp_v != act_v:
                mismatches.append(
                    CompareMismatch(field=f"rows[{idx}].{field_name}", expected=exp_row.get(field_name), actual=getattr(act, field_name, None), detail="String mismatch")
                )

        exp_att = exp_row.get("attendance_total")
        if exp_att is not None and not _num_close(float(exp_att), float(act.calculated_hours or 0.0), abs_tol=1.0, rel_tol=0.05):
            mismatches.append(
                CompareMismatch(
                    field=f"rows[{idx}].attendance_total",
                    expected=exp_att,
                    actual=act.calculated_hours,
                    detail="Attendance total mismatch",
                )
            )

    expected_fin = expected.get("financials", {})
    fin_pairs: List[Tuple[str, float]] = [
        ("deductions", float(result.financials.total_deduction or 0.0)),
        ("vat", float(result.financials.total_vat or 0.0)),
        ("net_payable", float(result.financials.net_payable or 0.0)),
    ]

    for key, act_value in fin_pairs:
        exp_value = expected_fin.get(key)
        if exp_value is None:
            continue
        if not _num_close(float(exp_value), act_value, abs_tol=1.0, rel_tol=0.03):
            mismatches.append(
                CompareMismatch(field=f"financials.{key}", expected=exp_value, actual=act_value, detail="Numeric mismatch")
            )

    score = 1.0
    if mismatches:
        score = max(0.0, 1.0 - (len(mismatches) * 0.08))

    return {
        "score": round(score, 4),
        "mismatch_count": len(mismatches),
        "mismatches": [m.__dict__ for m in mismatches],
    }


def expected_dataset_schema_example() -> Dict[str, Any]:
    """Return expected dataset format example for benchmark usage."""

    return {
        "files": [
            {
                "pdf_path": "path/to/file.pdf",
                "rows": [
                    {
                        "trade": "SCAFFOLDER",
                        "project_id": "P12345",
                        "employee_id": "EMP1234",
                        "attendance_total": 244.5,
                    }
                ],
                "financials": {
                    "deductions": 150.0,
                    "vat": 320.5,
                    "net_payable": 6420.0,
                },
            }
        ]
    }
