"""End-to-end production benchmark runner.

Single-command benchmark execution with consolidated JSON report.

Usage:
python scripts/benchmark_runner.py --dataset datasets/benchmarks/ground_truth.json --output storage/debug/benchmark_report.json
"""

from __future__ import annotations

import argparse
import json
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List

from generator import generate_invoice_pdf
from pipeline import run_extraction
from pipeline.classifier import classify_pdf
from pipeline.ground_truth_compare import compare_result_to_ground_truth, expected_dataset_schema_example
from schema import CompanyProfile


def _run_one(entry: Dict[str, Any], debug_dir: Path) -> Dict[str, Any]:
    pdf_path = entry["pdf_path"]
    fmt, layout, _is_image = classify_pdf(pdf_path)

    result = run_extraction(pdf_path=pdf_path)

    compare = compare_result_to_ground_truth(result, entry)

    mismatch_dir = debug_dir / "mismatch_reports"
    mismatch_dir.mkdir(parents=True, exist_ok=True)
    mismatch_path = mismatch_dir / f"{Path(pdf_path).stem}_mismatch.json"
    mismatch_path.write_text(json.dumps(compare, indent=2, ensure_ascii=False), encoding="utf-8")

    profile_data = entry.get("company_data") or {
        "name": "Benchmark Company",
        "trn": "-",
        "vatRate": 0.05,
    }
    profile = CompanyProfile.from_dict(profile_data)

    invoice_ok = False
    invoice_error = ""
    try:
        out_dir = str(debug_dir / "invoices")
        invoice_path = generate_invoice_pdf(output_dir=out_dir, result=result, profile=profile)
        invoice_ok = Path(invoice_path).exists()
    except Exception as exc:
        invoice_error = str(exc)

    attendance_matches = sum(1 for r in result.rows if r.hours_match)
    attendance_accuracy = (attendance_matches / len(result.rows)) if result.rows else 0.0

    return {
        "pdf_path": pdf_path,
        "success": result.success,
        "rows": len(result.rows),
        "confidence": result.confidence,
        "attendance_accuracy": round(attendance_accuracy, 4),
        "comparison": compare,
        "mismatch_report": str(mismatch_path),
        "invoice_generation_ok": invoice_ok,
        "invoice_generation_error": invoice_error,
        "warnings": result.warnings,
    }


def run(dataset_path: Path, output_path: Path, workers: int = 4) -> Dict[str, Any]:
    payload = json.loads(dataset_path.read_text(encoding="utf-8"))
    files: List[Dict[str, Any]] = payload.get("files", [])

    debug_root = output_path.parent
    debug_root.mkdir(parents=True, exist_ok=True)

    per_file: List[Dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        futures = [ex.submit(_run_one, entry, debug_root) for entry in files]
        for fut in as_completed(futures):
            per_file.append(fut.result())

    per_file.sort(key=lambda x: x.get("pdf_path", ""))

    overall_accuracy = mean([f["comparison"]["score"] for f in per_file]) if per_file else 0.0
    attendance_accuracy = mean([f["attendance_accuracy"] for f in per_file]) if per_file else 0.0

    financial_scores: List[float] = []
    for f in per_file:
        mismatch_count = f["comparison"].get("mismatch_count", 0)
        financial_scores.append(max(0.0, 1.0 - min(1.0, mismatch_count * 0.1)))

    financial_accuracy = mean(financial_scores) if financial_scores else 0.0
    ocr_confidence_avg = mean([f["confidence"] for f in per_file]) if per_file else 0.0

    failed_files = [f["pdf_path"] for f in per_file if (not f["success"]) or (not f["invoice_generation_ok"]) ]
    warnings = [w for f in per_file for w in f.get("warnings", [])]

    report = {
        "overall_accuracy": round(overall_accuracy, 4),
        "attendance_accuracy": round(attendance_accuracy, 4),
        "financial_accuracy": round(financial_accuracy, 4),
        "ocr_confidence_avg": round(ocr_confidence_avg, 4),
        "failed_files": failed_files,
        "warnings": warnings,
        "per_file": per_file,
    }

    output_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, help="Ground truth dataset JSON path")
    parser.add_argument("--output", default="storage/debug/benchmark_report.json", help="Consolidated output report JSON")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--print-schema", action="store_true")
    args = parser.parse_args()

    if args.print_schema:
        print(json.dumps(expected_dataset_schema_example(), indent=2, ensure_ascii=False))
        return

    report = run(Path(args.dataset), Path(args.output), workers=args.workers)
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
