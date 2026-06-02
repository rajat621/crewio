"""Benchmark extraction accuracy using labeled expected row counts and totals.

Usage:
python scripts/benchmark_extraction_accuracy.py --dataset datasets/benchmarks/extraction_cases.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List

from pipeline.classifier import classify_pdf
from pipeline.text_extractor import extract_text_pdf


def _score_case(expected: Dict[str, Any], actual: Dict[str, Any]) -> float:
    row_score = 1.0 if int(expected.get("expected_rows", 0)) == int(actual.get("rows", 0)) else 0.0

    expected_sub = float(expected.get("expected_subtotal", 0.0) or 0.0)
    actual_sub = float(actual.get("subtotal", 0.0) or 0.0)

    if expected_sub <= 0:
        subtotal_score = 1.0
    else:
        diff = abs(expected_sub - actual_sub)
        subtotal_score = max(0.0, 1.0 - (diff / max(expected_sub, 1.0)))

    return round((0.6 * row_score) + (0.4 * subtotal_score), 4)


def run(dataset_path: Path) -> None:
    payload = json.loads(dataset_path.read_text(encoding="utf-8"))
    cases: List[Dict[str, Any]] = payload.get("cases", [])

    scores: List[float] = []

    for case in cases:
        pdf_path = case["pdf_path"]
        fmt, layout, _is_image = classify_pdf(pdf_path)
        result = extract_text_pdf(pdf_path=pdf_path, fmt=fmt, layout=layout)

        actual = {
            "rows": len(result.rows),
            "subtotal": result.financials.subtotal,
        }
        score = _score_case(case, actual)
        scores.append(score)

        print(f"{pdf_path} -> score={score:.4f} rows={actual['rows']} subtotal={actual['subtotal']}")

    overall = mean(scores) if scores else 0.0
    print(f"Overall extraction accuracy score: {overall:.4f}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, help="Path to benchmark dataset JSON")
    args = parser.parse_args()

    run(Path(args.dataset))


if __name__ == "__main__":
    main()
