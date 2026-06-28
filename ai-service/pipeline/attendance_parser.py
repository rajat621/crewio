<<<<<<< HEAD
﻿"""
=======
"""
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
pipeline/attendance_parser.py

Parse BKC/employee-based attendance tables into structured daily records.

Handles:
  - W  (Worked full day = 10h)
  - A  (Absent)
  - H  (Holiday)
  - OFF (Off day)
  - decimal hours (10, 10.5, 12.5, 0.5)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence


# ---------------------------------------------------------------------------
# Per-day defaults
# ---------------------------------------------------------------------------
WORK_HOURS_PER_W = 10.0   # standard day in UAE labour contracts

_NUMERIC_RE = re.compile(r"^\d{1,2}(?:\.\d{0,2})?$")
_ATT_MARKER_RE = re.compile(r"^(W|A|H|OFF)$", re.I)


@dataclass
class AttendanceRecord:
    """Parsed attendance for one employee."""

    employee_name: str = ""
    employee_id: str = ""
    trade: str = ""
    rate: float = 0.0
    days: Dict[str, str] = field(default_factory=dict)  # {"1": "10", "2": "W", "3": "A", ...}
    worked_days: int = 0
    absent_days: int = 0
    holiday_days: int = 0
    total_hours: float = 0.0
    overtime_hours: float = 0.0
    amount: float = 0.0

    def to_dict(self) -> Dict:
        return {
            "employee_name": self.employee_name,
            "employee_id": self.employee_id,
            "trade": self.trade,
            "rate": self.rate,
            "days": self.days,
            "worked_days": self.worked_days,
            "absent_days": self.absent_days,
            "holiday_days": self.holiday_days,
            "total_hours": self.total_hours,
            "overtime_hours": self.overtime_hours,
            "amount": self.amount,
        }


def _parse_day_value(raw: str) -> str:
    """
    Normalize a single day-cell value.

    Returns:
      "W"   if worked marker
      "A"   if absent
      "H"   if holiday
      "OFF" if off
      "10", "10.5", etc. for explicit hours
      ""    if empty / unknown
    """
    val = raw.strip().upper()

    if not val or val in {"", "-", "_", "."}:
        return ""

    if val in {"W", "WW", "VV", "\\/V", "/V", "W/"}:
        return "W"
    if val in {"A", "AA"}:
        return "A"
    if val in {"H", "HH", "H/D", "HD"}:
        return "H"
    if val in {"OFF", "OF", "0FF", "0F"}:
        return "OFF"

    # Numeric hours (e.g. 10, 12.5, 0.5)
    cleaned = re.sub(r"[^0-9.]", "", val)
    if cleaned:
        try:
            f = float(cleaned)
            if 0 < f <= 24:
                # Distinguish whole vs fractional
                if f == int(f):
                    return str(int(f))
                return str(round(f, 1))
        except ValueError:
            pass

    return ""


def _hours_from_day(day_val: str) -> float:
    """Convert a normalised day value to hours."""
    if not day_val:
        return 0.0
    if day_val == "W":
        return WORK_HOURS_PER_W
    if day_val in {"A", "H", "OFF"}:
        return 0.0
    try:
        return float(day_val)
    except ValueError:
        return 0.0


def _is_day_column_header(val: str) -> bool:
    """True if cell looks like a day-number header (1–31)."""
    try:
        n = int(val.strip())
        return 1 <= n <= 31
    except ValueError:
        return False


def parse_attendance_row(
    cells: Sequence[str],
    day_start_col: int = 4,
) -> AttendanceRecord:
    """
    Parse one table row into an AttendanceRecord.

    Expected column order (flexible):
      col 0: serial / index
      col 1: employee ID
      col 2: employee name
      col 3: trade
      col 4: rate or start of day columns
      col 5+: day columns (31 max) then TOTAL / ABSENT / AMOUNT

    Args:
        cells: Normalized cell values.
        day_start_col: Column index where day values begin.

    Returns:
        AttendanceRecord with parsed data.
    """
    rec = AttendanceRecord()
    if not cells:
        return rec

    # --- Try to pick out employee ID (6–8 digit number) ---
    for i, c in enumerate(cells[:day_start_col]):
        if re.fullmatch(r"\d{6,8}", c.strip()):
            rec.employee_id = c.strip()
            # name is typically in the next non-empty cell after the ID
            for j in range(i + 1, min(i + 3, len(cells))):
                cand = cells[j].strip()
                if cand and not re.match(r"^\d", cand):
                    if len(cand) > 3:
                        rec.employee_name = cand
                        break
            break

    # --- Trade (pick the first alpha-heavy token that looks like a trade word) ---
    _TRADE_RE = re.compile(
        r"(mason|mason|tile|carpenter|steel\s*fix|steelfixer|plumber|electrician|"
        r"painter|welder|helper|scaffold|foreman|supervisor|operator|driver|"
        r"cleaner|cook|labour|laborer|labourer|worker|technician)",
        re.I,
    )
    for c in cells[:day_start_col + 2]:
        m = _TRADE_RE.search(c)
        if m:
            rec.trade = c.strip()
            break

    # --- Rate ---
    for c in cells[:day_start_col + 2]:
        val = c.strip().replace(",", "")
        try:
            f = float(val)
            if 50 <= f <= 2000:  # sensible UAE daily/rate range
                rec.rate = f
                break
        except ValueError:
            pass

    # --- Day columns ---
    day_cells = list(cells[day_start_col:])
    day_num = 1
    days: Dict[str, str] = {}

    for c in day_cells:
        if day_num > 31:
            break
        parsed = _parse_day_value(c)
        if parsed:
            days[str(day_num)] = parsed
        day_num += 1

    rec.days = days

    # --- Aggregate stats ---
    worked = 0
    absent = 0
    holiday = 0
    total_hours = 0.0

    for dv in days.values():
        if dv == "W":
            worked += 1
            total_hours += WORK_HOURS_PER_W
        elif dv == "A":
            absent += 1
        elif dv == "H":
            holiday += 1
        elif dv == "OFF":
            pass  # off-day, no count
        else:
            try:
                h = float(dv)
                if h > 0:
                    if h > WORK_HOURS_PER_W:
                        overtime = round(h - WORK_HOURS_PER_W, 2)
                        rec.overtime_hours += overtime
                    worked += 1
                    total_hours += h
            except ValueError:
                pass

    rec.worked_days = worked
    rec.absent_days = absent
    rec.holiday_days = holiday
    rec.total_hours = round(total_hours, 2)

    # Amount: rate × worked days (if no explicit amount column)
    if rec.rate > 0:
        rec.amount = round(rec.rate * worked, 2)

    return rec


def parse_attendance_table(
    rows: Sequence[Sequence[str]],
    day_start_col: int = 4,
) -> List[AttendanceRecord]:
    """
    Parse a full OCR table (list of rows) into attendance records.

    Skips header rows automatically (detected by day-number columns like 1–31).

    Args:
        rows: Normalized table rows.
        day_start_col: Column index where day values begin.

    Returns:
        List of AttendanceRecord, one per employee row.
    """
    records: List[AttendanceRecord] = []

    for row in rows:
        cells = [str(c or "").strip() for c in row]
        if not any(cells):
            continue

        # Skip header rows: rows where day_start_col+ contain integers 1-31
        day_sample = cells[day_start_col:day_start_col + 5]
        if sum(1 for c in day_sample if _is_day_column_header(c)) >= 3:
            continue

        # Skip rows that have no employee ID or trade
        has_id = any(re.fullmatch(r"\d{6,8}", c) for c in cells[:day_start_col])
        day_like = sum(1 for c in cells[day_start_col:] if _parse_day_value(c))
        if not has_id and day_like < 3:
            continue

        rec = parse_attendance_row(cells, day_start_col=day_start_col)
        if rec.total_hours > 0 or rec.worked_days > 0:
            records.append(rec)

    return records
