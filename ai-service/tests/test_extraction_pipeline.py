"""
tests/test_extraction_pipeline.py

Test suite for the 6-step extraction pipeline.

Tests cover:
- Document classification
- Extraction routing (native → vision → ocr)
- Fallback logic
- Hybrid recovery
- Validation layer
- Normalized output contract
- Sanity checks and repairs
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch

# Ensure ai-service root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from normalized_output import (
    NormalizedDeductions,
    NormalizedInvoice,
    NormalizedInvoiceRow,
    repair_row,
    sanity_check_row,
)
from document_classifier import ClassificationResult, DocumentType
from extraction_validator import validate_and_repair
from hybrid_recovery import attempt_hybrid_recovery


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_row(
    description="CARPENTER",
    quantity=100.0,
    rate=15.0,
    amount=1500.0,
    employee_id="",
    project="",
) -> NormalizedInvoiceRow:
    return NormalizedInvoiceRow(
        description=description,
        quantity=quantity,
        rate=rate,
        amount=amount,
        employee_id=employee_id,
        project=project,
    )


def _make_invoice(
    rows: Optional[List[NormalizedInvoiceRow]] = None,
    subtotal: float = 0.0,
    deductions: float = 0.0,
    vat: float = 0.0,
    net_total: float = 0.0,
    source: str = "vision",
    confidence: float = 0.85,
) -> NormalizedInvoice:
    """
    Build a NormalizedInvoice for testing.
    subtotal=0 means "not reported" — the validator must derive it.
    Pass subtotal explicitly when testing financial consistency checks.
    """
    inv = NormalizedInvoice()
    inv.invoice_rows = rows or []
    inv.subtotal = subtotal          # kept as-is; 0 means "missing"
    inv.deductions = deductions
    inv.vat = vat
    inv.net_total = net_total
    inv.extraction_source = source
    inv.confidence = confidence
    inv.deduction_detail = NormalizedDeductions(total=deductions)
    return inv


# ---------------------------------------------------------------------------
# 1. Normalized output contract
# ---------------------------------------------------------------------------

class TestNormalizedOutput(unittest.TestCase):

    def test_row_to_dict_contains_required_keys(self):
        row = _make_row()
        d = row.to_dict()
        for key in ("description", "quantity", "rate", "amount", "employee_id", "project"):
            self.assertIn(key, d)

    def test_invoice_to_dict_contains_required_keys(self):
        inv = _make_invoice(rows=[_make_row()], subtotal=1500, net_total=1500)
        d = inv.to_dict()
        for key in ("invoice_rows", "subtotal", "deductions", "vat", "net_total",
                    "confidence", "extraction_source"):
            self.assertIn(key, d)

    def test_invoice_is_valid_requires_rows_and_subtotal(self):
        inv = _make_invoice(rows=[], subtotal=0)
        self.assertFalse(inv.is_valid)

        inv2 = _make_invoice(rows=[_make_row()], subtotal=1500, net_total=1500)
        self.assertTrue(inv2.is_valid)

    def test_invoice_with_error_is_invalid(self):
        inv = _make_invoice(rows=[_make_row()], subtotal=1500, net_total=1500)
        inv.error = "SOMETHING_FAILED"
        self.assertFalse(inv.is_valid)

    def test_renderer_cannot_see_extraction_source_affects_output(self):
        """Renderer output must be identical regardless of extraction_source."""
        for source in ("native_pdf", "vision", "ocr", "hybrid"):
            inv = _make_invoice(rows=[_make_row()], subtotal=1500, net_total=1500, source=source)
            d = inv.to_dict()
            # invoice_rows structure is identical regardless of source
            self.assertEqual(len(d["invoice_rows"]), 1)
            self.assertEqual(d["invoice_rows"][0]["amount"], 1500.0)


# ---------------------------------------------------------------------------
# 2. Sanity checks per spec
# ---------------------------------------------------------------------------

class TestSanityChecks(unittest.TestCase):

    def test_hours_exceeding_400_rejected(self):
        row = _make_row(quantity=401.0, rate=15.0, amount=6015.0)
        violations = sanity_check_row(row)
        self.assertTrue(any("hours_exceeds_limit" in v for v in violations))

    def test_rate_exceeding_500_rejected(self):
        row = _make_row(quantity=100.0, rate=501.0, amount=50100.0)
        violations = sanity_check_row(row)
        self.assertTrue(any("rate_exceeds_limit" in v for v in violations))

    def test_amount_exceeding_500000_rejected(self):
        row = _make_row(quantity=100.0, rate=400.0, amount=500001.0)
        violations = sanity_check_row(row)
        self.assertTrue(any("amount_exceeds_limit" in v for v in violations))

    def test_valid_row_passes_sanity(self):
        row = _make_row(quantity=200.0, rate=15.0, amount=3000.0)
        violations = sanity_check_row(row)
        self.assertEqual(violations, [])


# ---------------------------------------------------------------------------
# 3. Repair logic
# ---------------------------------------------------------------------------

class TestRepairs(unittest.TestCase):

    def test_amount_x10_repair(self):
        """If amount is ~1/10 of hours*rate, multiply by 10."""
        row = _make_row(quantity=100.0, rate=15.0, amount=150.0)  # should be 1500
        repaired, repairs = repair_row(row)
        self.assertEqual(repaired.amount, 1500.0)
        self.assertTrue(any("x10" in r for r in repairs))

    def test_amount_x100_repair(self):
        """If amount is ~1/100 of hours*rate, multiply by 100."""
        row = _make_row(quantity=100.0, rate=15.0, amount=15.0)  # should be 1500
        repaired, repairs = repair_row(row)
        self.assertEqual(repaired.amount, 1500.0)
        self.assertTrue(any("x100" in r for r in repairs))

    def test_hours_derived_when_missing(self):
        """If hours=0 but rate and amount exist, derive hours."""
        row = _make_row(quantity=0.0, rate=15.0, amount=1500.0)
        repaired, repairs = repair_row(row)
        self.assertAlmostEqual(repaired.quantity, 100.0)
        self.assertTrue(any("hours_derived" in r for r in repairs))

    def test_amount_derived_when_missing(self):
        """If amount=0 but hours and rate exist, derive amount."""
        row = _make_row(quantity=100.0, rate=15.0, amount=0.0)
        repaired, repairs = repair_row(row)
        self.assertEqual(repaired.amount, 1500.0)
        self.assertTrue(any("amount_derived" in r for r in repairs))

    def test_valid_row_needs_no_repair(self):
        row = _make_row(quantity=100.0, rate=15.0, amount=1500.0)
        repaired, repairs = repair_row(row)
        self.assertEqual(repairs, [])
        self.assertEqual(repaired.amount, 1500.0)


# ---------------------------------------------------------------------------
# 4. Validation layer
# ---------------------------------------------------------------------------

class TestValidationLayer(unittest.TestCase):

    def test_valid_invoice_passes(self):
        rows = [_make_row(quantity=100, rate=15, amount=1500)]
        inv = _make_invoice(rows=rows, subtotal=1500, vat=75, net_total=1575)
        validated, report = validate_and_repair(inv)
        self.assertTrue(report.passed)
        self.assertEqual(report.employee_count, 1)

    def test_subtotal_derived_from_rows_when_missing(self):
        rows = [_make_row(quantity=100, rate=15, amount=1500)]
        inv = _make_invoice(rows=rows, subtotal=0)
        validated, report = validate_and_repair(inv)
        self.assertEqual(validated.subtotal, 1500.0)
        self.assertTrue(any("subtotal_derived_from_rows" in r for r in report.repairs_applied))

    def test_vat_recomputed_when_inconsistent(self):
        rows = [_make_row(quantity=100, rate=15, amount=1500)]
        inv = _make_invoice(rows=rows, subtotal=1500, vat=999)  # wrong VAT
        inv.vat_rate = 0.05
        validated, report = validate_and_repair(inv)
        self.assertAlmostEqual(validated.vat, 75.0, places=1)

    def test_net_total_recomputed_when_missing(self):
        rows = [_make_row(quantity=100, rate=15, amount=1500)]
        inv = _make_invoice(rows=rows, subtotal=1500, vat=75, net_total=0)
        validated, report = validate_and_repair(inv)
        self.assertAlmostEqual(validated.net_total, 1575.0, places=1)

    def test_rows_violating_sanity_are_rejected(self):
        rows = [
            _make_row(quantity=100, rate=15, amount=1500),   # valid
            _make_row(quantity=500, rate=15, amount=7500),   # hours > 400, invalid
        ]
        inv = _make_invoice(rows=rows, subtotal=9000)
        validated, report = validate_and_repair(inv)
        self.assertEqual(len(validated.invoice_rows), 1)
        self.assertTrue(len(report.row_violations) > 0)

    def test_no_rows_fails_validation(self):
        inv = _make_invoice(rows=[], subtotal=0)
        validated, report = validate_and_repair(inv)
        self.assertFalse(report.passed)

    def test_deductions_exceeding_subtotal_flagged(self):
        rows = [_make_row(quantity=100, rate=15, amount=1500)]
        inv = _make_invoice(rows=rows, subtotal=1500, deductions=2000)
        validated, report = validate_and_repair(inv)
        self.assertTrue(any("deductions_exceed" in w for w in report.financial_warnings))


# ---------------------------------------------------------------------------
# 5. Hybrid recovery
# ---------------------------------------------------------------------------

class TestHybridRecovery(unittest.TestCase):

    def test_vision_complete_no_merge_needed(self):
        rows = [_make_row(quantity=100, rate=15, amount=1500)]
        vision = _make_invoice(rows=rows, subtotal=1500, vat=75, net_total=1575, source="vision")
        ocr = _make_invoice(rows=[], subtotal=0, source="ocr")
        result = attempt_hybrid_recovery(vision, ocr)
        self.assertEqual(result.extraction_source, "vision")

    def test_vision_financials_plus_ocr_rows(self):
        """Vision has correct financials but no rows → use OCR rows."""
        ocr_rows = [_make_row(quantity=100, rate=15, amount=1500)]
        vision = _make_invoice(rows=[], subtotal=1500, vat=75, net_total=1575, source="vision")
        ocr = _make_invoice(rows=ocr_rows, subtotal=1500, source="ocr")
        result = attempt_hybrid_recovery(vision, ocr)
        self.assertEqual(result.extraction_source, "hybrid")
        self.assertEqual(len(result.invoice_rows), 1)
        self.assertEqual(result.subtotal, 1500.0)  # from Vision
        self.assertTrue(any("vision_financials" in w for w in result.warnings))

    def test_vision_rows_with_mismatched_financials_recomputed(self):
        """Vision has rows but financial totals don't match → recompute."""
        rows = [_make_row(quantity=100, rate=15, amount=1500)]
        vision = _make_invoice(rows=rows, subtotal=9999, vat=75, net_total=9999, source="vision")
        ocr = _make_invoice(rows=[], subtotal=0, source="ocr")
        result = attempt_hybrid_recovery(vision, ocr)
        self.assertEqual(result.extraction_source, "hybrid")
        self.assertEqual(result.subtotal, 1500.0)  # recomputed from rows

    def test_both_weak_prefers_ocr_when_more_rows(self):
        """When both are weak, prefer source with more rows."""
        vision_rows = [_make_row()]
        ocr_rows = [_make_row(), _make_row(description="MASON")]
        vision = _make_invoice(rows=vision_rows, subtotal=1500, confidence=0.3, source="vision")
        ocr = _make_invoice(rows=ocr_rows, subtotal=3000, confidence=0.4, source="ocr")
        result = attempt_hybrid_recovery(vision, ocr)
        self.assertEqual(len(result.invoice_rows), 2)


# ---------------------------------------------------------------------------
# 6. Document classification
# ---------------------------------------------------------------------------

class TestDocumentClassification(unittest.TestCase):

    def test_digital_classification_fields(self):
        result = ClassificationResult(
            document_type=DocumentType.DIGITAL,
            total_pages=3,
            digital_pages=3,
            scanned_pages=0,
            digital_ratio=1.0,
            avg_chars_per_page=500.0,
            confidence=0.9,
        )
        self.assertEqual(result.document_type, DocumentType.DIGITAL)
        self.assertEqual(result.digital_ratio, 1.0)

    def test_scanned_classification_fields(self):
        result = ClassificationResult(
            document_type=DocumentType.SCANNED,
            total_pages=2,
            digital_pages=0,
            scanned_pages=2,
            digital_ratio=0.0,
            avg_chars_per_page=5.0,
            confidence=0.95,
        )
        self.assertEqual(result.document_type, DocumentType.SCANNED)

    def test_mixed_classification_fields(self):
        result = ClassificationResult(
            document_type=DocumentType.MIXED,
            total_pages=4,
            digital_pages=2,
            scanned_pages=2,
            digital_ratio=0.5,
            avg_chars_per_page=200.0,
            confidence=0.85,
        )
        self.assertEqual(result.document_type, DocumentType.MIXED)


# ---------------------------------------------------------------------------
# 7. Extraction routing (mocked)
# ---------------------------------------------------------------------------

class TestExtractionRouting(unittest.TestCase):

    @patch("extraction_pipeline.classify_document")
    @patch("extraction_pipeline.extract_native")
    @patch("extraction_pipeline.extract_vision")
    @patch("extraction_pipeline.extract_ocr")
    @patch("extraction_pipeline._vision_available", return_value=True)
    def test_digital_pdf_uses_native_first(
        self, mock_vis_avail, mock_ocr, mock_vision, mock_native, mock_classify
    ):
        """Digital PDF must try native extraction first."""
        mock_classify.return_value = ClassificationResult(
            document_type=DocumentType.DIGITAL,
            total_pages=1, digital_pages=1, scanned_pages=0,
            digital_ratio=1.0, avg_chars_per_page=500.0, confidence=0.9,
        )
        native_invoice = _make_invoice(
            rows=[_make_row()], subtotal=1500, vat=75, net_total=1575, source="native_pdf"
        )
        mock_native.return_value = native_invoice

        from extraction_pipeline import run_extraction_pipeline
        result = run_extraction_pipeline("fake.pdf")

        mock_native.assert_called_once()
        mock_vision.assert_not_called()  # Vision not called when native succeeds
        mock_ocr.assert_not_called()     # OCR not called when native succeeds
        self.assertEqual(result.extraction_source, "native_pdf")

    @patch("extraction_pipeline.classify_document")
    @patch("extraction_pipeline.extract_native")
    @patch("extraction_pipeline.extract_vision")
    @patch("extraction_pipeline.extract_ocr")
    @patch("extraction_pipeline._vision_available", return_value=True)
    def test_scanned_pdf_skips_native_uses_vision(
        self, mock_vis_avail, mock_ocr, mock_vision, mock_native, mock_classify
    ):
        """Scanned PDF must skip native and use Vision."""
        mock_classify.return_value = ClassificationResult(
            document_type=DocumentType.SCANNED,
            total_pages=1, digital_pages=0, scanned_pages=1,
            digital_ratio=0.0, avg_chars_per_page=5.0, confidence=0.95,
        )
        vision_invoice = _make_invoice(
            rows=[_make_row()], subtotal=1500, vat=75, net_total=1575, source="vision"
        )
        mock_vision.return_value = vision_invoice

        from extraction_pipeline import run_extraction_pipeline
        result = run_extraction_pipeline("fake_scan.pdf")

        mock_native.assert_not_called()   # native not used for scanned
        mock_vision.assert_called_once()
        mock_ocr.assert_not_called()      # OCR not called when Vision succeeds
        self.assertEqual(result.extraction_source, "vision")

    @patch("extraction_pipeline.classify_document")
    @patch("extraction_pipeline.extract_native")
    @patch("extraction_pipeline.extract_vision")
    @patch("extraction_pipeline.extract_ocr")
    @patch("extraction_pipeline._vision_available", return_value=True)
    def test_vision_failure_triggers_ocr_fallback(
        self, mock_vis_avail, mock_ocr, mock_vision, mock_native, mock_classify
    ):
        """When Vision fails (raises), OCR must be called as fallback."""
        mock_classify.return_value = ClassificationResult(
            document_type=DocumentType.SCANNED,
            total_pages=1, digital_pages=0, scanned_pages=1,
            digital_ratio=0.0, avg_chars_per_page=5.0, confidence=0.95,
        )
        mock_vision.side_effect = RuntimeError("GEMINI_TIMEOUT")
        ocr_invoice = _make_invoice(
            rows=[_make_row()], subtotal=1500, net_total=1500, source="ocr"
        )
        mock_ocr.return_value = ocr_invoice

        from extraction_pipeline import run_extraction_pipeline
        result = run_extraction_pipeline("fake_scan.pdf")

        mock_vision.assert_called_once()
        mock_ocr.assert_called_once()    # OCR triggered after Vision failure
        self.assertIn(result.extraction_source, ("ocr", "hybrid"))

    @patch("extraction_pipeline.classify_document")
    @patch("extraction_pipeline.extract_native")
    @patch("extraction_pipeline.extract_vision")
    @patch("extraction_pipeline.extract_ocr")
    @patch("extraction_pipeline._vision_available", return_value=True)
    def test_vision_zero_rows_triggers_ocr_fallback(
        self, mock_vis_avail, mock_ocr, mock_vision, mock_native, mock_classify
    ):
        """When Vision returns zero employees, OCR fallback must run."""
        mock_classify.return_value = ClassificationResult(
            document_type=DocumentType.SCANNED,
            total_pages=1, digital_pages=0, scanned_pages=1,
            digital_ratio=0.0, avg_chars_per_page=5.0, confidence=0.95,
        )
        # Vision succeeds but returns no employees
        mock_vision.return_value = _make_invoice(rows=[], subtotal=1500, source="vision")
        ocr_invoice = _make_invoice(
            rows=[_make_row()], subtotal=1500, net_total=1500, source="ocr"
        )
        mock_ocr.return_value = ocr_invoice

        from extraction_pipeline import run_extraction_pipeline
        result = run_extraction_pipeline("fake_scan.pdf")

        mock_ocr.assert_called_once()   # OCR triggered because Vision had 0 employees

    @patch("extraction_pipeline.classify_document")
    @patch("extraction_pipeline.extract_native")
    @patch("extraction_pipeline.extract_vision")
    @patch("extraction_pipeline.extract_ocr")
    @patch("extraction_pipeline._vision_available", return_value=False)
    def test_no_vision_key_goes_to_ocr(
        self, mock_vis_avail, mock_ocr, mock_vision, mock_native, mock_classify
    ):
        """When Gemini is not configured, skip Vision and use OCR."""
        mock_classify.return_value = ClassificationResult(
            document_type=DocumentType.SCANNED,
            total_pages=1, digital_pages=0, scanned_pages=1,
            digital_ratio=0.0, avg_chars_per_page=5.0, confidence=0.95,
        )
        ocr_invoice = _make_invoice(
            rows=[_make_row()], subtotal=1500, net_total=1500, source="ocr"
        )
        mock_ocr.return_value = ocr_invoice

        from extraction_pipeline import run_extraction_pipeline
        result = run_extraction_pipeline("fake_scan.pdf")

        mock_vision.assert_not_called()  # Vision skipped, no API key
        mock_ocr.assert_called_once()

    @patch("extraction_pipeline.classify_document")
    @patch("extraction_pipeline.extract_native")
    @patch("extraction_pipeline.extract_vision")
    @patch("extraction_pipeline.extract_ocr")
    @patch("extraction_pipeline._vision_available", return_value=True)
    def test_native_fails_then_vision_used(
        self, mock_vis_avail, mock_ocr, mock_vision, mock_native, mock_classify
    ):
        """Digital PDF where native extraction fails must route to Vision."""
        mock_classify.return_value = ClassificationResult(
            document_type=DocumentType.DIGITAL,
            total_pages=1, digital_pages=1, scanned_pages=0,
            digital_ratio=1.0, avg_chars_per_page=500.0, confidence=0.9,
        )
        # Native returns empty (insufficient)
        mock_native.return_value = _make_invoice(rows=[], subtotal=0, source="native_pdf")
        vision_invoice = _make_invoice(
            rows=[_make_row()], subtotal=1500, vat=75, net_total=1575, source="vision"
        )
        mock_vision.return_value = vision_invoice

        from extraction_pipeline import run_extraction_pipeline
        result = run_extraction_pipeline("fake.pdf")

        mock_native.assert_called_once()
        mock_vision.assert_called_once()  # Vision used when native insufficient
        mock_ocr.assert_not_called()      # OCR not needed, Vision succeeded


# ---------------------------------------------------------------------------
# 8. Extraction source is transparent to renderer
# ---------------------------------------------------------------------------

class TestRendererSourceAgnostic(unittest.TestCase):
    """
    The renderer must produce identical invoice structure
    regardless of which extractor was used.
    """

    def _invoice_dict_for_source(self, source: str) -> dict:
        rows = [_make_row(quantity=200, rate=20, amount=4000)]
        inv = _make_invoice(
            rows=rows, subtotal=4000, deductions=200, vat=190, net_total=3990, source=source
        )
        inv.vat_rate = 0.05
        validated, _ = validate_and_repair(inv)
        return validated.to_dict()

    def test_invoice_rows_identical_across_sources(self):
        sources = ["native_pdf", "vision", "ocr", "hybrid"]
        dicts = [self._invoice_dict_for_source(s) for s in sources]

        # Invoice row structure must be identical
        for d in dicts:
            self.assertEqual(len(d["invoice_rows"]), 1)
            self.assertEqual(d["invoice_rows"][0]["description"], "CARPENTER")
            self.assertEqual(d["invoice_rows"][0]["amount"], 4000.0)

    def test_financial_totals_identical_across_sources(self):
        sources = ["native_pdf", "vision", "ocr", "hybrid"]
        dicts = [self._invoice_dict_for_source(s) for s in sources]

        subtotals = [d["subtotal"] for d in dicts]
        self.assertTrue(all(s == subtotals[0] for s in subtotals))


if __name__ == "__main__":
    unittest.main(verbosity=2)