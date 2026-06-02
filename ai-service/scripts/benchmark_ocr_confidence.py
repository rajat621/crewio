"""Benchmark OCR confidence and warning rates across sample PDFs."""

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
    files: List[str] = payload.get("pdf_paths", [])

    confidences: List[float] = []
    warning_counts: List[int] = []

    for pdf_path in files:
        fmt, layout, _is_image = classify_pdf(pdf_path)
        result = extract_text_pdf(pdf_path=pdf_path, fmt=fmt, layout=layout)

        confidences.append(float(result.confidence))
        warning_counts.append(len(result.warnings))

        print(f"{pdf_path} -> confidence={result.confidence:.3f} warnings={len(result.warnings)}")

    print(f"Average OCR confidence: {mean(confidences) if confidences else 0.0:.3f}")
    print(f"Average warnings per file: {mean(warning_counts) if warning_counts else 0.0:.2f}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, help="Path to JSON with pdf_paths")
    args = parser.parse_args()

    run(Path(args.dataset))


if __name__ == "__main__":
    main()
