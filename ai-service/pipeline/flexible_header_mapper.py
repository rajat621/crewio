"""
Flexible header mapping for layout-adaptive extraction.

Automatically detects and maps header variations:
- trade / designation / craft / worker_type → trade
- id / employee_no / labour_code / emp_id → employee_id
- hours / qty / quantity / days_worked → hours
- rate / hourly_rate / daily_rate → rate
- amount / subtotal_per_row → amount
- project / projectno / project_no / po → project_id
- Etc.

Supports:
- Unknown header names (semantic inference)
- Shifted column positions
- Merged/missing columns
- Altered header text with spelling variations
"""

from __future__ import annotations

from dataclasses import dataclass
import difflib
import re
from typing import Dict, List, Optional, Tuple, Any


# ---------------------------------------------------------------------------
# Semantic Header Categories
# ---------------------------------------------------------------------------

@dataclass
class HeaderMappingCategories:
    """Semantic categories for table headers."""
    
    # Column header variations that all map to "trade"
    TRADE_VARIANTS = {
        "trade", "designation", "craft", "worker_type", "worker type",
        "job_type", "job type", "position", "labour", "labour type",
        "occupation", "skill", "specialization",
    }
    
    # Column header variations that map to "employee_id"
    EMPLOYEE_ID_VARIANTS = {
        "id", "emp_id", "emp id", "employee_id", "employee id",
        "labour_code", "labour code", "labour no", "labour_no",
        "worker_id", "worker id", "personnel no", "employee no",
        "employee_no", "h.i.no", "h.i.no.", "hi no",
    }
    
    # Column header variations that map to "hours"
    HOURS_VARIANTS = {
        "hours", "hrs", "h", "qty", "quantity", "qty worked",
        "days_worked", "days worked", "days", "working_days",
        "time", "duration", "period",
    }
    
    # Column header variations that map to "rate"
    RATE_VARIANTS = {
        "rate", "hourly_rate", "hourly rate", "daily_rate", "daily rate",
        "labour_rate", "labour rate", "rate_aed", "rate aed",
        "wage", "hourly_wage", "wage_rate", "wage rate",
        "price", "unit_price",
    }
    
    # Column header variations that map to "amount"
    AMOUNT_VARIANTS = {
        "amount", "total", "amount_aed", "amount aed", "subtotal",
        "sub_total", "sub total", "earned", "payable", "gross",
    }
    
    # Column header variations that map to "project_id"
    PROJECT_VARIANTS = {
        "project", "project_id", "project id", "projectno", "project_no",
        "po", "po_number", "po number", "site", "site_id", "site id",
        "contract", "contract_no", "contract_id",
    }
    
    # Date-related headers (identify time dimension)
    DATE_VARIANTS = {
        "date", "day", "d", "month", "year", "period",
        "week", "week_no", "week no",
    }


@dataclass
class MappedHeader:
    """Result of header mapping."""
    semantic_name: str  # "trade", "employee_id", "hours", etc.
    original_name: str  # Original header text
    confidence: float  # 0.0-1.0, match quality
    column_index: int  # Position in table


def _normalize_header(header: str) -> str:
    """Normalize header for comparison."""
    # Remove common suffixes/prefixes
    text = str(header).strip().lower()
    # Replace common separators with spaces
    text = re.sub(r"[_\-\.]+", " ", text)
    # Remove extra whitespace
    text = " ".join(text.split())
    return text


def _fuzzy_match_header(
    text: str,
    category_variants: set,
    threshold: float = 0.75,
) -> Tuple[bool, float]:
    """
    Fuzzy match header text against category variants.
    
    Returns:
        (matched, confidence)
    """
    norm_text = _normalize_header(text)
    
    # Exact match (highest confidence)
    if norm_text in category_variants:
        return (True, 1.0)
    
    # Substring match for partial matches
    for variant in category_variants:
        if variant in norm_text or norm_text in variant:
            # Penalize partial matches slightly
            return (True, 0.9)
    
    # Fuzzy match using sequence similarity
    best_score = 0.0
    for variant in category_variants:
        ratio = difflib.SequenceMatcher(None, norm_text, variant).ratio()
        best_score = max(best_score, ratio)
    
    if best_score >= threshold:
        return (True, best_score)
    
    return (False, 0.0)


def map_table_headers(
    table: List[List[str]],
    categories: Optional[HeaderMappingCategories] = None,
) -> Dict[int, MappedHeader]:
    """
    Map table headers to semantic column names.
    
    Args:
        table: List of rows, first row is headers
        categories: Semantic header categories
    
    Returns:
        Dict mapping column index to MappedHeader
    """
    if categories is None:
        categories = HeaderMappingCategories()
    
    if not table or not table[0]:
        return {}
    
    headers = table[0]
    mapped: Dict[int, MappedHeader] = {}
    
    for col_idx, header in enumerate(headers):
        header_text = str(header).strip()
        if not header_text:
            continue
        
        # Try to match against each category
        best_match: Optional[Tuple[str, float]] = None
        
        # Trade
        matched, conf = _fuzzy_match_header(header_text, categories.TRADE_VARIANTS)
        if matched and (best_match is None or conf > best_match[1]):
            best_match = ("trade", conf)
        
        # Employee ID
        matched, conf = _fuzzy_match_header(header_text, categories.EMPLOYEE_ID_VARIANTS)
        if matched and (best_match is None or conf > best_match[1]):
            best_match = ("employee_id", conf)
        
        # Hours
        matched, conf = _fuzzy_match_header(header_text, categories.HOURS_VARIANTS)
        if matched and (best_match is None or conf > best_match[1]):
            best_match = ("hours", conf)
        
        # Rate
        matched, conf = _fuzzy_match_header(header_text, categories.RATE_VARIANTS)
        if matched and (best_match is None or conf > best_match[1]):
            best_match = ("rate", conf)
        
        # Amount
        matched, conf = _fuzzy_match_header(header_text, categories.AMOUNT_VARIANTS)
        if matched and (best_match is None or conf > best_match[1]):
            best_match = ("amount", conf)
        
        # Project ID
        matched, conf = _fuzzy_match_header(header_text, categories.PROJECT_VARIANTS)
        if matched and (best_match is None or conf > best_match[1]):
            best_match = ("project_id", conf)
        
        # Date
        matched, conf = _fuzzy_match_header(header_text, categories.DATE_VARIANTS)
        if matched and (best_match is None or conf > best_match[1]):
            best_match = ("date", conf)
        
        # Store mapping if found
        if best_match:
            semantic_name, confidence = best_match
            mapped[col_idx] = MappedHeader(
                semantic_name=semantic_name,
                original_name=header_text,
                confidence=confidence,
                column_index=col_idx,
            )
    
    return mapped


def get_column_indices(
    mapped_headers: Dict[int, MappedHeader],
    required_semantics: List[str],
) -> Dict[str, int]:
    """
    Get column indices for required semantic columns.
    
    Args:
        mapped_headers: Result from map_table_headers()
        required_semantics: List of semantic names needed (e.g., ["trade", "hours", "amount"])
    
    Returns:
        Dict mapping semantic name to column index, or -1 if not found
    """
    result: Dict[str, int] = {semantic: -1 for semantic in required_semantics}
    
    for col_idx, mapped_header in mapped_headers.items():
        if mapped_header.semantic_name in result:
            result[mapped_header.semantic_name] = col_idx
    
    return result


def extract_row_by_semantics(
    row: List[Any],
    mapped_headers: Dict[int, MappedHeader],
    required_semantics: List[str],
) -> Dict[str, str]:
    """
    Extract row values by semantic column names.
    
    Args:
        row: Table row to extract from
        mapped_headers: Mapped header information
        required_semantics: Semantic column names to extract
    
    Returns:
        Dict mapping semantic name to cell value
    """
    result = {}
    col_indices = get_column_indices(mapped_headers, required_semantics)
    
    for semantic_name, col_idx in col_indices.items():
        if col_idx >= 0 and col_idx < len(row):
            result[semantic_name] = str(row[col_idx]).strip()
        else:
            result[semantic_name] = ""
    
    return result
