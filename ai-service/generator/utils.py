<<<<<<< HEAD
﻿"""
=======
"""
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
generator/utils.py  –  Shared drawing utilities for invoice PDF generation.
"""

from __future__ import annotations

from typing import List

from reportlab.lib import colors
from reportlab.pdfgen import canvas

HEADER_BLUE = colors.HexColor("#0b78c2")
WHITE       = colors.white
BLACK       = colors.black
LIGHT_GREY  = colors.HexColor("#8f98a6")
DARK_TEXT   = colors.HexColor("#2a2f37")

LINE_WIDTH  = 0.45


# ---------------------------------------------------------------------------
# Number → words (UAE Dirhams)
# ---------------------------------------------------------------------------

_ONES = [
    "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
    "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
    "Sixteen", "Seventeen", "Eighteen", "Nineteen",
]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty",
         "Sixty", "Seventy", "Eighty", "Ninety"]


def _under_thousand(n: int) -> str:
    parts: List[str] = []
    if n >= 100:
        parts.append(f"{_ONES[n // 100]} Hundred")
        n %= 100
    if n >= 20:
        parts.append(_TENS[n // 10])
        if n % 10:
            parts.append(_ONES[n % 10])
    elif n > 0:
        parts.append(_ONES[n])
    return " ".join(parts)


def number_to_words(num: float) -> str:
    integer  = int(num)
    fraction = int(round((num - integer) * 100))
    if fraction >= 100:
        integer  += 1
        fraction  = 0

    if integer == 0:
        words = "Zero"
    else:
        groups    = [(1_000_000_000, "Billion"), (1_000_000, "Million"),
                     (1_000, "Thousand"), (1, "")]
        parts: List[str] = []
        remaining = integer
        for value, suffix in groups:
            if remaining >= value:
                chunk = remaining // value
                remaining %= value
                part = _under_thousand(chunk)
                parts.append(f"{part} {suffix}".strip())
        words = " ".join(parts)

    if fraction:
        return f"{words} Dirhams and {fraction:02d} Fils Only"
    return f"{words} Dirhams Only"


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------

def word_wrap(text: str, max_chars: int) -> List[str]:
    """Split *text* into lines of at most *max_chars* characters."""
    if not text:
        return []
    words = str(text).split()
    lines: List[str] = []
    current = ""
    for word in words:
        probe = f"{current} {word}".strip()
        if len(probe) <= max_chars:
            current = probe
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


# ---------------------------------------------------------------------------
# Canvas drawing helpers
# ---------------------------------------------------------------------------

def draw_cell(
    c: canvas.Canvas,
    x: float, y: float, w: float, h: float,
    text: str,
    align: str  = "L",   # L / C / R
    font: str   = "Helvetica",
    size: float = 7.0,
    color=BLACK,
    fill_color=None,
    border: bool = True,
) -> None:
    """Draw a single table cell with optional fill and border."""
    if fill_color is not None:
        c.setFillColor(fill_color)
        c.rect(x, y, w, h, stroke=0, fill=1)

    if border:
        c.setStrokeColor(BLACK)
        c.setLineWidth(LINE_WIDTH)
        c.rect(x, y, w, h, stroke=1, fill=0)

    c.setFillColor(color)
    c.setFont(font, size)
    mid_y = y + (h - size) / 2 + 0.4

    if align == "C":
        c.drawCentredString(x + w / 2, mid_y, str(text))
    elif align == "R":
        c.drawRightString(x + w - 1.5, mid_y, str(text))
    else:
        c.drawString(x + 1.5, mid_y, str(text))


def draw_multiline_cell(
    c: canvas.Canvas,
    x: float, y: float, w: float, h: float,
    lines: List[str],
    font: str   = "Helvetica-Bold",
    size: float = 6.2,
    color=WHITE,
    fill_color=HEADER_BLUE,
    border: bool = True,
) -> None:
    """Draw a header cell that may contain multiple lines of text."""
    if fill_color is not None:
        c.setFillColor(fill_color)
        c.rect(x, y, w, h, stroke=0, fill=1)
    if border:
        c.setStrokeColor(BLACK)
        c.setLineWidth(LINE_WIDTH)
        c.rect(x, y, w, h, stroke=1, fill=0)

    c.setFillColor(color)
    c.setFont(font, size)
    line_h   = size * 1.25
    total_h  = len(lines) * line_h
    start_y  = y + (h + total_h) / 2 - line_h + 0.5
    for i, line in enumerate(lines):
        c.drawCentredString(x + w / 2, start_y - i * line_h, line)
