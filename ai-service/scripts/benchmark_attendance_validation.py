"""Benchmark attendance validation quality for UAE timesheet extraction."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List

from pipeline.classifier import classify_pdf
from pipeline.text_extractor import extract_text_pdf


def run(dataset_path: Path) -> None:
    payload = json.loads(dataset_path.read_text(encoding="utf-8"))
    cases: List[Dict[str, Any]] = payload.get("cases", [])

    match_rates: List[float] = []

    for case in cases:
        pdf_path = case["pdf_path"]
        fmt, layout, _is_image = classify_pdf(pdf_path)
        result = extract_text_pdf(pdf_path=pdf_path, fmt=fmt, layout=layout)

        if not result.rows:
            match_rate = 0.0
        else:
            matches = sum(1 for r in result.rows if r.hours_match)
            match_rate = matches / len(result.rows)

        match_rates.append(match_rate)
        print(f"{pdf_path} -> hours_match_rate={match_rate:.3f} rows={len(result.rows)}")

    print(f"Overall attendance validation score: {mean(match_rates) if match_rates else 0.0:.3f}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, help="Path to attendance benchmark JSON")
    args = parser.parse_args()

    run(Path(args.dataset))


if __name__ == "__main__":
    main()
