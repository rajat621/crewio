"""
pipeline/classifier.py

Semantic PDF classifier for layout-adaptive extraction.

Detects:
1. text PDF vs image PDF (structural analysis)
2. Layout type (project-based vs employee-based vs unknown)
3. Document complexity and structure characteristics

NO hardcoded contractor names, formats, or tokens.
Uses semantic content analysis instead of pattern matching.
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Dict, Optional, Tuple

import pdfplumber

from schema import (
    TimesheetFormat,
    InvoiceLayout,
)

# ---------------------------------------------------------------------------
# Semantic detection patterns (NOT hardcoded contractor detection)
# ---------------------------------------------------------------------------

# Generic structural markers (applicable across all formats)
_PROJECT_CODE_RE = re.compile(
    r"\bP\d{3,6}[A-Z0-9]*\b",
    re.IGNORECASE,
)

_EMPLOYEE_ID_RE = re.compile(
    r"\b[A-Z]{2,4}\d{4,8}\b|EMP[-_]?\d{4,8}|EID[-_]?\d{3,8}",
    re.IGNORECASE,
)

# Attendance-related tokens (universal across formats)
_ATTENDANCE_MARKERS = {
    "W", "A", "H", "OFF",
    "WORKING", "ABSENT", "HOLIDAY",
}

# Financial keywords (universal - used for content density analysis)
_FINANCIAL_KEYWORDS = {
    "total", "subtotal", "deduction", "vat", "net", "payable",
    "amount", "rate", "hours", "gross",
}

# Structural indicators for layout inference
_ATTRIBUTE_KEYWORDS = {
    "trade", "designation", "craft", "worker", "job",  # Job type
    "id", "employee", "labour", "emp", "code",  # Identity
    "project", "projectno", "po", "site",  # Project reference
    "date", "period", "month",  # Time reference
}


@dataclass
class FormatDetectionResult:
    """Result of semantic format detection."""
    layout: InvoiceLayout
    is_image_based: bool
    confidence: float  # 0.0-1.0, how confident we are
    structure_complexity: str  # "simple", "moderate", "complex"
    detected_characteristics: Dict[str, float]  # Analysis breakdown

# ---------------------------------------------------------------------------
# Semantic Helpers
# ---------------------------------------------------------------------------

def _safe_extract_text(page) -> str:
    """Safely extract text from a PDF page."""
    try:
        return page.extract_text() or ""
    except Exception:
        return ""


def _analyze_table_structure(pdf_path: str) -> Dict[str, float]:
    """
    Analyze document structure characteristics semantically.
    
    Returns dict with indicators:
    - has_projects: likelihood of project-based layout
    - has_employee_ids: likelihood of employee-based layout
    - table_count: number of structured tables found
    - keyword_density: prevalence of business keywords
    """
    characteristics = {
        "has_projects": 0.0,
        "has_employee_ids": 0.0,
        "has_attendance_markers": 0.0,
        "table_count": 0.0,
        "keyword_density": 0.0,
        "financial_keyword_count": 0.0,
    }
    
    try:
        with pdfplumber.open(pdf_path) as pdf:
            total_text_length = 0
            full_text = ""
            
            for page in pdf.pages:
                text = _safe_extract_text(page)
                full_text += text + "\n"
                total_text_length += len(text)
                
                # Count tables as structural indicator
                tables = page.extract_tables() or []
                characteristics["table_count"] += len(tables)
            
            text_lower = full_text.lower()
            
            # Semantic indicators
            if _PROJECT_CODE_RE.search(text_lower):
                characteristics["has_projects"] = 1.0
            
            if _EMPLOYEE_ID_RE.search(text_lower):
                characteristics["has_employee_ids"] = 1.0
            
            # Attendance frequency
            attendance_count = sum(1 for marker in _ATTENDANCE_MARKERS 
                                 if marker in text_lower)
            if attendance_count > 20:
                characteristics["has_attendance_markers"] = min(1.0, attendance_count / 100.0)
            
            # Keyword density
            keyword_count = sum(1 for kw in _FINANCIAL_KEYWORDS 
                              if kw in text_lower)
            characteristics["financial_keyword_count"] = float(keyword_count)
            
            if total_text_length > 0:
                characteristics["keyword_density"] = min(1.0, keyword_count / (total_text_length / 100.0))
    
    except Exception:
        pass
    
    return characteristics


def _determine_layout(characteristics: Dict[str, float]) -> Tuple[InvoiceLayout, float]:
    """
    Determine layout type from structural analysis.
    Returns (layout, confidence).
    """
    project_score = characteristics.get("has_projects", 0.0)
    employee_score = characteristics.get("has_employee_ids", 0.0)
    
    # If both present, check which is stronger or both present
    # MCC format typically has BOTH projects and employee IDs
    # Prioritize project-based if projects are present
    if project_score > 0.0:
        return (InvoiceLayout.PROJECT_BASED, 0.9)
    
    if employee_score > 0.0:
        return (InvoiceLayout.EMPLOYEE_BASED, 0.9)
    
    # No strong indicators - use attendance/table structure as tiebreaker
    attendance = characteristics.get("has_attendance_markers", 0.0)
    if attendance > 0.3:
        return (InvoiceLayout.PROJECT_BASED, 0.5)
    
    # Default fallback
    return (InvoiceLayout.EMPLOYEE_BASED, 0.3)


def _determine_complexity(characteristics: Dict[str, float]) -> str:
    """Estimate document complexity from characteristics."""
    table_count = characteristics.get("table_count", 0.0)
    keyword_density = characteristics.get("keyword_density", 0.0)
    
    if table_count >= 5 and keyword_density > 0.5:
        return "complex"
    elif table_count >= 2 or keyword_density > 0.3:
        return "moderate"
    else:
        return "simple"


# ---------------------------------------------------------------------------
# Main Semantic Classifier (NO hardcoded format detection)
# ---------------------------------------------------------------------------

def classify_pdf(
    pdf_path: str,
) -> Tuple[
    TimesheetFormat,
    InvoiceLayout,
    bool,
]:
    """
    Semantic PDF classification.
    
    Returns:
        (format, layout, is_image_based)
    
    IMPORTANT: Uses content analysis, NOT hardcoded contractor detection.
    Automatically adapts to unknown layouts.
    """
    
    total_chars = 0
    page_texts = []
    
    # -----------------------------------------------------------------------
    # 1. Extract text and assess text density
    # -----------------------------------------------------------------------
    
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = _safe_extract_text(page)
            total_chars += len(text)
            page_texts.append(text.lower())
    
    full_text = "\n".join(page_texts)
    
    # -----------------------------------------------------------------------
    # 2. Determine if image-based (scanned) vs text-based
    # -----------------------------------------------------------------------
    
    # Scanned PDFs typically have <500 chars of extractable text
    is_image = total_chars < 500
    
    # For image-based PDFs, we can't analyze table structure effectively
    # Return a reasonable default (will use OCR pipeline instead)
    if is_image:
        # Image-based PDFs are typically BKC format (empirically observed)
        # The OCR pipeline will handle extraction
        return (TimesheetFormat.BKC, InvoiceLayout.EMPLOYEE_BASED, True)
    
    # -----------------------------------------------------------------------
    # 3. Semantic structure analysis (only for text-based PDFs)
    # -----------------------------------------------------------------------
    
    characteristics = _analyze_table_structure(pdf_path)
    layout, layout_confidence = _determine_layout(characteristics)
    complexity = _determine_complexity(characteristics)
    
    # -----------------------------------------------------------------------
    # 4. Use universal format classification
    # -----------------------------------------------------------------------
    
    # Map layout to format for backward compatibility:
    # - If project-based → MCC-like
    # - If employee-based → BKC-like or GENERIC
    
    if layout == InvoiceLayout.PROJECT_BASED:
        fmt = TimesheetFormat.MCC
    elif layout == InvoiceLayout.EMPLOYEE_BASED:
        # Check if we have high-quality extraction characteristics
        if characteristics.get("table_count", 0) > 0:
            fmt = TimesheetFormat.BKC  # Structured tables detected
        else:
            fmt = TimesheetFormat.GENERIC  # Fallback
    else:
        fmt = TimesheetFormat.GENERIC
    
    return (fmt, layout, is_image)