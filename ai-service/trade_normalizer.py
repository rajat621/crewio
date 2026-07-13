"""
trade_normalizer.py

Generic, whitelist-free trade/designation name normalization.

Per spec:
    "SteelFixer", "Steel Fixer", "Steel-Fixer", "Steelfixer" -> "STEEL FIXER"

Does NOT require the trade to be on a fixed list — it generalizes to any
supplier's vocabulary by:
  1. Cleaning noise (punctuation, multiple spaces, case)
  2. Splitting camelCase / concatenated words ("SteelFixer" -> "Steel Fixer")
  3. Repairing common OCR character substitutions inside words
     ("STEEL F1XER" -> "STEEL FIXER")
  4. Optionally collapsing near-duplicate variants seen earlier in the same
     document/run via a lightweight similarity check (difflib, stdlib only)
     so "STEEL FIXER" and "STEELFIXER" produced by different rows in the
     same document collapse to one canonical label.

A small synonym map is included as a *bonus* normalization pass (not a
gate) — unknown trades are still normalized and accepted, just without
the synonym collapse.
"""

from __future__ import annotations

import difflib
import re
from typing import Dict, List, Optional

# ---------------------------------------------------------------------------
# OCR character-confusion table (used only on the few letters most often
# confused with digits/punctuation inside words on poor scans).
# ---------------------------------------------------------------------------
_OCR_CHAR_FIXES = {
    "0": "O",
    "1": "I",
    "5": "S",
    "8": "B",
    "@": "A",
    "$": "S",
    "|": "I",
}

# Optional bonus synonym collapses — purely cosmetic, never required for a
# trade to be "valid". Extend freely; absence of an entry never blocks
# extraction.
_SYNONYM_MAP = {
    "STEEL FIXER": "STEEL FIXER",
    "STEELFIXER": "STEEL FIXER",
    "STEEL FIXING": "STEEL FIXER",
    "REBAR FIXER": "STEEL FIXER",
    "MASON": "MASON",
    "BLOCK MASON": "MASON",
    "TILE MASON": "TILE MASON",
    "TILER": "TILE MASON",
    "CARPENTER": "CARPENTER",
    "SHUTTERING CARPENTER": "CARPENTER",
    "FINISHING CARPENTER": "FINISHING CARPENTER",
    "HELPER": "HELPER",
    "LABOUR": "LABOURER",
    "LABOR": "LABOURER",
    "LABOURER": "LABOURER",
    "LABORER": "LABOURER",
    "PLUMBER": "PLUMBER",
    "ELECTRICIAN": "ELECTRICIAN",
    "PAINTER": "PAINTER",
    "WELDER": "WELDER",
    "SCAFFOLDER": "SCAFFOLDER",
    "SCAFFOLDING": "SCAFFOLDER",
    "FOREMAN": "FOREMAN",
    "SUPERVISOR": "SUPERVISOR",
    "DRIVER": "DRIVER",
    "OPERATOR": "OPERATOR",
    "TECHNICIAN": "TECHNICIAN",
}

_CAMEL_SPLIT_RE = re.compile(r"(?<=[a-z])(?=[A-Z])")
_NON_ALNUM_RE = re.compile(r"[^A-Za-z0-9]+")
_MULTI_SPACE_RE = re.compile(r"\s+")


def _split_camel_and_joined(text: str) -> str:
    """Split 'SteelFixer' -> 'Steel Fixer'. Also splits hyphens/underscores."""
    text = text.replace("-", " ").replace("_", " ").replace("/", " ")
    text = _CAMEL_SPLIT_RE.sub(" ", text)
    return text


def _repair_ocr_chars_in_word(word: str) -> str:
    """
    Repair OCR digit/symbol confusions WITHIN an alphabetic word only.
    Only applies when the word has letters mixed with 1-2 stray digits/
    symbols (e.g. 'F1XER', 'FIXFR' typo-style) — never touches pure
    numeric tokens (handled separately by ocr_repair.py for numbers).
    """
    if not word:
        return word
    letters = sum(1 for c in word if c.isalpha())
    digits_or_symbols = sum(1 for c in word if c in _OCR_CHAR_FIXES)
    if letters == 0 or digits_or_symbols == 0:
        return word
    # Only repair if the word is mostly alphabetic (i.e. it's a word, not a
    # number) — avoids corrupting genuine numeric tokens.
    if letters < digits_or_symbols:
        return word
    repaired_chars = []
    for c in word:
        if c in _OCR_CHAR_FIXES and word.replace(c, "").isalpha():
            repaired_chars.append(_OCR_CHAR_FIXES[c])
        else:
            repaired_chars.append(c)
    return "".join(repaired_chars)


def _merge_spaced_letter_tokens(words: List[str]) -> List[str]:
    merged: List[str] = []
    buffer: List[str] = []

    for word in words:
        if len(word) == 1 and word.isalpha():
            buffer.append(word)
            continue

        if buffer:
            if word.isalpha():
                merged.append("".join(buffer) + word)
                buffer = []
                continue
            merged.extend(buffer)
            buffer = []

        merged.append(word)

    if buffer:
        merged.append("".join(buffer) if len(buffer) > 1 else buffer[0])

    return merged


def normalize_trade_name(raw: str, known_trades: Optional[List[str]] = None) -> str:
    """
    Normalize any trade/designation string to a canonical uppercase form.

    Generalizes to ANY trade name, not just a fixed whitelist.

    Args:
        raw: the raw trade string from extraction (any source).
        known_trades: optional list of already-normalized trade names seen
            earlier in this document/run. If the normalized result is a
            close fuzzy match (>= 0.88 ratio) to one of these, the existing
            canonical form is reused so minor OCR variance within the same
            document collapses to a single trade bucket.

    Returns:
        Canonical uppercase trade name, e.g. "STEEL FIXER".
        Empty string if input is empty/unusable.
    """
    if not raw:
        return ""

    text = str(raw).strip()
    if not text:
        return ""

    # 1. Split camelCase / hyphen / underscore joins
    text = _split_camel_and_joined(text)

    # 2. Repair OCR char confusions per-word
    words = text.split()
    words = [_repair_ocr_chars_in_word(w) for w in words]
    words = _merge_spaced_letter_tokens(words)
    text = " ".join(words)

    # 3. Strip remaining punctuation noise, collapse whitespace, uppercase
    text = _NON_ALNUM_RE.sub(" ", text)
    text = _MULTI_SPACE_RE.sub(" ", text).strip().upper()

    if not text:
        return ""

    # 4. Bonus synonym collapse (never a gate — unmatched trades pass through)
    text = _SYNONYM_MAP.get(text, text)

    # 5. Fuzzy-collapse to an existing canonical trade already seen in this
    #    document, to avoid the same trade appearing twice due to residual
    #    OCR noise the rules above didn't catch.
    if known_trades:
        match = difflib.get_close_matches(text, known_trades, n=1, cutoff=0.88)
        if match:
            return match[0]

    return text


def build_trade_canonicalizer():
    """
    Returns a stateful function trade_canon(raw) -> normalized_trade
    that remembers all canonical trades seen so far in a single document,
    so repeated OCR-noisy variants of the same trade collapse together.

    Usage:
        canon = build_trade_canonicalizer()
        for row in rows:
            row.description = canon(row.description)
    """
    seen: List[str] = []

    def _canon(raw: str) -> str:
        result = normalize_trade_name(raw, known_trades=seen)
        if result and result not in seen:
            seen.append(result)
        return result

    return _canon
