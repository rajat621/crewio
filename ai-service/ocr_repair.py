"""
ocr_repair.py

Generic OCR error repair utilities for numeric fields.

Per spec:
    "132O", "13Z", "I32"  ->  "132"

These repairs are applied to raw numeric-looking strings BEFORE they are
parsed to float, for any field coming from OCR or Vision (hours, rate,
amount, project codes' numeric portion, etc).

This is intentionally separate from trade_normalizer.py's word-level
character repair, which only touches alphabetic words.
"""

from __future__ import annotations

import re
from typing import Optional

# Digit-confusable characters -> correct digit.
# Order matters for ambiguous cases (handled positionally below).
_DIGIT_CONFUSIONS = {
    "O": "0", "o": "0",
    "I": "1", "l": "1", "i": "1", "|": "1",
    "Z": "2", "z": "2",
    "S": "5", "s": "5",
    "B": "8",
    "G": "6",
    "T": "7",
    "g": "9", "q": "9",
}

# Trailing/leading junk characters commonly attached by OCR to numbers
_TRAILING_JUNK_RE = re.compile(r"[OoIlZzSsBbGgTtQq]+$")
_NUMERIC_CORE_RE = re.compile(r"^[\dOoIlZzSsBbGgTtQq.,\-]+$")


def repair_numeric_string(raw: str) -> str:
    """
    Repair a single OCR'd numeric token, returning a string suitable for
    float() parsing. Does not raise; returns the (possibly unmodified)
    input if it cannot confidently be treated as numeric.

    Examples (per spec):
        "132O" -> "132"   (trailing stray letter dropped)
        "13Z"  -> "132"   (embedded letter substituted positionally)
        "I32"  -> "132"   (leading letter substituted positionally)
        "1O0"  -> "100"   (embedded letter substituted positionally)
    """
    if raw is None:
        return ""
    text = str(raw).strip()
    if not text:
        return ""

    # Already clean numeric — nothing to do
    if re.fullmatch(r"-?\d+(\.\d+)?", text):
        return text

    # Only attempt repair on tokens that are "almost numeric": digits plus
    # a small number of letter-lookalikes, optionally with separators.
    if not _NUMERIC_CORE_RE.fullmatch(text):
        return text

    # A trailing "O"/"o" stuck onto an otherwise clean number (e.g. "132O")
    # is treated as stray noise and dropped, per spec example "132O" -> "132".
    # Other trailing OCR-confusable letters (Z, I, S, etc.) are substituted
    # positionally instead, per spec examples "13Z" -> "132", "I32" -> "132".
    trailing_o = re.match(r"^(\d+(?:\.\d+)?)([Oo]+)$", text)
    if trailing_o:
        return trailing_o.group(1)

    repaired_chars = []
    for c in text:
        if c.isdigit() or c in ".,-":
            repaired_chars.append(c)
        elif c in _DIGIT_CONFUSIONS:
            repaired_chars.append(_DIGIT_CONFUSIONS[c])
        else:
            repaired_chars.append(c)

    result = "".join(repaired_chars)
    # Remove thousands separators (commas) but keep decimal point
    if result.count(",") and result.count("."):
        result = result.replace(",", "")
    elif result.count(",") == 1 and len(result.split(",")[-1]) in (1, 2):
        # likely a decimal comma (e.g. european format) -> treat as decimal
        result = result.replace(",", ".")
    else:
        result = result.replace(",", "")

    return result


def safe_float_with_repair(raw, default: float = 0.0) -> float:
    """
    Parse a value to float, attempting OCR digit repair first if the
    direct parse fails OR if the input contains letter characters that
    are plausible OCR digit-confusions (e.g. '13Z', 'I32') — in which
    case repair takes priority over naively stripping those letters,
    since naive stripping silently drops information (e.g. '13Z' -> '13'
    would lose the third digit entirely).
    """
    if raw is None:
        return default
    if isinstance(raw, (int, float)):
        return float(raw)

    text = str(raw).strip()
    if not text:
        return default

    # If the token is "almost numeric" (digits + currency/space junk only,
    # no letter-like OCR-confusable characters), do a direct clean parse.
    has_letter_confusables = bool(re.search(r"[A-Za-z]", text))

    if not has_letter_confusables:
        direct = re.sub(r"[^\d.\-,]", "", text)
        try:
            if direct and direct not in {".", "-", ","}:
                return float(direct.replace(",", ""))
        except ValueError:
            pass
        return default

    # Token contains letters — attempt OCR-aware digit repair FIRST so we
    # don't silently lose digits that were misrecognized as letters
    # (e.g. '13Z' -> '132', not '13').
    repaired = repair_numeric_string(text)
    repaired_clean = re.sub(r"[^\d.\-]", "", repaired)
    try:
        if repaired_clean and repaired_clean not in {".", "-"}:
            return float(repaired_clean)
    except ValueError:
        pass

    # Fall back to naive stripping if repair produced nothing usable
    direct = re.sub(r"[^\d.\-,]", "", text)
    try:
        if direct and direct not in {".", "-", ","}:
            return float(direct.replace(",", ""))
    except ValueError:
        pass

    return default


def repair_text_noise(raw: str) -> str:
    """
    Light general-purpose text cleanup for OCR'd free text fields
    (names, client names, invoice numbers) — collapses whitespace and
    strips stray control characters without altering letters, since
    word-level repair is the job of trade_normalizer for trade fields
    specifically.
    """
    if not raw:
        return ""
    text = str(raw)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text
