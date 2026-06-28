"""
Robust semantic financial block detection.

Supports label variations across different UAE timesheet formats:
- TOTAL DEDUCTION vs DEDUCTION AED vs ABSENT AMOUNT
- NET PAYABLE vs AMOUNT PAYABLE vs FINAL PAYABLE
- GROSS TOTAL vs GROSS AMOUNT
- Etc.

Uses fuzzy semantic matching and token similarity instead of exact matches.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import difflib
import re
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Semantic Categories for Financial Labels
# ---------------------------------------------------------------------------

@dataclass
class FinancialBlockCategories:
    """Semantic categories for financial line items."""
    
    # Label variations that all map to "total_deduction"
    DEDUCTION_LABELS = {
        "total deduction", "deduction", "total absent amount", "absent amount",
        "deduction aed", "absent deduction", "deductions", "total absences",
        "advance deduction", "advance", "penalty", "food deduction",
        "transport deduction", "gas", "loan", "fine",
    }
    
    # Label variations that map to "subtotal"
    SUBTOTAL_LABELS = {
        "subtotal", "sub total", "gross total", "total amount",
        "gross amount", "total gross",
    }
    
    # Label variations that map to "net_payable"
    NET_PAYABLE_LABELS = {
        "net payable", "net amount", "net amount payable aed",
        "amount payable", "final payable", "final total", "final amount",
        "amount aed", "total payable", "payable amount",
    }
    
    # Label variations that map to "vat"
    VAT_LABELS = {
        "vat", "vat amount", "vat aed", "total vat", "total vat aed",
        "tax", "tax amount", "gst", "gst amount",
    }
    
    # Label variations that map to rate/hour fields
    RATE_LABELS = {
        "rate", "hourly rate", "daily rate", "rate aed", "rate per hour",
        "labour rate", "wage", "hourly wage",
    }
    
    # Label variations that map to hours/qty
    HOURS_LABELS = {
        "hours", "hrs", "total hours", "h", "qty", "quantity",
        "days worked", "days", "working days",
    }


@dataclass
class DetectedFinancialBlock:
    """Result of financial block detection."""
    block_type: str  # "deduction", "subtotal", "net_payable", "vat", etc.
    value: float
    raw_label: str
    confidence: float  # 0.0-1.0, based on fuzzy match quality
    source_text: str  # Full text of the detected line/cell


def _normalize_label(label: str) -> str:
    """Normalize label for comparison."""
    return " ".join(label.lower().split()).strip()


def _fuzzy_match_label(text: str, category_labels: set, threshold: float = 0.75) -> Tuple[bool, float]:
    """
    Fuzzy match text against a category of labels.
    
    Returns:
        (matched, confidence)
    """
    norm_text = _normalize_label(text)
    
    # Exact match first (highest confidence)
    if norm_text in category_labels:
        return (True, 1.0)
    
    # Substring match for composite labels
    for label in category_labels:
        if label in norm_text or norm_text in label:
            return (True, 0.9)
    
    # Fuzzy match using difflib sequence matcher
    best_score = 0.0
    for label in category_labels:
        # SequenceMatcher.ratio() returns 0.0-1.0 similarity
        ratio = difflib.SequenceMatcher(None, norm_text, label).ratio()
        best_score = max(best_score, ratio)
    
    if best_score >= threshold:
        return (True, best_score)
    
    return (False, 0.0)


def detect_financial_blocks_in_text(
    text: str,
    categories: Optional[FinancialBlockCategories] = None,
) -> Dict[str, List[DetectedFinancialBlock]]:
    """
    Detect financial blocks from text using semantic label matching.
    
    Returns:
        Dict mapping block type to list of detected blocks
    """
    if categories is None:
        categories = FinancialBlockCategories()
    
    blocks_by_type: Dict[str, List[DetectedFinancialBlock]] = {
        "deduction": [],
        "subtotal": [],
        "net_payable": [],
        "vat": [],
        "rate": [],
        "hours": [],
    }
    
    lines = text.split("\n")
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Try to extract numeric value from line
        amounts = re.findall(r"(?<![\d.])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?", line)
        if not amounts:
            continue
        
        # Use last amount as the value
        try:
            value = float(amounts[-1].replace(",", ""))
        except (ValueError, IndexError):
            continue
        
        # Split line into label and value parts
        # Typically: "LABEL | VALUE" or "LABEL VALUE"
        parts = re.split(r"[\|:]+", line)
        if not parts:
            continue
        
        label_part = parts[0].strip()
        
        # Try to match against each category
        if _fuzzy_match_label(label_part, categories.DEDUCTION_LABELS)[0]:
            matched, conf = _fuzzy_match_label(label_part, categories.DEDUCTION_LABELS)
            blocks_by_type["deduction"].append(
                DetectedFinancialBlock(
                    block_type="deduction",
                    value=value,
                    raw_label=label_part,
                    confidence=conf,
                    source_text=line,
                )
            )
        
        elif _fuzzy_match_label(label_part, categories.SUBTOTAL_LABELS)[0]:
            matched, conf = _fuzzy_match_label(label_part, categories.SUBTOTAL_LABELS)
            blocks_by_type["subtotal"].append(
                DetectedFinancialBlock(
                    block_type="subtotal",
                    value=value,
                    raw_label=label_part,
                    confidence=conf,
                    source_text=line,
                )
            )
        
        elif _fuzzy_match_label(label_part, categories.NET_PAYABLE_LABELS)[0]:
            matched, conf = _fuzzy_match_label(label_part, categories.NET_PAYABLE_LABELS)
            blocks_by_type["net_payable"].append(
                DetectedFinancialBlock(
                    block_type="net_payable",
                    value=value,
                    raw_label=label_part,
                    confidence=conf,
                    source_text=line,
                )
            )
        
        elif _fuzzy_match_label(label_part, categories.VAT_LABELS)[0]:
            matched, conf = _fuzzy_match_label(label_part, categories.VAT_LABELS)
            blocks_by_type["vat"].append(
                DetectedFinancialBlock(
                    block_type="vat",
                    value=value,
                    raw_label=label_part,
                    confidence=conf,
                    source_text=line,
                )
            )
    
    return blocks_by_type


def detect_financial_blocks_in_table(
    table: List[List[str]],
    categories: Optional[FinancialBlockCategories] = None,
) -> Dict[str, List[DetectedFinancialBlock]]:
    """
    Detect financial blocks from a structured table using semantic label matching.
    
    Args:
        table: List of rows, each row is list of cells
        categories: Semantic category definitions
    
    Returns:
        Dict mapping block type to list of detected blocks
    """
    if categories is None:
        categories = FinancialBlockCategories()
    
    blocks_by_type: Dict[str, List[DetectedFinancialBlock]] = {
        "deduction": [],
        "subtotal": [],
        "net_payable": [],
        "vat": [],
        "rate": [],
        "hours": [],
    }
    
    for row in table:
        if not row or len(row) < 2:
            continue
        
        # First cell is typically the label
        label_cell = str(row[0]).strip()
        
        # Extract numeric value from cells (typically the last cell)
        value = 0.0
        for cell in reversed(row):
            try:
                cell_text = str(cell).strip()
                # Extract number from cell
                amounts = re.findall(r"(?<![\d.])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?", cell_text)
                if amounts:
                    value = float(amounts[0].replace(",", ""))
                    break
            except (ValueError, AttributeError):
                continue
        
        if value <= 0.0:
            continue
        
        # Try to match label against categories
        if _fuzzy_match_label(label_cell, categories.DEDUCTION_LABELS)[0]:
            matched, conf = _fuzzy_match_label(label_cell, categories.DEDUCTION_LABELS)
            blocks_by_type["deduction"].append(
                DetectedFinancialBlock(
                    block_type="deduction",
                    value=value,
                    raw_label=label_cell,
                    confidence=conf,
                    source_text=" | ".join(str(c) for c in row),
                )
            )
        
        elif _fuzzy_match_label(label_cell, categories.SUBTOTAL_LABELS)[0]:
            matched, conf = _fuzzy_match_label(label_cell, categories.SUBTOTAL_LABELS)
            blocks_by_type["subtotal"].append(
                DetectedFinancialBlock(
                    block_type="subtotal",
                    value=value,
                    raw_label=label_cell,
                    confidence=conf,
                    source_text=" | ".join(str(c) for c in row),
                )
            )
        
        elif _fuzzy_match_label(label_cell, categories.NET_PAYABLE_LABELS)[0]:
            matched, conf = _fuzzy_match_label(label_cell, categories.NET_PAYABLE_LABELS)
            blocks_by_type["net_payable"].append(
                DetectedFinancialBlock(
                    block_type="net_payable",
                    value=value,
                    raw_label=label_cell,
                    confidence=conf,
                    source_text=" | ".join(str(c) for c in row),
                )
            )
        
        elif _fuzzy_match_label(label_cell, categories.VAT_LABELS)[0]:
            matched, conf = _fuzzy_match_label(label_cell, categories.VAT_LABELS)
            blocks_by_type["vat"].append(
                DetectedFinancialBlock(
                    block_type="vat",
                    value=value,
                    raw_label=label_cell,
                    confidence=conf,
                    source_text=" | ".join(str(c) for c in row),
                )
            )
    
    return blocks_by_type


def extract_best_financial_value(
    blocks: List[DetectedFinancialBlock],
) -> Optional[float]:
    """
    Extract best value from list of detected blocks.
    Prioritizes high-confidence matches and largest values.
    """
    if not blocks:
        return None
    
    # Sort by confidence (descending), then by value (descending)
    sorted_blocks = sorted(
        blocks,
        key=lambda b: (-b.confidence, -b.value)
    )
    
    return sorted_blocks[0].value if sorted_blocks else None
