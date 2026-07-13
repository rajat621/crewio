from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline.extraction_metrics import reset_extraction_metrics  # noqa: E402
from pipeline.run import run_extraction  # noqa: E402


DEFAULT_CASES = [
    {
        "label": "image_based_timesheet",
        "path": "storage/debug/unknown_template_validation/generated_dataset/time_sheet-baseline_unknown.pdf",
    },
    {
        "label": "digital_timesheet",
        "path": "storage/debug/unknown_template_validation_quick/generated_dataset/time_sheet-baseline_unknown.pdf",
    },
    {
        "label": "low_quality_scan",
        "path": "storage/debug/unknown_template_validation/generated_dataset/time_sheet-low_dpi_scan.pdf",
    },
    {
        "label": "mixed_layout_contractor_sheet",
        "path": "storage/debug/unknown_template_validation/generated_dataset/time_sheet-shifted_table.pdf",
    },
]


def _load_expected(path: Optional[str]) -> Dict[str, Dict[str, Any]]:
    if not path:
        return {}
    p = Path(path)
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {}


def _load_cases(args: argparse.Namespace) -> List[Dict[str, str]]:
    if args.case:
        cases: List[Dict[str, str]] = []
        for item in args.case:
            if "=" in item:
                label, raw_path = item.split("=", 1)
            else:
                raw_path = item
                label = Path(raw_path).stem
            cases.append({"label": label, "path": raw_path})
        return cases
    if args.cases_json:
        p = Path(args.cases_json)
        if p.exists():
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return [dict(item) for item in data]
            if isinstance(data, dict):
                return [dict(v, label=k) for k, v in data.items()]
    return list(DEFAULT_CASES)


def _resolve_case_path(raw_path: str, root: Path) -> Path:
    p = Path(raw_path)
    if p.is_absolute():
        return p
    candidates = [root / p, root.parent / p, Path.cwd() / p]
    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()
    return (root / p).resolve()


def _employee_key(row: Any) -> str:
    for attr in ("employee_id", "id_no", "employee_name"):
        value = getattr(row, attr, None)
        if value:
            return str(value).strip().upper()
    trade = getattr(row, "trade", "") or ""
    amount = getattr(row, "amount", 0.0) or 0.0
    hours = getattr(row, "hours", 0.0) or 0.0
    return f"{trade}|{hours}|{amount}"


def _read_latest_metrics() -> Dict[str, Any]:
    p = Path("temp/extraction_metrics.json")
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _summarize_result(result: Any, elapsed_ms: int, expected: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    expected = expected or {}
    rows = list(getattr(result, "rows", []) or [])
    financials = getattr(result, "financials", None)
    subtotal = float(getattr(financials, "subtotal", 0.0) or 0.0)
    expected_subtotal = expected.get("subtotal")
    subtotal_accuracy = None
    if expected_subtotal not in (None, ""):
        try:
            expected_subtotal_f = float(expected_subtotal)
            if expected_subtotal_f != 0:
                subtotal_accuracy = max(0.0, 1.0 - (abs(subtotal - expected_subtotal_f) / abs(expected_subtotal_f)))
            else:
                subtotal_accuracy = 1.0 if subtotal == 0 else 0.0
        except Exception:
            subtotal_accuracy = None

    latest_metrics = _read_latest_metrics()
    latest_by_event = latest_metrics.get("latest_by_event", {}) if isinstance(latest_metrics, dict) else {}
    repair_metrics = ((latest_by_event.get("OCR_REPAIR_METRICS") or {}).get("metrics") or {}) if isinstance(latest_by_event, dict) else {}
    semantic_input = ((latest_by_event.get("SEMANTIC_INPUT_METRICS") or {}).get("metrics") or {}) if isinstance(latest_by_event, dict) else {}
    semantic_output = ((latest_by_event.get("SEMANTIC_OUTPUT_METRICS") or {}).get("metrics") or {}) if isinstance(latest_by_event, dict) else {}

    oversized_after = int(repair_metrics.get("oversized_tokens_after", 0) or 0)
    total_after = int(repair_metrics.get("total_tokens_after", 0) or 0)
    semantic_rejected = int(semantic_output.get("rows_rejected", 0) or 0)
    semantic_accepted = int(semantic_output.get("rows_accepted", 0) or 0)
    rejection_rate = None
    if semantic_accepted + semantic_rejected > 0:
        rejection_rate = semantic_rejected / float(semantic_accepted + semantic_rejected)

    return {
        "success": bool(getattr(result, "success", False)),
        "rows_extracted": len(rows),
        "employee_count": len({_employee_key(row) for row in rows}),
        "subtotal": subtotal,
        "subtotal_accuracy": subtotal_accuracy,
        "vat": float(getattr(financials, "total_vat", 0.0) or 0.0),
        "net_total": float(getattr(financials, "net_payable", 0.0) or 0.0),
        "extraction_confidence": float(getattr(result, "confidence", 0.0) or 0.0),
        "processing_time_ms": elapsed_ms,
        "used_ocr": bool(getattr(result, "used_ocr", False)),
        "used_vision": bool(getattr(result, "used_vision", False)),
        "ocr_repair_metrics": repair_metrics,
        "semantic_input_metrics": semantic_input,
        "semantic_output_metrics": semantic_output,
        "oversized_after_ratio": (oversized_after / float(total_after)) if total_after else 0.0,
        "semantic_rejection_rate": rejection_rate,
        "warnings": list(getattr(result, "warnings", []) or [])[:25],
    }


def _install_noop_repair() -> None:
    import pipeline.text_extractor as text_extractor
    import pipeline.columnar_ocr as columnar_ocr

    def noop_repair(tokens, **kwargs):
        token_list = list(tokens or [])
        metrics = {
            "total_tokens": len(token_list),
            "usable_tokens": len(token_list),
            "oversized_tokens": 0,
            "reprocessed_tokens": 0,
            "split_success_rate": 0.0,
            "median_token_height_before": 0.0,
            "median_token_height_after": 0.0,
            "oversized_tokens_after": 0,
            "unreliable_tokens": 0,
        }
        return token_list, {"metrics": metrics, "events": [], "source": "repair_disabled_for_validation"}

    text_extractor.repair_ocr_box_geometry = noop_repair
    columnar_ocr.repair_ocr_box_geometry = noop_repair


def _restore_real_repair() -> None:
    import pipeline.text_extractor as text_extractor
    import pipeline.columnar_ocr as columnar_ocr
    from pipeline.ocr_box_repair import repair_ocr_box_geometry

    text_extractor.repair_ocr_box_geometry = repair_ocr_box_geometry
    columnar_ocr.repair_ocr_box_geometry = repair_ocr_box_geometry


def _run_one(pdf_path: Path, *, repair_enabled: bool, label: str, expected: Dict[str, Any]) -> Dict[str, Any]:
    reset_extraction_metrics()
    if repair_enabled:
        _restore_real_repair()
    else:
        _install_noop_repair()

    started = time.time()
    result = run_extraction(str(pdf_path), force_ocr=False, debug_mode=False, run_id=f"validation_{label}_{'after' if repair_enabled else 'before'}")
    elapsed_ms = int((time.time() - started) * 1000)
    return _summarize_result(result, elapsed_ms, expected)


def _compare(before: Dict[str, Any], after: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "rows_extracted_delta": int(after.get("rows_extracted", 0)) - int(before.get("rows_extracted", 0)),
        "employee_count_delta": int(after.get("employee_count", 0)) - int(before.get("employee_count", 0)),
        "confidence_delta": float(after.get("extraction_confidence", 0.0)) - float(before.get("extraction_confidence", 0.0)),
        "processing_time_delta_ms": int(after.get("processing_time_ms", 0)) - int(before.get("processing_time_ms", 0)),
        "semantic_rejection_rate_delta": (
            None
            if before.get("semantic_rejection_rate") is None or after.get("semantic_rejection_rate") is None
            else float(after["semantic_rejection_rate"]) - float(before["semantic_rejection_rate"])
        ),
        "oversized_after_below_5_percent": float(after.get("oversized_after_ratio", 0.0) or 0.0) < 0.05,
        "no_row_regression": int(after.get("rows_extracted", 0)) >= int(before.get("rows_extracted", 0)),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate OCR repair through production extraction pipeline.")
    parser.add_argument("--case", action="append", help="Validation case as label=path or path. Repeatable.")
    parser.add_argument("--cases-json", help="JSON list/dict of validation cases.")
    parser.add_argument("--expected-json", help="Optional expected metrics keyed by case label, e.g. subtotal.")
    parser.add_argument("--output", default="temp/ocr_repair_production_validation.json")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    expected_by_label = _load_expected(args.expected_json)
    report: Dict[str, Any] = {
        "cases": [],
        "summary": {
            "case_count": 0,
            "row_recall_improved_or_equal": 0,
            "semantic_rejection_rate_decreased_or_equal": 0,
            "oversized_below_5_percent": 0,
            "no_regression": 0,
        },
    }

    for case in _load_cases(args):
        label = str(case.get("label") or Path(str(case.get("path", ""))).stem)
        pdf_path = _resolve_case_path(str(case.get("path", "")), root)
        if not pdf_path.exists():
            report["cases"].append({"label": label, "path": str(pdf_path), "error": "pdf_not_found"})
            continue

        expected = expected_by_label.get(label, {})
        print(f"Running before-repair validation: {label} -> {pdf_path}", flush=True)
        before = _run_one(pdf_path, repair_enabled=False, label=label, expected=expected)
        print(f"Running after-repair validation: {label} -> {pdf_path}", flush=True)
        after = _run_one(pdf_path, repair_enabled=True, label=label, expected=expected)
        comparison = _compare(before, after)
        report["cases"].append({
            "label": label,
            "path": str(pdf_path),
            "before_repair": before,
            "after_repair": after,
            "comparison": comparison,
        })

    valid_cases = [c for c in report["cases"] if not c.get("error")]
    report["summary"]["case_count"] = len(valid_cases)
    for c in valid_cases:
        comp = c.get("comparison", {})
        before = c.get("before_repair", {})
        after = c.get("after_repair", {})
        if int(comp.get("rows_extracted_delta", 0)) >= 0:
            report["summary"]["row_recall_improved_or_equal"] += 1
        rej_delta = comp.get("semantic_rejection_rate_delta")
        if rej_delta is None or float(rej_delta) <= 0.0:
            report["summary"]["semantic_rejection_rate_decreased_or_equal"] += 1
        if comp.get("oversized_after_below_5_percent"):
            report["summary"]["oversized_below_5_percent"] += 1
        if comp.get("no_row_regression") and float(after.get("extraction_confidence", 0.0)) >= max(0.0, float(before.get("extraction_confidence", 0.0)) - 0.05):
            report["summary"]["no_regression"] += 1

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(f"Wrote validation report: {out}")
    print(json.dumps(report["summary"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
