"""
tests/test_spec_requirements.py

Targeted tests for the specific behaviors called out in the system spec:
  - trade name normalization (whitelist-free)
  - OCR numeric error repair
  - invoice grouping rules (project_id+trade / trade-only, never employee_id)
  - bottom-up financial reconstruction (row sum wins over reported summary)
  - per-field confidence + manual review flagging
"""

from __future__ import annotations

from confidence_engine import score_invoice_confidence, get_review_threshold
from extraction_validator import validate_and_repair
from invoice_grouper import group_rows_for_invoice
from normalized_output import NormalizedInvoice, NormalizedInvoiceRow
from ocr_repair import repair_numeric_string, safe_float_with_repair
from trade_normalizer import build_trade_canonicalizer, normalize_trade_name


class TestTradeNormalization:
    def test_camelcase_variants_collapse(self):
        variants = ["SteelFixer", "Steel Fixer", "Steel-Fixer", "Steelfixer"]
        normalized = {normalize_trade_name(v) for v in variants}
        assert normalized == {"STEEL FIXER"}

    def test_ocr_letter_confusion_repaired(self):
        assert normalize_trade_name("STEEL F1XER") == "STEEL FIXER"

    def test_unknown_trade_still_normalizes(self):
        # Per spec: must generalize to ANY supplier's trade vocabulary,
        # not just a fixed whitelist.
        result = normalize_trade_name("Pipe-Insulation Technician")
        assert result == "PIPE INSULATION TECHNICIAN"

    def test_canonicalizer_collapses_within_document(self):
        canon = build_trade_canonicalizer()
        a = canon("Steel Fixer")
        b = canon("STEELFIXER")  # slightly different OCR read, same doc
        assert a == b == "STEEL FIXER"

    def test_empty_input_returns_empty(self):
        assert normalize_trade_name("") == ""
        assert normalize_trade_name(None) == ""


class TestOcrNumericRepair:
    def test_spec_examples(self):
        assert repair_numeric_string("132O") == "132"
        assert repair_numeric_string("13Z") == "132"
        assert repair_numeric_string("I32") == "132"
        assert repair_numeric_string("1O0") == "100"

    def test_safe_float_matches_repair(self):
        assert safe_float_with_repair("132O") == 132.0
        assert safe_float_with_repair("13Z") == 132.0
        assert safe_float_with_repair("I32") == 132.0
        assert safe_float_with_repair("1O0") == 100.0

    def test_clean_numbers_unaffected(self):
        assert safe_float_with_repair("100") == 100.0
        assert safe_float_with_repair("99.50") == 99.5
        assert safe_float_with_repair("1,234.50") == 1234.5

    def test_non_numeric_returns_default(self):
        assert safe_float_with_repair("not a number", default=0.0) == 0.0


class TestInvoiceGrouping:
    def test_project_based_groups_by_project_and_trade(self):
        rows = [
            NormalizedInvoiceRow(description="SteelFixer", quantity=8, rate=20, amount=160, project="P1506", employee_id="E1"),
            NormalizedInvoiceRow(description="Steel-Fixer", quantity=8, rate=20, amount=160, project="P1506", employee_id="E2"),
            NormalizedInvoiceRow(description="Steel Fixer", quantity=8, rate=22, amount=176, project="P960", employee_id="E3"),
        ]
        groups = group_rows_for_invoice(rows)
        keys = {(g.project_id, g.trade) for g in groups}
        assert keys == {("P1506", "STEEL FIXER"), ("P960", "STEEL FIXER")}
        p1506 = next(g for g in groups if g.project_id == "P1506")
        assert p1506.total_hours == 16.0
        assert p1506.total_amount == 320.0
        assert p1506.employee_count == 2

    def test_trade_only_when_no_project(self):
        rows = [
            NormalizedInvoiceRow(description="Carpenter", quantity=8, rate=20, amount=160, employee_id="E1"),
            NormalizedInvoiceRow(description="Carpenter", quantity=8, rate=20, amount=160, employee_id="E2"),
            NormalizedInvoiceRow(description="Mason", quantity=8, rate=18, amount=144, employee_id="E3"),
        ]
        groups = group_rows_for_invoice(rows)
        trades = {g.trade for g in groups}
        assert trades == {"CARPENTER", "MASON"}
        assert all(g.project_id == "" for g in groups)
        carpenter = next(g for g in groups if g.trade == "CARPENTER")
        assert carpenter.employee_count == 2
        assert carpenter.total_amount == 320.0

    def test_employee_id_never_used_for_grouping(self):
        # Two different employees, same trade, same project -> ONE group
        rows = [
            NormalizedInvoiceRow(description="Helper", quantity=8, rate=10, amount=80, project="P1", employee_id="EMP-001"),
            NormalizedInvoiceRow(description="Helper", quantity=8, rate=10, amount=80, project="P1", employee_id="EMP-002"),
        ]
        groups = group_rows_for_invoice(rows)
        assert len(groups) == 1
        assert groups[0].employee_count == 2

    def test_empty_rows_returns_empty(self):
        assert group_rows_for_invoice([]) == []


class TestBottomUpReconstruction:
    def test_row_sum_wins_over_wildly_wrong_summary(self):
        inv = NormalizedInvoice()
        inv.extraction_source = "vision"
        inv.invoice_rows = [
            NormalizedInvoiceRow(description="Mason", quantity=8, rate=20, amount=160),
            NormalizedInvoiceRow(description="Helper", quantity=8, rate=10, amount=80),
        ]
        inv.subtotal = 5000.0  # implausible supplier-reported summary
        inv.vat_rate = 0.05

        final, report = validate_and_repair(inv)

        # row sum = 240; reconstructed subtotal must reflect employee-level
        # data, not the implausible reported summary
        assert final.subtotal == 240.0
        assert any("subtotal_replaced_by_row_sum" in r for r in report.repairs_applied)

    def test_no_reported_subtotal_derives_from_rows(self):
        inv = NormalizedInvoice()
        inv.extraction_source = "ocr"
        inv.invoice_rows = [
            NormalizedInvoiceRow(description="Plumber", quantity=8, rate=25, amount=200),
        ]
        inv.subtotal = 0.0
        final, report = validate_and_repair(inv)
        assert final.subtotal == 200.0


class TestConfidenceEngine:
    def test_native_pdf_has_high_base_confidence(self):
        inv = NormalizedInvoice()
        inv.extraction_source = "native_pdf"
        inv.invoice_rows = [
            NormalizedInvoiceRow(description="Mason", quantity=8, rate=20, amount=160),
        ]
        report = score_invoice_confidence(inv, repairs_applied=[])
        assert report["row_confidences"][0]["overall_confidence"] > 0.9

    def test_ocr_low_confidence_flags_for_review(self):
        inv = NormalizedInvoice()
        inv.extraction_source = "ocr"
        inv.invoice_rows = [
            NormalizedInvoiceRow(description="Mason", quantity=8, rate=20, amount=160),
        ]
        threshold = get_review_threshold()
        report = score_invoice_confidence(inv, repairs_applied=[], threshold=threshold)
        # OCR base confidence (0.65) is below the default review threshold (0.75)
        assert report["row_confidences"][0]["needs_review"] is True
        assert 0 in report["rows_needing_review"]

    def test_every_field_has_a_confidence_value(self):
        inv = NormalizedInvoice()
        inv.extraction_source = "vision"
        inv.invoice_rows = [
            NormalizedInvoiceRow(description="Welder", quantity=8, rate=25, amount=200, project="P1"),
        ]
        report = score_invoice_confidence(inv, repairs_applied=[])
        fields = {f["field"] for f in report["row_confidences"][0]["fields"]}
        assert {"trade", "hours", "rate", "amount", "project"}.issubset(fields)
        for f in report["row_confidences"][0]["fields"]:
            assert 0.0 <= f["confidence"] <= 1.0
