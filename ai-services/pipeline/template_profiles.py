"""Template profile detection and naming utilities."""

from __future__ import annotations

import re
from dataclasses import dataclass

from schema import TimesheetFormat


@dataclass(frozen=True)
class TemplateProfile:
    name: str
    confidence: float


_BKC_TOKENS = {"intergrande", "bkc", "timesheet for the month"}
_MCC_TOKENS = {"project no", "no. of hours", "trade", "amount"}
_PROJECT_CODE_RE = re.compile(r"\bP\d{3,8}[A-Z0-9]*\b", re.IGNORECASE)


def detect_template_profile(text: str, fmt_hint: TimesheetFormat) -> TemplateProfile:
    """Infer template family to tune OCR and clustering behavior."""

    lowered = (text or "").lower()

    bkc_hits = sum(1 for t in _BKC_TOKENS if t in lowered)
    mcc_hits = sum(1 for t in _MCC_TOKENS if t in lowered)

    if bkc_hits >= 1 or fmt_hint == TimesheetFormat.BKC:
        return TemplateProfile(name="bkc", confidence=0.82)

    if mcc_hits >= 2 or _PROJECT_CODE_RE.search(lowered) or fmt_hint == TimesheetFormat.MCC:
        return TemplateProfile(name="mcc", confidence=0.8)

    return TemplateProfile(name="generic", confidence=0.6)
