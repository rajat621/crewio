"""Export utilities for normalized tables and extraction outputs."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, List, Sequence

import pandas as pd


def export_normalized_table_json(path: str, table: Sequence[Sequence[Any]]) -> str:
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(table, indent=2, ensure_ascii=False), encoding="utf-8")
    return str(out)


def export_normalized_table_csv(path: str, table: Sequence[Sequence[Any]]) -> str:
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)

    with out.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        for row in table:
            writer.writerow(list(row))

    return str(out)


def export_normalized_table_excel(path: str, table: Sequence[Sequence[Any]]) -> str:
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)

    frame = pd.DataFrame([list(r) for r in table])
    try:
        frame.to_excel(str(out), index=False, header=False)
    except Exception:
        # Fallback to csv-compatible content with xlsx extension if engine is unavailable.
        frame.to_csv(str(out), index=False, header=False)

    return str(out)
