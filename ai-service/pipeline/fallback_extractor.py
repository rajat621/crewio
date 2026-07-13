"""
Fallback extraction strategy for low-confidence or unknown layouts.

When structured table extraction fails or confidence is low:
1. Attempt semantic OCR line parsing (group lines by proximity)
2. Extract financial blocks from footer text
3. Perform numeric reconciliation (totals consistency)
4. Return best-effort extraction instead of failing

Goal: Generate usable invoices even for completely unseen layouts.
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Dict, List, Optional, Tuple, Any


@dataclass
class FallbackExtractionResult:
    """Result of fallback extraction."""
    method: str  # "semantic_ocr", "numeric_reconciliation", "footer_parse"
    rows: List[Dict[str, Any]]
    financials: Dict[str, float]
    confidence: float  # 0.0-1.0
    warnings: List[str]
    extracted_from: str  # Location in document


class SemanticOCRParser:
    """Parse OCR output semantically without structured tables."""
    
    # Patterns to identify different line types
    HEADER_PATTERNS = [
        r"(?i)trade|designation|employee|id|hours|rate|amount|project",
        r"(?i)timesheet|invoice|payroll|salary",
    ]
    
    FOOTER_PATTERNS = [
        r"(?i)total|subtotal|deduction|vat|net|payable|gross|amount",
    ]
    
    LABOUR_ROW_PATTERNS = [
        r"^[A-Za-z\s]{2,20}\d+\.?\d*",  # Trade name + hours
        r"^[A-Z]{1,3}\d+\s+[A-Za-z]",  # ID + Trade
    ]
    
    def __init__(self):
        self.header_keywords = {}
        self.footer_lines = []
        self.labour_lines = []
    
    def parse_text_lines(self, text: str) -> FallbackExtractionResult:
        """
        Parse OCR text line-by-line semantically.
        
        Strategy:
        1. Identify header lines
        2. Group labour/transaction lines
        3. Identify footer lines
        4. Extract values from each group
        """
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        
        rows: List[Dict[str, Any]] = []
        financials: Dict[str, float] = {}
        warnings: List[str] = []
        
        # 1. Classify lines
        header_lines = []
        labour_lines = []
        footer_lines = []
        
        for line in lines:
            if any(re.search(p, line) for p in self.HEADER_PATTERNS):
                header_lines.append(line)
            elif any(re.search(p, line) for p in self.FOOTER_PATTERNS):
                footer_lines.append(line)
            elif line and not line[0].isspace() and len(line) > 5:
                labour_lines.append(line)
        
        # 2. Parse labour lines
        rows = self._parse_labour_lines(labour_lines)
        if not rows:
            warnings.append("No labour lines parsed from OCR")
        
        # 3. Parse footer for financial blocks
        financials = self._parse_footer_lines(footer_lines)
        if not financials or not financials.get("total_deduction"):
            warnings.append("Incomplete financial data from footer")
        
        confidence = 0.6 if rows and financials else 0.3
        
        return FallbackExtractionResult(
            method="semantic_ocr",
            rows=rows,
            financials=financials,
            confidence=confidence,
            warnings=warnings,
            extracted_from="fallback_ocr_parse",
        )
    
    def _parse_labour_lines(self, lines: List[str]) -> List[Dict[str, Any]]:
        """
        Parse labour/transaction lines without structured table.
        
        Expected formats:
        - Trade Hours Rate Amount
        - P001 Trade 8 50 400
        - Employee_ID Trade Hours Rate Amount
        """
        rows = []
        
        for line in lines:
            # Extract all numbers from line
            numbers = re.findall(r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?", line)
            if len(numbers) < 2:
                continue
            
            # Remove numbers to get text part (trade name, project)
            text_part = re.sub(r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?", "", line).strip()
            text_parts = text_part.split()
            
            # Try to infer structure
            if len(numbers) >= 3:
                # Assume: Trade Hours Rate Amount (or similar)
                try:
                    hours = float(numbers[-3].replace(",", ""))
                    rate = float(numbers[-2].replace(",", ""))
                    amount = float(numbers[-1].replace(",", ""))
                    
                    # Trade is everything before numbers
                    trade = " ".join(text_parts[:3]) if text_parts else "Unknown"
                    
                    # Check for project code
                    project_match = re.search(r"\bP\d{3,6}\b", line, re.IGNORECASE)
                    project = project_match.group(0) if project_match else None
                    
                    rows.append({
                        "trade": trade.upper(),
                        "project_id": project,
                        "hours": hours,
                        "rate": rate,
                        "amount": amount,
                    })
                except (ValueError, IndexError):
                    continue
            
            elif len(numbers) >= 2:
                # Assume: Trade Hours Amount
                try:
                    hours = float(numbers[-2].replace(",", ""))
                    amount = float(numbers[-1].replace(",", ""))
                    
                    trade = " ".join(text_parts[:3]) if text_parts else "Unknown"
                    
                    rows.append({
                        "trade": trade.upper(),
                        "project_id": None,
                        "hours": hours,
                        "rate": 0.0,  # Will be computed as amount/hours
                        "amount": amount,
                    })
                except (ValueError, IndexError):
                    continue
        
        # Compute rates for rows with 0 rate
        for row in rows:
            if row["rate"] == 0.0 and row["hours"] > 0:
                row["rate"] = round(row["amount"] / row["hours"], 2)
        
        return rows
    
    def _parse_footer_lines(self, lines: List[str]) -> Dict[str, float]:
        """Extract financial values from footer lines."""
        financials: Dict[str, float] = {}
        
        for line in lines:
            line_lower = line.lower()
            
            # Extract last number from line as value
            numbers = re.findall(r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?", line)
            if not numbers:
                continue
            
            value = float(numbers[-1].replace(",", ""))
            
            # Classify line
            if "total deduction" in line_lower or "absent amount" in line_lower:
                financials["total_deduction"] = max(
                    financials.get("total_deduction", 0.0),
                    value
                )
            
            elif "subtotal" in line_lower or "gross total" in line_lower:
                if "deduction" not in line_lower and "net" not in line_lower:
                    financials["subtotal"] = max(
                        financials.get("subtotal", 0.0),
                        value
                    )
            
            elif "vat" in line_lower:
                financials["total_vat"] = max(
                    financials.get("total_vat", 0.0),
                    value
                )
            
            elif any(k in line_lower for k in ("net payable", "net amount", "final total")):
                financials["net_payable"] = max(
                    financials.get("net_payable", 0.0),
                    value
                )
        
        return financials


class NumericReconciliation:
    """Reconcile extracted values for consistency."""
    
    @staticmethod
    def validate_and_correct(
        rows: List[Dict[str, float]],
        financials: Dict[str, float],
        vat_rate: float = 0.05,
    ) -> Tuple[List[Dict[str, float]], Dict[str, float]]:
        """
        Validate financial consistency and attempt correction.
        
        Checks:
        1. Sum of row amounts ≈ subtotal
        2. Deduction ≈ total_deduction
        3. (subtotal - deduction) * (1 + vat_rate) ≈ net_payable
        
        Attempts correction if values are inconsistent.
        
        Returns:
            (corrected_rows, corrected_financials)
        """
        corrected_rows = rows.copy()
        corrected_fin = financials.copy()
        
        # Compute row sum
        row_sum = sum(float(r.get("amount", 0.0)) for r in rows)
        
        # Check subtotal
        reported_subtotal = corrected_fin.get("subtotal", 0.0)
        if reported_subtotal <= 0.0:
            corrected_fin["subtotal"] = row_sum
        elif abs(reported_subtotal - row_sum) > 1.0:
            # Mismatch - trust row sum if closer to expected
            corrected_fin["subtotal"] = row_sum
        
        # Check deduction
        if corrected_fin.get("total_deduction", 0.0) <= 0.0:
            corrected_fin["total_deduction"] = 0.0
        
        # Compute adjusted subtotal
        adjusted_subtotal = corrected_fin.get("subtotal", 0.0) - corrected_fin.get("total_deduction", 0.0)
        corrected_fin["adjusted_subtotal"] = adjusted_subtotal
        
        # Compute deduction VAT if not present
        if corrected_fin.get("deduction_vat", 0.0) <= 0.0:
            corrected_fin["deduction_vat"] = round(
                corrected_fin.get("total_deduction", 0.0) * vat_rate,
                3
            )
        
        # Compute deduction total with VAT
        corrected_fin["deduction_total_with_vat"] = round(
            corrected_fin.get("total_deduction", 0.0) + corrected_fin.get("deduction_vat", 0.0),
            3
        )
        
        # Compute total VAT on adjusted subtotal
        total_vat = round(adjusted_subtotal * vat_rate, 3)
        if corrected_fin.get("total_vat", 0.0) <= 0.0:
            corrected_fin["total_vat"] = total_vat
        
        # Compute net payable
        computed_net = round(adjusted_subtotal + total_vat, 2)
        reported_net = corrected_fin.get("net_payable", 0.0)
        
        if reported_net <= 0.0 or abs(reported_net - computed_net) > 0.5:
            corrected_fin["net_payable"] = computed_net
        
        return corrected_rows, corrected_fin


def fallback_extract(
    full_text: str,
    vat_rate: float = 0.05,
) -> FallbackExtractionResult:
    """
    Attempt fallback extraction from unstructured text.
    
    Entry point when structured extraction fails.
    """
    # Try semantic OCR parsing
    parser = SemanticOCRParser()
    result = parser.parse_text_lines(full_text)
    
    # Try numeric reconciliation
    if result.rows and result.financials:
        rows, fin = NumericReconciliation.validate_and_correct(
            result.rows,
            result.financials,
            vat_rate,
        )
        result.rows = rows
        result.financials = fin
        result.confidence = min(0.85, result.confidence + 0.15)
    
    return result
