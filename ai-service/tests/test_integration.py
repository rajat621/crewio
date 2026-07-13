"""
tests/test_integration.py

Integration tests for the full extraction pipeline.

These tests use synthetic PDF content (no real PDF files needed)
to verify the complete flow from classification through to
normalized invoice output.

All tests are self-contained — no external API calls, no files on disk.
"""

from __future__ import annotations

import io
import os
import sys
import tempfile
import unittest
from typing import Any, Dict
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from normalized_output import NormalizedInvoice, NormalizedInvoiceRow, NormalizedDeductions
from document_classifier import ClassificationResult, DocumentType
from extraction_validator import validate_and_repair
from hybrid_recovery import attempt_hybrid_recovery


# ---------------------------------------------------------------------------
# Synthetic PDF helpers
# ---------------------------------------------------------------------------

def _create_synthetic_digital_pdf(content: str) -> str:
    """
    Write a minimal text-based PDF to a temp file.
    pdfplumber can extract text from it.
    """
    try:
        from reportlab.pdfgen import canvas as rl_canvas
        from reportlab.lib.pagesizes import A4

        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        c = rl_canvas.Canvas(tmp.name, pagesize=A4)
        y = 750
        for line in content.splitlines():
            c.drawString(50, y, line)
            y -= 15
            if y < 50:
                c.showPage()
                y = 750
        c.save()
        tmp.close()
        return tmp.name
    except ImportError:
        # reportlab not available — create a stub file path
        return "/tmp/stub_digital.pdf"


def _make_vision_payload(rows_count: int = 3) -> Dict[str, Any]:
    """Build a realistic Gemini Vision API response payload."""
    employees = []
    for i in range(rows_count):
        trade = ["CARPENTER", "MASON", "HELPER", "PLUMBER", "ELECTRICIAN"][i % 5]
        hours = 200.0 + i * 10
        rate = 15.0 + i
        amount = round(hours * rate, 2)
        employees.append({
            "employee_id": f"EMP{1001 + i}",
            "employee_name": f"Worker {i + 1}",
            "trade": trade,
            "days_worked": 26,
            "hours_worked": hours,
            "rate": rate,
            "amount": amount,
            "project_id": f"P{100 + i}",
        })

    subtotal = round(sum(e["amount"] for e in employees), 2)
    deductions = 500.0
    adjusted = subtotal - deductions
    vat = round(adjusted * 0.05, 2)
    net = round(adjusted + vat, 2)

    return {
        "employees": employees,
        "deductions": {
            "mess": 200.0,
            "gas": 150.0,
            "transport": 150.0,
            "total": deductions,
        },
        "subtotal": subtotal,
        "vat_rate": 0.05,
        "vat": vat,
        "gross_total": round(subtotal + vat, 2),
        "net_total": net,
        "client_name": "AL BARAKA CONSTRUCTION LLC",
        "period_month": "October 2024",
        "invoice_no": "INV-2024-10-001",
    }


# ---------------------------------------------------------------------------
# Integration test: Digital PDF path
# ---------------------------------------------------------------------------

class TestDigitalPDFPath(unittest.TestCase):

    @patch("extraction_pipeline.classify_document")
    @patch("extraction_pipeline.extract_native")
    @patch("extraction_pipeline._vision_available", return_value=True)
    def test_digital_pdf_complete_flow(self, mock_vis, mock_native, mock_classify):
        """
        Digital PDF → native extraction succeeds →
        validation passes → renderer gets NormalizedInvoice.
        """
        mock_classify.return_value = ClassificationResult(
            document_type=DocumentType.DIGITAL,
            total_pages=2, digital_pages=2, scanned_pages=0,
            digital_ratio=1.0, avg_chars_per_page=800.0, confidence=0.95,
        )

        rows = [
            NormalizedInvoiceRow("CARPENTER", 200.0, 15.0, 3000.0, "EMP001", "Worker A", "P101"),
            NormalizedInvoiceRow("MASON", 180.0, 18.0, 3240.0, "EMP002", "Worker B", "P101"),
            NormalizedInvoiceRow("HELPER", 220.0, 12.0, 2640.0, "EMP003", "Worker C", "P102"),
        ]
        subtotal = sum(r.amount for r in rows)
        deductions = 300.0
        adjusted = subtotal - deductions
        vat = round(adjusted * 0.05, 4)
        net = round(adjusted + vat, 2)

        native_inv = NormalizedInvoice()
        native_inv.invoice_rows = rows
        native_inv.subtotal = subtotal
        native_inv.deductions = deductions
        native_inv.deduction_detail = NormalizedDeductions(total=deductions)
        native_inv.vat = vat
        native_inv.vat_rate = 0.05
        native_inv.net_total = net
        native_inv.gross_total = round(subtotal + vat, 2)
        native_inv.extraction_source = "native_pdf"
        native_inv.confidence = 0.95
        native_inv.client_name = "TEST CLIENT LLC"
        native_inv.period_month = "October 2024"
        mock_native.return_value = native_inv

        from extraction_pipeline import run_extraction_pipeline
        result = run_extraction_pipeline("test_digital.pdf")

        # Pipeline must succeed
        self.assertTrue(result.is_valid)
        self.assertEqual(result.extraction_source, "native_pdf")
        self.assertEqual(len(result.invoice_rows), 3)

        # Financial integrity
        self.assertAlmostEqual(result.subtotal, subtotal, places=2)
        self.assertAlmostEqual(result.deductions, deductions, places=2)
        self.assertGreater(result.vat, 0)
        self.assertGreater(result.net_total, 0)
        # net_total = (subtotal - deductions) + vat, so net > (subtotal - deductions)
        self.assertGreater(result.net_total, result.subtotal - result.deductions)
        # net_total should be less than subtotal + vat (deductions reduce the base)
        self.assertLessEqual(result.net_total, result.subtotal + result.vat)

        # Renderer contract: to_dict() must have all required keys
        d = result.to_dict()
        for key in ("invoice_rows", "subtotal", "deductions", "vat", "net_total", "confidence"):
            self.assertIn(key, d)

        # Each row must have required keys
        for row_dict in d["invoice_rows"]:
            for key in ("description", "quantity", "rate", "amount"):
                self.assertIn(key, row_dict)

    @patch("extraction_pipeline.classify_document")
    @patch("extraction_pipeline.extract_native")
    @patch("extraction_pipeline.extract_vision")
    @patch("extraction_pipeline._vision_available", return_value=True)
    def test_digital_pdf_native_empty_routes_to_vision(
        self, mock_vis, mock_vision, mock_native, mock_classify
    ):
        """
        Digital PDF where native returns no rows →
        pipeline routes to Vision automatically.
        """
        mock_classify.return_value = ClassificationResult(
            document_type=DocumentType.DIGITAL,
            total_pages=1, digital_pages=1, scanned_pages=0,
            digital_ratio=1.0, avg_chars_per_page=120.0, confidence=0.75,
        )

        # Native returns empty
        empty = NormalizedInvoice()
        empty.extraction_source = "native_pdf"
        mock_native.return_value = empty

        # Vision succeeds
        vision_inv = NormalizedInvoice()
        vision_inv.invoice_rows = [
            NormalizedInvoiceRow("CARPENTER", 200.0, 15.0, 3000.0)
        ]
        vision_inv.subtotal = 3000.0
        vision_inv.vat = 150.0
        vision_inv.net_total = 3150.0
        vision_inv.extraction_source = "vision"
        vision_inv.confidence = 0.88
        vision_inv.deduction_detail = NormalizedDeductions()
        mock_vision.return_value = vision_inv

        from extraction_pipeline import run_extraction_pipeline
        result = run_extraction_pipeline("test_digital_fallback.pdf")

        mock_native.assert_called_once()
        mock_vision.assert_called_once()
        self.assertTrue(result.is_valid)
        self.assertEqual(result.extraction_source, "vision")


# ---------------------------------------------------------------------------
# Integration test: Scanned PDF path
# ---------------------------------------------------------------------------

class TestScannedPDFPath(unittest.TestCase):

    @patch("extraction_pipeline.classify_document")
    @patch("extraction_pipeline.extract_vision")
    @patch("extraction_pipeline.extract_native")
    @patch("extraction_pipeline._vision_available", return_value=True)
    def test_scanned_pdf_uses_vision_primary(
        self, mock_vis_avail, mock_native, mock_vision, mock_classify
    ):
        """
        Scanned PDF → Vision is called directly (native skipped) →
        returns valid NormalizedInvoice.
        """
        mock_classify.return_value = ClassificationResult(
            document_type=DocumentType.SCANNED,
            total_pages=1, digital_pages=0, scanned_pages=1,
            digital_ratio=0.0, avg_chars_per_page=3.0, confidence=0.97,
        )

        vision_inv = NormalizedInvoice()
        vision_inv.invoice_rows = [
            NormalizedInvoiceRow("CARPENTER", 200.0, 15.0, 3000.0, "EMP001"),
            NormalizedInvoiceRow("MASON", 180.0, 18.0, 3240.0, "EMP002"),
        ]
        vision_inv.subtotal = 6240.0
        vision_inv.deductions = 400.0
        vision_inv.deduction_detail = NormalizedDeductions(mess=200.0, gas=200.0, total=400.0)
        vision_inv.vat = round((6240.0 - 400.0) * 0.05, 4)
        vision_inv.vat_rate = 0.05
        vision_inv.net_total = round(5840.0 + vision_inv.vat, 2)
        vision_inv.extraction_source = "vision"
        vision_inv.confidence = 0.91
        vision_inv.client_name = "GULF CONSTRUCTION CO"
        mock_vision.return_value = vision_inv

        from extraction_pipeline import run_extraction_pipeline
        result = run_extraction_pipeline("test_scanned.pdf")

        # Native must NOT have been called for scanned PDF
        mock_native.assert_not_called()
        mock_vision.assert_called_once()

        self.assertTrue(result.is_valid)
        self.assertEqual(result.extraction_source, "vision")
        self.assertEqual(len(result.invoice_rows), 2)
        self.assertEqual(result.client_name, "GULF CONSTRUCTION CO")

    @patch("extraction_pipeline.classify_document")
    @patch("extraction_pipeline.extract_vision")
    @patch("extraction_pipeline.extract_ocr")
    @patch("extraction_pipeline.extract_native")
    @patch("extraction_pipeline._vision_available", return_value=True)
    def test_scanned_pdf_vision_timeout_falls_back_to_ocr(
        self, mock_vis_avail, mock_native, mock_ocr, mock_vision, mock_classify
    ):
        """
        Scanned PDF → Vision times out → OCR fallback is triggered.
        OCR must only run AFTER Vision fails.
        """
        mock_classify.return_value = ClassificationResult(
            document_type=DocumentType.SCANNED,
            total_pages=1, digital_pages=0, scanned_pages=1,
            digital_ratio=0.0, avg_chars_per_page=2.0, confidence=0.97,
        )

        import requests
        mock_vision.side_effect = requests.Timeout("vision API timeout")

        ocr_inv = NormalizedInvoice()
        ocr_inv.invoice_rows = [
            NormalizedInvoiceRow("CARPENTER", 180.0, 15.0, 2700.0),
        ]
        ocr_inv.subtotal = 2700.0
        ocr_inv.vat = 135.0
        ocr_inv.net_total = 2835.0
        ocr_inv.extraction_source = "ocr"
        ocr_inv.confidence = 0.65
        ocr_inv.deduction_detail = NormalizedDeductions()
        mock_ocr.return_value = ocr_inv

        from extraction_pipeline import run_extraction_pipeline
        result = run_extraction_pipeline("test_scanned_timeout.pdf")

        mock_vision.assert_called_once()
        mock_ocr.assert_called_once()
        mock_native.assert_not_called()

        self.assertTrue(result.is_valid)
        self.assertIn(result.extraction_source, ("ocr", "hybrid"))


# ---------------------------------------------------------------------------
# Integration test: Hybrid recovery flow
# ---------------------------------------------------------------------------

class TestHybridFlow(unittest.TestCase):

    @patch("extraction_pipeline.classify_document")
    @patch("extraction_pipeline.extract_vision")
    @patch("extraction_pipeline.extract_ocr")
    @patch("extraction_pipeline.extract_native")
    @patch("extraction_pipeline._vision_available", return_value=True)
    def test_hybrid_vision_financials_plus_ocr_rows(
        self, mock_vis_avail, mock_native, mock_ocr, mock_vision, mock_classify
    ):
        """
        Vision extracts correct financial totals but returns zero employee rows.
        OCR extracts employee rows but poor financials.
        Pipeline must combine both → hybrid source.
        """
        mock_classify.return_value = ClassificationResult(
            document_type=DocumentType.SCANNED,
            total_pages=1, digital_pages=0, scanned_pages=1,
            digital_ratio=0.0, avg_chars_per_page=2.0, confidence=0.95,
        )

        # Vision: good financials, no employee rows (zero rows triggers OCR fallback)
        vision_inv = NormalizedInvoice()
        vision_inv.invoice_rows = []
        vision_inv.subtotal = 8500.0
        vision_inv.deductions = 600.0
        vision_inv.deduction_detail = NormalizedDeductions(mess=300.0, gas=300.0, total=600.0)
        vision_inv.vat = round((8500.0 - 600.0) * 0.05, 4)
        vision_inv.vat_rate = 0.05
        vision_inv.net_total = round(7900.0 + vision_inv.vat, 2)
        vision_inv.gross_total = round(8500.0 + vision_inv.vat, 2)
        vision_inv.extraction_source = "vision"
        vision_inv.confidence = 0.82
        mock_vision.return_value = vision_inv

        # OCR: has employee rows, weaker financials
        ocr_rows = [
            NormalizedInvoiceRow("CARPENTER", 200.0, 15.0, 3000.0, "EMP001"),
            NormalizedInvoiceRow("MASON", 220.0, 18.0, 3960.0, "EMP002"),
            NormalizedInvoiceRow("HELPER", 180.0, 12.0, 2160.0, "EMP003"),
        ]
        ocr_inv = NormalizedInvoice()
        ocr_inv.invoice_rows = ocr_rows
        ocr_inv.subtotal = sum(r.amount for r in ocr_rows)
        ocr_inv.deductions = 0.0
        ocr_inv.deduction_detail = NormalizedDeductions()
        ocr_inv.vat = 0.0
        ocr_inv.net_total = 0.0
        ocr_inv.extraction_source = "ocr"
        ocr_inv.confidence = 0.68
        mock_ocr.return_value = ocr_inv

        from extraction_pipeline import run_extraction_pipeline
        result = run_extraction_pipeline("test_hybrid.pdf")

        # Must be hybrid
        self.assertEqual(result.extraction_source, "hybrid")

        # Must have employee rows (from OCR)
        self.assertEqual(len(result.invoice_rows), 3)

        # Must have Vision financials (subtotal and deductions preserved)
        self.assertAlmostEqual(result.subtotal, 8500.0, places=1)
        self.assertAlmostEqual(result.deductions, 600.0, places=1)
        self.assertGreater(result.net_total, 0)

        # Renderer contract satisfied
        d = result.to_dict()
        self.assertEqual(len(d["invoice_rows"]), 3)
        self.assertAlmostEqual(d["subtotal"], 8500.0, places=1)


# ---------------------------------------------------------------------------
# Integration test: Validation repairs in full flow
# ---------------------------------------------------------------------------

class TestValidationInFullFlow(unittest.TestCase):

    @patch("extraction_pipeline.classify_document")
    @patch("extraction_pipeline.extract_vision")
    @patch("extraction_pipeline.extract_native")
    @patch("extraction_pipeline._vision_available", return_value=True)
    def test_ocr_x10_error_repaired_before_renderer(
        self, mock_vis_avail, mock_native, mock_vision, mock_classify
    ):
        """
        Vision returns an amount with x10 OCR error.
        Validator must repair it before the renderer sees the invoice.
        """
        mock_classify.return_value = ClassificationResult(
            document_type=DocumentType.SCANNED,
            total_pages=1, digital_pages=0, scanned_pages=1,
            digital_ratio=0.0, avg_chars_per_page=2.0, confidence=0.95,
        )

        # amount=150 should be 1500 (hours=100 * rate=15)
        bad_row = NormalizedInvoiceRow("CARPENTER", 100.0, 15.0, 150.0)

        vision_inv = NormalizedInvoice()
        vision_inv.invoice_rows = [bad_row]
        vision_inv.subtotal = 150.0   # wrong subtotal matches wrong amount
        vision_inv.deductions = 0.0
        vision_inv.deduction_detail = NormalizedDeductions()
        vision_inv.vat = 7.5
        vision_inv.vat_rate = 0.05
        vision_inv.net_total = 157.5
        vision_inv.extraction_source = "vision"
        vision_inv.confidence = 0.80
        mock_vision.return_value = vision_inv

        from extraction_pipeline import run_extraction_pipeline
        result = run_extraction_pipeline("test_repair.pdf")

        self.assertTrue(result.is_valid)
        # Repair must have corrected the amount
        self.assertEqual(result.invoice_rows[0].amount, 1500.0)
        self.assertAlmostEqual(result.subtotal, 1500.0, places=1)

    @patch("extraction_pipeline.classify_document")
    @patch("extraction_pipeline.extract_vision")
    @patch("extraction_pipeline.extract_native")
    @patch("extraction_pipeline._vision_available", return_value=True)
    def test_invalid_rows_rejected_flow_still_succeeds(
        self, mock_vis_avail, mock_native, mock_vision, mock_classify
    ):
        """
        Some rows violate sanity checks (hours > 400).
        Validator rejects them but keeps valid rows.
        Invoice is still generated from remaining valid rows.
        """
        mock_classify.return_value = ClassificationResult(
            document_type=DocumentType.SCANNED,
            total_pages=1, digital_pages=0, scanned_pages=1,
            digital_ratio=0.0, avg_chars_per_page=2.0, confidence=0.95,
        )

        rows = [
            NormalizedInvoiceRow("CARPENTER", 200.0, 15.0, 3000.0),   # valid
            NormalizedInvoiceRow("MASON", 500.0, 18.0, 9000.0),        # hours > 400, invalid
            NormalizedInvoiceRow("HELPER", 180.0, 12.0, 2160.0),       # valid
        ]

        vision_inv = NormalizedInvoice()
        vision_inv.invoice_rows = rows
        vision_inv.subtotal = sum(r.amount for r in rows)
        vision_inv.deductions = 0.0
        vision_inv.deduction_detail = NormalizedDeductions()
        vision_inv.vat = 0.0
        vision_inv.net_total = 0.0
        vision_inv.extraction_source = "vision"
        vision_inv.confidence = 0.85
        mock_vision.return_value = vision_inv

        from extraction_pipeline import run_extraction_pipeline
        result = run_extraction_pipeline("test_partial_valid.pdf")

        # Invoice should still be valid with 2 good rows
        self.assertTrue(result.is_valid)
        self.assertEqual(len(result.invoice_rows), 2)
        # Subtotal should be recalculated from the 2 valid rows
        expected_subtotal = 3000.0 + 2160.0
        self.assertAlmostEqual(result.subtotal, expected_subtotal, delta=50.0)


# ---------------------------------------------------------------------------
# Integration test: Normalized output contract enforced end-to-end
# ---------------------------------------------------------------------------

class TestNormalizedContractEndToEnd(unittest.TestCase):

    def _run_with_mock_vision(self, rows_count: int = 3) -> NormalizedInvoice:
        """Helper: run pipeline with mocked Vision returning N rows."""
        from extraction_pipeline import run_extraction_pipeline

        rows = [
            NormalizedInvoiceRow(
                f"TRADE_{i}", 200.0, 15.0 + i, round(200.0 * (15.0 + i), 2)
            )
            for i in range(rows_count)
        ]
        subtotal = sum(r.amount for r in rows)
        deductions = 200.0
        adjusted = subtotal - deductions
        vat = round(adjusted * 0.05, 4)
        net = round(adjusted + vat, 2)

        inv = NormalizedInvoice()
        inv.invoice_rows = rows
        inv.subtotal = subtotal
        inv.deductions = deductions
        inv.deduction_detail = NormalizedDeductions(total=deductions)
        inv.vat = vat
        inv.vat_rate = 0.05
        inv.net_total = net
        inv.gross_total = round(subtotal + vat, 2)
        inv.extraction_source = "vision"
        inv.confidence = 0.90

        classification = ClassificationResult(
            document_type=DocumentType.SCANNED,
            total_pages=1, digital_pages=0, scanned_pages=1,
            digital_ratio=0.0, avg_chars_per_page=2.0, confidence=0.95,
        )

        with patch("extraction_pipeline.classify_document", return_value=classification), \
             patch("extraction_pipeline.extract_vision", return_value=inv), \
             patch("extraction_pipeline._vision_available", return_value=True):
            return run_extraction_pipeline("test.pdf")

    def test_to_dict_structure_is_renderer_ready(self):
        """to_dict() output must be directly consumable by the renderer."""
        result = self._run_with_mock_vision(rows_count=3)
        d = result.to_dict()

        # Top-level required fields
        required_top = [
            "invoice_rows", "subtotal", "deductions", "deduction_detail",
            "vat_rate", "vat", "net_total", "gross_total", "confidence",
            "extraction_source", "warnings",
        ]
        for key in required_top:
            self.assertIn(key, d, f"Missing key: {key}")

        # Row-level required fields
        required_row = ["description", "quantity", "rate", "amount",
                        "employee_id", "employee_name", "project"]
        for row_dict in d["invoice_rows"]:
            for key in required_row:
                self.assertIn(key, row_dict, f"Missing row key: {key}")

    def test_financial_math_is_correct(self):
        """Validated invoice must satisfy: net_total = (subtotal - deductions) + vat."""
        result = self._run_with_mock_vision(rows_count=4)

        adjusted = result.subtotal - result.deductions
        expected_vat = round(adjusted * result.vat_rate, 4)
        expected_net = round(adjusted + expected_vat, 2)

        self.assertAlmostEqual(result.vat, expected_vat, places=2)
        self.assertAlmostEqual(result.net_total, expected_net, places=2)

    def test_confidence_is_between_0_and_1(self):
        result = self._run_with_mock_vision(rows_count=2)
        self.assertGreaterEqual(result.confidence, 0.0)
        self.assertLessEqual(result.confidence, 1.0)

    def test_extraction_source_is_string(self):
        result = self._run_with_mock_vision(rows_count=2)
        self.assertIsInstance(result.extraction_source, str)
        self.assertIn(result.extraction_source,
                      ("native_pdf", "vision", "ocr", "hybrid", "none"))


if __name__ == "__main__":
    unittest.main(verbosity=2)