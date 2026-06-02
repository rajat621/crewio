"""
OCR noise tolerance and text cleanup.

Handles common OCR errors:
- 0→O, 1→l, S→5, 8→B, etc. (character confusion)
- Partial text from skew or blur
- Watermark overlap text
- Extra spaces/newlines
- Currency symbols vs letters
- Numbers in currency format

Strategy:
1. Identify likely OCR errors using context
2. Apply conditional corrections
3. Confidence scoring for corrections
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Dict, List, Optional, Tuple


@dataclass
class TextCleanupResult:
    """Result of OCR text cleanup."""
    original: str
    cleaned: str
    corrections_applied: List[str]  # List of corrections made
    confidence: float  # 0.0-1.0, how confident in cleaned version


class OCRNoiseHandler:
    """Handle common OCR errors and noise."""
    
    # Common OCR error substitutions (character → likely meant)
    OCR_CHAR_ERRORS = {
        '0': 'O',  # Zero → letter O
        '1': 'l',  # One → lowercase L
        '8': 'B',  # Eight → letter B
        '5': 'S',  # Five → letter S
        'O': '0',  # Letter O → Zero (context-dependent)
        'l': '1',  # Lowercase L → One (context-dependent)
        'I': '1',  # Capital I → One (context-dependent)
    }
    
    # Currency patterns (to avoid OCR confusion)
    CURRENCY_PATTERNS = [
        r'\bAED\b',
        r'\bUSD\b',
        r'\bGBP\b',
        r'\b£\b',
        r'\b€\b',
        r'\b¥\b',
    ]
    
    # Common financial keywords to protect from "correction"
    PROTECTED_KEYWORDS = {
        "total", "subtotal", "deduction", "amount", "payable",
        "hours", "rate", "date", "employee", "trade", "project",
        "vat", "tax", "gross", "net", "invoice", "payroll",
    }
    
    def __init__(self):
        pass
    
    def clean_financial_text(self, text: str) -> TextCleanupResult:
        """
        Clean OCR text with focus on financial accuracy.
        
        Args:
            text: OCR output text
        
        Returns:
            TextCleanupResult with cleaned text and confidence
        """
        original = text
        cleaned = text
        corrections: List[str] = []
        confidence = 1.0
        
        # 1. Remove excessive whitespace but preserve structure
        lines = cleaned.split('\n')
        lines = [' '.join(line.split()) for line in lines]
        cleaned = '\n'.join(lines)
        corrections.append("normalize_whitespace")
        
        # 2. Fix common currency/numeric OCR errors
        # (Be conservative - only fix in clear contexts)
        cleaned, currency_fixes = self._fix_currency_ocr(cleaned)
        corrections.extend(currency_fixes)
        
        # 3. Fix likely digit confusion in numeric contexts
        cleaned, digit_fixes = self._fix_digit_ocr(cleaned)
        corrections.extend(digit_fixes)
        
        # 4. Fix common word recognition errors
        cleaned, word_fixes = self._fix_word_ocr(cleaned)
        corrections.extend(word_fixes)
        
        # 5. Remove artifacts (watermarks, page numbers, etc.)
        cleaned, artifact_fixes = self._remove_artifacts(cleaned)
        corrections.extend(artifact_fixes)
        
        # Calculate confidence based on corrections made
        if len(corrections) > 10:
            confidence = 0.7  # Many corrections = lower confidence
        elif len(corrections) > 5:
            confidence = 0.85
        else:
            confidence = 0.95
        
        return TextCleanupResult(
            original=original,
            cleaned=cleaned,
            corrections_applied=corrections,
            confidence=confidence,
        )
    
    def _fix_currency_ocr(self, text: str) -> Tuple[str, List[str]]:
        """Fix common OCR errors in currency/amount context."""
        cleaned = text
        fixes = []
        
        # AED → AED (sometimes OCR produces different character)
        if 'AED' not in cleaned and any(c in cleaned for c in ['AE0', 'AEO', 'AE∂']):
            original_count = cleaned.count('AE')
            cleaned = re.sub(r'AE[0O∂]', 'AED', cleaned, flags=re.IGNORECASE)
            if cleaned.count('AED') > original_count:
                fixes.append("fix_currency_aed")
        
        # Remove common watermark patterns
        cleaned = re.sub(r'(?i)confidential|draft|copy|sample', '', cleaned)
        if len(fixes) == len(fixes):  # Just check if regex ran
            fixes.append("remove_watermark_keywords")
        
        return cleaned, fixes
    
    def _fix_digit_ocr(self, text: str) -> Tuple[str, List[str]]:
        """Fix digit confusion in numeric contexts."""
        cleaned = text
        fixes = []
        
        # In number sequences (e.g., "2023", "1234567"):
        # Fix 0→O, 1→l, 5→S, 8→B only in numeric contexts
        
        # Pattern: isolated letters within numbers (e.g., "20l3" → "2013")
        # Look for digit-letter-digit patterns
        def fix_digit_in_number(match):
            text = match.group(0)
            # If isolated letter surrounded by digits
            if len(text) == 3 and text[0].isdigit() and text[2].isdigit():
                middle = text[1]
                if middle == 'l' or middle == 'I':
                    return text[0] + '1' + text[2]
                elif middle == 'O':
                    return text[0] + '0' + text[2]
                elif middle == 'S':
                    return text[0] + '5' + text[2]
                elif middle == 'B':
                    return text[0] + '8' + text[2]
            return text
        
        original = cleaned
        cleaned = re.sub(r'\d[lIOSB8]\d', fix_digit_in_number, cleaned)
        if cleaned != original:
            fixes.append("fix_digit_letter_confusion")
        
        # Fix phone/ID patterns: common 0→O confusion
        # Pattern: sequences like "AE 1234 5678" (employee IDs)
        def fix_id_digit(match):
            text = match.group(0)
            # Replace standalone O with 0 in ID contexts
            return text.replace('O', '0')
        
        original = cleaned
        cleaned = re.sub(r'\b[A-Z]{2}\s+\d[O0]+\d*\b', fix_id_digit, cleaned)
        if cleaned != original:
            fixes.append("fix_id_pattern_zeros")
        
        return cleaned, fixes
    
    def _fix_word_ocr(self, text: str) -> Tuple[str, List[str]]:
        """Fix common word recognition errors."""
        cleaned = text
        fixes = []
        
        # Common word confusions in financial contexts
        corrections = {
            r'\btrai\b': 'trade',  # trai → trade
            r'\bprojeci\b': 'project',  # projeci → project
            r'\bdeductioi\b': 'deduction',  # deductioi → deduction
            r'\btotai\b': 'total',  # totai → total
            r'\bam0unt\b': 'amount',  # am0unt → amount
            r'\bpaiyabie\b': 'payable',  # paiyabie → payable
        }
        
        for pattern, replacement in corrections.items():
            original = cleaned
            cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)
            if cleaned != original:
                fixes.append(f"fix_word:{replacement}")
        
        return cleaned, fixes
    
    def _remove_artifacts(self, text: str) -> Tuple[str, List[str]]:
        """Remove common artifacts (page numbers, watermarks, etc.)."""
        cleaned = text
        fixes = []
        
        # Page numbers like "Page 1 of 3" or "- 1 -"
        original = cleaned
        cleaned = re.sub(r'(?i)page\s+\d+\s+of\s+\d+', '', cleaned)
        if cleaned != original:
            fixes.append("remove_page_numbers")
        
        # Isolated page number indicators: "- 1 -", etc.
        original = cleaned
        cleaned = re.sub(r'\s*-\s*\d+\s*-\s*', '', cleaned)
        if cleaned != original:
            fixes.append("remove_page_separators")
        
        # Remove repeated single characters (often OCR artifacts)
        original = cleaned
        cleaned = re.sub(r'\b([a-z])\1{3,}\b', r'\1', cleaned, flags=re.IGNORECASE)
        if cleaned != original:
            fixes.append("remove_repeated_chars")
        
        # Remove lines that are just symbols/noise
        lines = cleaned.split('\n')
        filtered_lines = [
            line for line in lines
            if not re.match(r'^[\s\-_=*]{3,}$', line)
        ]
        if len(filtered_lines) < len(lines):
            cleaned = '\n'.join(filtered_lines)
            fixes.append("remove_symbol_lines")
        
        return cleaned, fixes
    
    def clean_numeric_value(self, text: str) -> Optional[float]:
        """
        Clean and parse numeric value from OCR text.
        Handles currency symbols, thousands separators, etc.
        
        Returns:
            Parsed float value or None if unparseable
        """
        if not text:
            return None
        
        # Remove currency symbols and spaces
        cleaned = str(text).strip()
        cleaned = re.sub(r'[AED$€£¥]', '', cleaned)
        cleaned = re.sub(r'\s+', '', cleaned)
        
        # Fix common OCR: 0→O replacement in numbers
        # But only in numeric contexts
        if all(c in '0123456789.,lOIES5B8' for c in cleaned):
            # Try to identify and fix single-char errors
            cleaned = cleaned.replace('O', '0')  # O → 0
            cleaned = cleaned.replace('l', '1')  # l → 1
            cleaned = cleaned.replace('I', '1')  # I → 1
        
        # Remove multiple decimal points (keep first one)
        parts = cleaned.split('.')
        if len(parts) > 2:
            cleaned = parts[0] + '.' + ''.join(parts[1:])
        
        # Parse number
        try:
            # Handle thousands separator
            cleaned = cleaned.replace(',', '')
            return float(cleaned)
        except ValueError:
            return None


def clean_extraction_values(
    values: Dict[str, str],
    handler: Optional[OCRNoiseHandler] = None,
) -> Dict[str, str]:
    """
    Clean extracted values using OCR noise handler.
    
    Args:
        values: Dict of extracted values (e.g., {"trade": "Trai", "hours": "8.O"})
        handler: OCRNoiseHandler instance
    
    Returns:
        Cleaned values dict
    """
    if handler is None:
        handler = OCRNoiseHandler()
    
    cleaned_values = {}
    
    for key, value in values.items():
        if not value:
            cleaned_values[key] = value
            continue
        
        # Special handling for numeric fields
        if key in ("hours", "rate", "amount", "days", "qty"):
            numeric_val = handler.clean_numeric_value(value)
            if numeric_val is not None:
                cleaned_values[key] = str(numeric_val)
            else:
                cleaned_values[key] = value
        else:
            # For text fields, apply general cleanup
            result = handler.clean_financial_text(value)
            cleaned_values[key] = result.cleaned
    
    return cleaned_values
