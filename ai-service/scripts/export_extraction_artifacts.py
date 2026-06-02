"""Export extraction artifacts to JSON/CSV/Excel.

Usage:
python scripts/export_extraction_artifacts.py --pdf path/to/file.pdf --outdir storage/debug/exports
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, List

from pipeline.classifier import classify_pdf
from pipeline.export_utils import (
    export_normalized_table_csv,
    export_normalized_table_excel,
    export_normalized_table_json,
)
from pipeline.text_extractor import extract_text_pdf


def _rows_to_table(rows: List[Any]) -> List[List[Any]]:
    table: List[List[Any]] = [["trade", "project_id", "employee_id", "hours", "rate", "amount", "calculated_hours", "hours_match", "overtime_hours"]]

    for row in rows:
        table.append(
            [
                row.trade,
                row.project_id,
                row.employee_id,
                row.hours,
                row.rate,
                row.amount,
                row.calculated_hours,
                row.hours_match,
                row.overtime_hours,
            ]
        )

    return table


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--outdir", default="storage/debug/exports")
    args = parser.parse_args()

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    fmt, layout, _is_image = classify_pdf(args.pdf)
    result = extract_text_pdf(args.pdf, fmt, layout, debug_mode=True)

    table = _rows_to_table(result.rows)

    json_path = export_normalized_table_json(str(outdir / "normalized_table.json"), table)
    csv_path = export_normalized_table_csv(str(outdir / "normalized_table.csv"), table)
    excel_path = export_normalized_table_excel(str(outdir / "normalized_table.xlsx"), table)

    report = {
        "json": json_path,
        "csv": csv_path,
        "excel": excel_path,
        "warnings": result.warnings,
    }

    (outdir / "export_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
