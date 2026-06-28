<<<<<<< HEAD
﻿"""
=======
"""
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
Table normalization and domain-aware cleanup utilities.

Normalizes reconstructed tables to improve downstream attendance parsing and
invoice generation for UAE labour workflows.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple


ATTENDANCE_MARKERS = {"W", "A", "H", "OFF", "-"}
OVERTIME_KEYWORDS = {"OT", "O/T", "OVERTIME"}


@dataclass
class TableNormalizerConfig:
    """Normalization settings."""

    trim_cells: bool = True
    remove_empty_rows: bool = True
    normalize_marker_tokens: bool = True
    normalize_numeric_tokens: bool = True
    max_columns_pad: Optional[int] = None


class TableNormalizer:
    """Apply structural and token cleanup to reconstructed tables."""

    def __init__(self, config: Optional[TableNormalizerConfig] = None) -> None:
        self.config = config or TableNormalizerConfig()

    def normalize(self, table: Sequence[Sequence[str]]) -> List[List[str]]:
        """
        Normalize table matrix.

        Steps:
        - trim and standardize tokens
        - drop empty rows
        - align row lengths
        """

        rows: List[List[str]] = []

        for row in table:
            normalized_row = [self._normalize_token(cell) for cell in row]
            if self.config.remove_empty_rows and self._is_empty_row(normalized_row):
                continue
            rows.append(normalized_row)

        if not rows:
            return []

        max_cols = max(len(row) for row in rows)
        if self.config.max_columns_pad is not None:
            max_cols = min(max_cols, self.config.max_columns_pad)

        aligned: List[List[str]] = []
        for row in rows:
            trimmed = row[:max_cols]
            if len(trimmed) < max_cols:
                trimmed = trimmed + [""] * (max_cols - len(trimmed))
            aligned.append(trimmed)

        return aligned

    def normalize_attendance_record(self, row: Sequence[str]) -> Dict[str, object]:
        """
        Convert one normalized row into attendance-centric record.

        Expected pattern (flexible):
            [employee, d1, d2, d3, ...]
        """

        if not row:
            return {"employee": "", "attendance": {}, "is_overtime": False}

        employee = str(row[0]).strip()
        attendance: Dict[str, object] = {}

        for idx, raw in enumerate(row[1:], start=1):
            value = self._parse_attendance_value(raw)
            attendance[str(idx)] = value

        joined = " ".join(str(item).upper() for item in row)
        is_overtime = any(keyword in joined for keyword in OVERTIME_KEYWORDS)

        return {
            "employee": employee,
            "attendance": attendance,
            "is_overtime": is_overtime,
        }

    def normalize_invoice_row(self, row: Sequence[str]) -> Dict[str, object]:
        """
        Build a generic normalized invoice row supporting project and employee modes.

        Returned fields are intentionally flexible for downstream schema mapping.
        """

        values = [self._normalize_token(cell) for cell in row]

        project_code = ""
        employee_name = ""
        trade_name = ""
        quantity = 0.0
        rate = 0.0
        amount = 0.0
        deduction = 0.0

        for token in values:
            up = token.upper()

            if re.fullmatch(r"P\d{3,8}[A-Z0-9]*", up):
                project_code = token
                continue

            if any(word in up for word in ["DED", "DEDUCTION", "PENALTY", "FINE"]):
                deduction += self._safe_float(token)
                continue

            # Heuristic numeric extraction for qty/rate/amount when row order varies.
            num = self._safe_float(token)
            if num > 0:
                if quantity == 0.0:
                    quantity = num
                elif rate == 0.0:
                    rate = num
                else:
                    amount = max(amount, num)
                continue

            if not employee_name and len(token.split()) >= 2:
                employee_name = token
                continue

            if not trade_name and token and token.upper() not in ATTENDANCE_MARKERS:
                trade_name = token

        if amount == 0.0 and quantity > 0 and rate > 0:
            amount = round(quantity * rate, 2)

        return {
            "project_code": project_code,
            "employee_name": employee_name,
            "trade_name": trade_name,
            "quantity": quantity,
            "rate": rate,
            "amount": amount,
            "deduction": deduction,
        }

    def _normalize_token(self, token: str) -> str:
        """Normalize OCR token for attendance and invoice parsing."""

        value = str(token or "")

        if self.config.trim_cells:
            value = " ".join(value.split())

        if not value:
            return ""

        if self.config.normalize_marker_tokens:
            up = value.upper()
            marker_map = {
                "VV": "W",
                "WW": "W",
                "\/V": "W",
                "AA": "A",
                "HH": "H",
            }
            if up in marker_map:
                return marker_map[up]
            if up in ATTENDANCE_MARKERS:
                return up

        if self.config.normalize_numeric_tokens:
            value = self._fix_numeric_ocr_noise(value)

        return value

    @staticmethod
    def _fix_numeric_ocr_noise(value: str) -> str:
        """Fix common OCR substitutions in numeric tokens."""

        if not value:
            return value

        # Replace only when token appears numeric-like.
        if re.fullmatch(r"[0-9OIlSBG.,-]+", value):
            replacements = {
                "O": "0",
                "I": "1",
                "l": "1",
                "S": "5",
                "B": "8",
                "G": "6",
            }
            value = "".join(replacements.get(ch, ch) for ch in value)

        return value

    @staticmethod
    def _parse_attendance_value(raw: str) -> object:
        """Parse attendance token into marker or numeric hours."""

        token = str(raw or "").strip().upper()
        if not token:
            return ""

        if token in ATTENDANCE_MARKERS:
            return token

        try:
            val = float(token)
            if abs(val - int(val)) < 1e-9:
                return int(val)
            return round(val, 2)
        except Exception:
            return token

    @staticmethod
    def _is_empty_row(row: Sequence[str]) -> bool:
        """Whether every cell in row is empty after normalization."""

        return all(not str(cell).strip() for cell in row)

    @staticmethod
    def _safe_float(value: str, default: float = 0.0) -> float:
        """Parse float from noisy OCR token."""

        cleaned = re.sub(r"[^0-9.\-]", "", str(value or ""))
        if cleaned in {"", ".", "-"}:
            return default
        try:
            return float(cleaned)
        except Exception:
            return default


def normalize_table(table: Sequence[Sequence[str]], config: Optional[TableNormalizerConfig] = None) -> List[List[str]]:
    """Convenience function for table normalization."""

    return TableNormalizer(config=config).normalize(table)
