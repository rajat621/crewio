"""Compare template behavior across MCC, BKC, and Generic sample sets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean
from typing import Dict, List

from pipeline.classifier import classify_pdf
from pipeline.text_extractor import extract_text_pdf


def _run_group(name: str, files: List[str]) -> Dict[str, float]:
    rows = []
    conf = []
    warns = []

    for pdf_path in files:
        fmt, layout, _is_image = classify_pdf(pdf_path)
        result = extract_text_pdf(pdf_path=pdf_path, fmt=fmt, layout=layout)

        rows.append(len(result.rows))
        conf.append(float(result.confidence))
        warns.append(len(result.warnings))

    return {
        "avg_rows": mean(rows) if rows else 0.0,
        "avg_confidence": mean(conf) if conf else 0.0,
        "avg_warnings": mean(warns) if warns else 0.0,
    }


def run(dataset_path: Path) -> None:
    payload = json.loads(dataset_path.read_text(encoding="utf-8"))

    for group_name in ["mcc", "bkc", "generic"]:
        files = payload.get(group_name, [])
        metrics = _run_group(group_name, files)
        print(f"{group_name.upper()} -> rows={metrics['avg_rows']:.2f} confidence={metrics['avg_confidence']:.3f} warnings={metrics['avg_warnings']:.2f}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, help="Path to template comparison JSON")
    args = parser.parse_args()

    run(Path(args.dataset))


if __name__ == "__main__":
    main()
