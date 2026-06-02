#!/usr/bin/env python3
"""
TEST: Conditional Aggregation Logic

Verify that normalize_rows() correctly implements business rule:
- IF project_id exists: group by (trade, project_id)
- IF project_id missing: group by (trade)
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "ai-service"))

from schema import ExtractionResult, InvoiceRow, TimesheetFormat, InvoiceLayout, TimesheetMetadata, InvoiceFinancials
from generator.templates.dynamic_layout_engine import DynamicLayoutEngine

# =============================================================================
# TEST CASE A: Different projects for same trade must remain separate
# =============================================================================

print("\n" + "="*80)
print("TEST CASE A: STEEL FIXER + P1506 vs STEEL FIXER + P960")
print("Expected: 2 SEPARATE rows (not merged)")
print("="*80)

rows_a = [
    InvoiceRow(
        trade="STEEL FIXER",
        hours=40.0,
        rate=50.0,
        amount=2000.0,
        project_id="P1506",
    ),
    InvoiceRow(
        trade="STEEL FIXER",
        hours=35.0,
        rate=50.0,
        amount=1750.0,
        project_id="P960",
    ),
]

result_a = ExtractionResult(
    success=True,
    format=TimesheetFormat.MCC,
    layout=InvoiceLayout.PROJECT_BASED,
    rows=rows_a,
    financials=InvoiceFinancials(),
    metadata=TimesheetMetadata(),
    confidence=0.95,
)

engine = DynamicLayoutEngine()
normalized_a = engine.normalize_rows(result_a)

print(f"\nInput rows: {len(rows_a)}")
for i, r in enumerate(rows_a, 1):
    print(f"  {i}. {r.trade} | Project={r.project_id} | Hours={r.hours} | Amount={r.amount}")

print(f"\nNormalized rows: {len(normalized_a)}")
for i, r in enumerate(normalized_a, 1):
    print(f"  {i}. {r['trade']} | Project={r['project_id']} | Hours={r['hours']} | Amount={r['amount']}")

assert len(normalized_a) == 2, f"FAIL: Expected 2 rows, got {len(normalized_a)}"
assert normalized_a[0]["project_id"] == "P1506", f"FAIL: Row 0 project_id mismatch"
assert normalized_a[1]["project_id"] == "P960", f"FAIL: Row 1 project_id mismatch"
assert normalized_a[0]["hours"] == 40.0, f"FAIL: Row 0 hours should be 40.0"
assert normalized_a[1]["hours"] == 35.0, f"FAIL: Row 1 hours should be 35.0"

print("\n✓ PASS: Projects remain separate")

# =============================================================================
# TEST CASE B: Same trade without project must aggregate
# =============================================================================

print("\n" + "="*80)
print("TEST CASE B: MASON (no project) × 3 entries")
print("Expected: 1 MERGED row with aggregated totals")
print("="*80)

rows_b = [
    InvoiceRow(
        trade="MASON",
        hours=30.0,
        rate=45.0,
        amount=1350.0,
        project_id=None,
    ),
    InvoiceRow(
        trade="MASON",
        hours=25.0,
        rate=45.0,
        amount=1125.0,
        project_id=None,
    ),
    InvoiceRow(
        trade="MASON",
        hours=10.0,
        rate=45.0,
        amount=450.0,
        project_id=None,
    ),
]

result_b = ExtractionResult(
    success=True,
    format=TimesheetFormat.BKC,
    layout=InvoiceLayout.EMPLOYEE_BASED,
    rows=rows_b,
    financials=InvoiceFinancials(),
    metadata=TimesheetMetadata(),
    confidence=0.95,
)

normalized_b = engine.normalize_rows(result_b)

print(f"\nInput rows: {len(rows_b)}")
for i, r in enumerate(rows_b, 1):
    print(f"  {i}. {r.trade} | Project={r.project_id} | Hours={r.hours} | Amount={r.amount}")

print(f"\nNormalized rows: {len(normalized_b)}")
for i, r in enumerate(normalized_b, 1):
    print(f"  {i}. {r['trade']} | Project={r['project_id']} | Hours={r['hours']} | Amount={r['amount']}")

assert len(normalized_b) == 1, f"FAIL: Expected 1 merged row, got {len(normalized_b)}"
assert normalized_b[0]["hours"] == 65.0, f"FAIL: Aggregated hours should be 65.0, got {normalized_b[0]['hours']}"
assert normalized_b[0]["amount"] == 2925.0, f"FAIL: Aggregated amount should be 2925.0, got {normalized_b[0]['amount']}"

print("\n✓ PASS: Entries merged correctly with aggregation")

# =============================================================================
# TEST CASE C: Complex mix - Projects separate, non-project aggregates
# =============================================================================

print("\n" + "="*80)
print("TEST CASE C: Complex mix - MASON (P1), MASON (P2), MASON (none) × 2")
print("Expected: 3 rows - P1 separate, P2 separate, no-project merged")
print("="*80)

rows_c = [
    InvoiceRow(trade="MASON", hours=20.0, rate=45.0, amount=900.0, project_id="P1"),
    InvoiceRow(trade="MASON", hours=15.0, rate=45.0, amount=675.0, project_id="P2"),
    InvoiceRow(trade="MASON", hours=10.0, rate=45.0, amount=450.0, project_id=None),
    InvoiceRow(trade="MASON", hours=5.0, rate=45.0, amount=225.0, project_id=None),
]

result_c = ExtractionResult(
    success=True,
    format=TimesheetFormat.GENERIC,
    layout=InvoiceLayout.PROJECT_BASED,
    rows=rows_c,
    financials=InvoiceFinancials(),
    metadata=TimesheetMetadata(),
    confidence=0.95,
)

normalized_c = engine.normalize_rows(result_c)

print(f"\nInput rows: {len(rows_c)}")
for i, r in enumerate(rows_c, 1):
    print(f"  {i}. {r.trade} | Project={r.project_id} | Hours={r.hours} | Amount={r.amount}")

print(f"\nNormalized rows: {len(normalized_c)}")
for i, r in enumerate(normalized_c, 1):
    print(f"  {i}. {r['trade']} | Project={r['project_id']} | Hours={r['hours']} | Amount={r['amount']}")

assert len(normalized_c) == 3, f"FAIL: Expected 3 rows, got {len(normalized_c)}"

# Find rows by project_id
rows_by_proj = {(r["trade"], r["project_id"]): r for r in normalized_c}

assert ("MASON", "P1") in rows_by_proj, "FAIL: P1 row missing"
assert ("MASON", "P2") in rows_by_proj, "FAIL: P2 row missing"
assert ("MASON", None) in rows_by_proj, "FAIL: No-project row missing"

assert rows_by_proj[("MASON", "P1")]["hours"] == 20.0, "FAIL: P1 hours"
assert rows_by_proj[("MASON", "P2")]["hours"] == 15.0, "FAIL: P2 hours"
assert rows_by_proj[("MASON", None)]["hours"] == 15.0, f"FAIL: No-project hours should be 15.0 (merged), got {rows_by_proj[('MASON', None)]['hours']}"

print("\n✓ PASS: Complex mix aggregates correctly")

# =============================================================================
# TEST CASE D: Deductions and Overtime aggregation
# =============================================================================

print("\n" + "="*80)
print("TEST CASE D: Deductions and Overtime aggregation")
print("Expected: Deductions and Overtime also aggregate when merging")
print("="*80)

rows_d = [
    InvoiceRow(
        trade="ELECTRICIAN",
        hours=30.0,
        rate=60.0,
        amount=1800.0,
        project_id=None,
        deduction_total=100.0,
        overtime_hours=5.0,
    ),
    InvoiceRow(
        trade="ELECTRICIAN",
        hours=20.0,
        rate=60.0,
        amount=1200.0,
        project_id=None,
        deduction_total=50.0,
        overtime_hours=3.0,
    ),
]

result_d = ExtractionResult(
    success=True,
    format=TimesheetFormat.MCC,
    layout=InvoiceLayout.EMPLOYEE_BASED,
    rows=rows_d,
    financials=InvoiceFinancials(),
    metadata=TimesheetMetadata(),
    confidence=0.95,
)

normalized_d = engine.normalize_rows(result_d)

print(f"\nInput rows: {len(rows_d)}")
for i, r in enumerate(rows_d, 1):
    print(f"  {i}. {r.trade} | Hours={r.hours} | Amount={r.amount} | Deductions={r.deduction_total} | OT={r.overtime_hours}")

print(f"\nNormalized rows: {len(normalized_d)}")
for i, r in enumerate(normalized_d, 1):
    print(f"  {i}. {r['trade']} | Hours={r['hours']} | Amount={r['amount']} | Deductions={r['deductions']} | OT={r['overtime']}")

assert len(normalized_d) == 1, f"FAIL: Expected 1 merged row, got {len(normalized_d)}"
assert normalized_d[0]["hours"] == 50.0, f"FAIL: Hours should be 50.0"
assert normalized_d[0]["amount"] == 3000.0, f"FAIL: Amount should be 3000.0"
assert normalized_d[0]["deductions"] == 150.0, f"FAIL: Deductions should be 150.0, got {normalized_d[0]['deductions']}"
assert normalized_d[0]["overtime"] == 8.0, f"FAIL: Overtime should be 8.0, got {normalized_d[0]['overtime']}"

print("\n✓ PASS: Deductions and Overtime aggregate correctly")

# =============================================================================
# SUMMARY
# =============================================================================

print("\n" + "="*80)
print("AGGREGATION LOGIC VERIFICATION: ALL TESTS PASSED ✓")
print("="*80)
print("\nBusiness Rule Implementation Verified:")
print("  ✓ IF project_id exists:  group by (trade, project_id)")
print("  ✓ IF project_id missing: group by (trade)")
print("  ✓ Aggregation includes hours, amount, deductions, overtime")
print("  ✓ Test cases: A, B, C, D all verified")
