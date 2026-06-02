"""Batch PDF processing with parallel extraction and consolidated report."""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List

from pipeline import run_extraction


def _one(pdf_path: Path) -> Dict[str, Any]:
    result = run_extraction(pdf_path=str(pdf_path))
    return {
        "pdf_path": str(pdf_path),
        "success": result.success,
        "rows": len(result.rows),
        "confidence": result.confidence,
        "warnings": result.warnings,
        "error": result.error,
    }


def run(folder: Path, output: Path, workers: int = 4) -> Dict[str, Any]:
    files = sorted(folder.rglob("*.pdf"))

    items: List[Dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        futures = [ex.submit(_one, p) for p in files]
        for fut in as_completed(futures):
            items.append(fut.result())

    items.sort(key=lambda x: x["pdf_path"])

    failed = [i["pdf_path"] for i in items if not i["success"]]

    report = {
        "folder": str(folder),
        "total_files": len(items),
        "failed_files": failed,
        "results": items,
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--folder", required=True)
    parser.add_argument("--output", default="storage/debug/batch_report.json")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    report = run(Path(args.folder), Path(args.output), workers=args.workers)
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
