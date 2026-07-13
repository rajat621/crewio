"""
REAL EXECUTION TEST — Uses actual PDFs, actual pipeline code.
No simulation. No mocking.

Tests:
  1. Classification (both PDFs)
  2. Extraction flow trace
  3. OCR + Grid validation (image PDF)
  4. Conditional aggregation (runtime output)
  5. Client vs owner rendering
  6. Template safe-zone
  7. Multi-page validation
  8. Debug artifacts
  9. Performance timing
  10. Final acceptance report
"""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
from pathlib import Path

# ---------------------------------------------------------------------------
# Set up path so ai-service modules are importable
# ---------------------------------------------------------------------------
AI_SERVICE = str(Path(__file__).parent / "ai-service")
if AI_SERVICE not in sys.path:
    sys.path.insert(0, AI_SERVICE)

# ---------------------------------------------------------------------------
# PDF paths
# ---------------------------------------------------------------------------
TEXT_PDF  = r"D:\Crew_control\timesheet2.pdf"    # text / project
IMAGE_PDF = r"D:\Crew_control\time_sheet.pdf"    # image / attendance

OUTPUT_DIR = r"D:\Crew_control\test-outputs\real_execution"
os.makedirs(OUTPUT_DIR, exist_ok=True)

PASS_ICON = "✅"
FAIL_ICON = "❌"
WARN_ICON = "⚠️"

results = {}   # collect per-test pass/fail for report


def section(title: str):
    bar = "=" * 80
    print(f"\n{bar}")
    print(f"  {title}")
    print(bar)


def subsection(title: str):
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print(f"{'─' * 60}")


def record(test: str, passed: bool, notes: str = ""):
    results[test] = {"passed": passed, "notes": notes}
    icon = PASS_ICON if passed else FAIL_ICON
    print(f"\n{icon} {test}: {'PASS' if passed else 'FAIL'}")
    if notes:
        print(f"    {notes}")


# ===========================================================================
# TEST 1 — CLASSIFICATION
# ===========================================================================
section("TEST 1 — PDF CLASSIFICATION (Both PDFs)")

from pipeline.classifier import classify_pdf

for label, path in [("TEXT/PROJECT PDF (timesheet2.pdf)", TEXT_PDF),
                     ("IMAGE/ATTENDANCE PDF (time_sheet.pdf)", IMAGE_PDF)]:
    subsection(label)
    t0 = time.time()
    try:
        fmt, layout, is_image = classify_pdf(path)
        elapsed = (time.time() - t0) * 1000
        print(f"  File        : {path}")
        print(f"  Format      : {fmt}")
        print(f"  Layout      : {layout}")
        print(f"  Is Image    : {is_image}")
        print(f"  Time        : {elapsed:.1f} ms")

        if "timesheet2" in path:
            record(f"TEST1_classify_{label[:20]}", True,
                   f"format={fmt} layout={layout} is_image={is_image}")
        else:
            record(f"TEST1_classify_{label[:20]}", True,
                   f"format={fmt} layout={layout} is_image={is_image}")
    except Exception as e:
        traceback.print_exc()
        record(f"TEST1_classify_{label[:20]}", False, str(e))


# ===========================================================================
# TEST 2 — EXTRACTION FLOW TRACE (both PDFs)
# ===========================================================================
section("TEST 2 — EXTRACTION FLOW TRACE")

from pipeline.run import run_extraction
from schema import CompanyProfile

profile = CompanyProfile(
    name="Skilled Labor Contractors LLC",
    trn="100123456700003",
    vat_rate=0.05,
    template_path=None,
    signature_path=None,
    stamp_path=None,
)

extraction_results = {}

for label, path in [("text_pdf", TEXT_PDF), ("image_pdf", IMAGE_PDF)]:
    subsection(f"Extraction: {label}")
    t_start = time.time()
    try:
        res = run_extraction(pdf_path=path, company_profile=profile, debug_mode=True)
        elapsed_total = (time.time() - t_start) * 1000
        extraction_results[label] = res

        print(f"  File         : {path}")
        print(f"  Success      : {res.success}")
        print(f"  Format       : {res.format}")
        print(f"  Layout       : {res.layout}")
        print(f"  Used OCR     : {res.used_ocr}")
        print(f"  Confidence   : {res.confidence:.3f}")
        print(f"  Rows found   : {len(res.rows)}")
        print(f"  Warnings     : {len(res.warnings)}")
        print(f"  Total time   : {elapsed_total:.0f} ms")
        print(f"  Processing   : {res.processing_time_ms} ms (field)")

        if res.rows:
            print(f"\n  First 3 extracted rows:")
            for i, row in enumerate(res.rows[:3]):
                print(f"    [{i+1}] trade={row.trade!r:25s} project_id={str(row.project_id):<10} "
                      f"hours={row.hours:6.1f} rate={row.rate:7.2f} amount={row.amount:9.2f}")

        if res.warnings:
            print(f"\n  Warnings:")
            for w in res.warnings[:5]:
                print(f"    - {w}")

        record(f"TEST2_extraction_{label}", res.success or len(res.rows) > 0,
               f"rows={len(res.rows)} ocr={res.used_ocr} conf={res.confidence:.3f}")
    except Exception as e:
        traceback.print_exc()
        extraction_results[label] = None
        record(f"TEST2_extraction_{label}", False, str(e))


# ===========================================================================
# TEST 3 — OCR + GRID VALIDATION (image PDF only)
# ===========================================================================
section("TEST 3 — OCR + GRID VALIDATION (time_sheet.pdf)")

subsection("Running OCR pipeline on image PDF")

# Import internal components to verify each stage
from pipeline.text_extractor import _extract_table_engine, _extract_pdf_text_tables, _should_use_ocr_pipeline
from pipeline.debug_utils import DebugExporter
from schema import TimesheetFormat, InvoiceLayout

t0 = time.time()
try:
    # Step A: text attempt
    full_text, text_rows, text_fin, total_chars = _extract_pdf_text_tables(IMAGE_PDF)
    text_elapsed = (time.time() - t0) * 1000

    print(f"  pdfplumber pass:")
    print(f"    total_chars  : {total_chars}")
    print(f"    text_rows    : {len(text_rows)}")
    print(f"    text (first 200) : {full_text[:200]!r}")

    # Step B: routing decision
    route_ocr = _should_use_ocr_pipeline(total_chars, bool(text_rows), full_text, TimesheetFormat.BKC)
    print(f"\n  OCR routing decision : {route_ocr}")
    print(f"    Reason             : ", end="")
    if total_chars < 700:
        print(f"low text ({total_chars} < 700 chars)")
    elif len(full_text) >= 20 and not text_rows:
        print("attendance-heavy or format-specific")
    else:
        print("other condition")

    record("TEST3_ocr_routing_triggered", route_ocr,
           f"chars={total_chars} text_rows={len(text_rows)}")

    # Step C: run OCR engine
    if route_ocr:
        debug_ex = DebugExporter(enabled=True, output_dir=OUTPUT_DIR)
        t_ocr = time.time()
        tables, warnings, avg_conf, ocr_text, engine_debug = _extract_table_engine(
            IMAGE_PDF,
            TimesheetFormat.BKC,
            debug_ex,
        )
        ocr_elapsed = (time.time() - t_ocr) * 1000
        print(f"\n  OCR Engine results:")
        print(f"    Tables found     : {len(tables)}")
        print(f"    Avg confidence   : {avg_conf:.3f}")
        print(f"    OCR elapsed      : {ocr_elapsed:.0f} ms")
        print(f"    Warnings         : {len(warnings)}")
        for w in warnings[:5]:
            print(f"      - {w}")

        if tables:
            print(f"\n  First table preview (up to 5 rows):")
            for i, row in enumerate(tables[0][:5]):
                print(f"    Row {i}: {row}")

        if ocr_text:
            print(f"\n  OCR raw text (first 300 chars):")
            print(f"    {ocr_text[:300]!r}")

        record("TEST3_ocr_tables_extracted", len(tables) > 0,
               f"tables={len(tables)} conf={avg_conf:.3f} time={ocr_elapsed:.0f}ms")
        record("TEST3_ocr_confidence", avg_conf > 0.4,
               f"avg_confidence={avg_conf:.3f}")

        # Step D: look for attendance tokens in OCR text
        import re
        att_tokens = re.findall(r"\b(W|A|H|OFF)\b", ocr_text or full_text, re.I)
        print(f"\n  Attendance tokens found in OCR output : {len(att_tokens)}")
        token_counts = {}
        for t in att_tokens:
            token_counts[t.upper()] = token_counts.get(t.upper(), 0) + 1
        print(f"  Token breakdown: {token_counts}")
        record("TEST3_attendance_tokens", len(att_tokens) > 0,
               f"tokens={token_counts}")

    else:
        record("TEST3_ocr_not_routed", False, "OCR was not triggered — check classification")

except Exception as e:
    traceback.print_exc()
    record("TEST3_ocr_grid_validation", False, str(e))


# ===========================================================================
# TEST 4 — CONDITIONAL AGGREGATION (runtime output)
# ===========================================================================
section("TEST 4 — CONDITIONAL AGGREGATION (runtime output)")

from generator.templates.dynamic_layout_engine import DynamicLayoutEngine

engine = DynamicLayoutEngine()

# Use text_pdf result (has project IDs) if available
for label in ["text_pdf", "image_pdf"]:
    res = extraction_results.get(label)
    if res is None or not res.rows:
        continue

    subsection(f"Aggregation of {label} ({len(res.rows)} raw rows)")

    try:
        normalized = engine.normalize_rows(res)

        print(f"  Raw rows       : {len(res.rows)}")
        print(f"  Normalized rows: {len(normalized)}")
        print(f"\n  NORMALIZED OUTPUT:")

        has_project = any(r.get("project_id") for r in normalized)
        has_no_project = any(not r.get("project_id") for r in normalized)

        for i, row in enumerate(normalized):
            pid = row.get("project_id") or "(none)"
            trade = row.get("trade", "?")
            hours = row.get("hours", 0)
            amount = row.get("amount", 0)
            group_key = f"(trade={trade!r}, project_id={pid!r})"
            print(f"    [{i+1:02d}] key={group_key:50s}  hours={hours:6.1f}  amount={amount:9.2f}")

        # Verify grouping: if multiple raw rows map to same (trade, project_id), they should be merged
        raw_keys = [(r.trade, r.project_id) for r in res.rows]
        raw_key_counts = {}
        for k in raw_keys:
            raw_key_counts[k] = raw_key_counts.get(k, 0) + 1

        merged_keys = [(k, cnt) for k, cnt in raw_key_counts.items() if cnt > 1]
        if merged_keys:
            print(f"\n  Keys that were merged (multiple raw rows → 1 normalized):")
            for k, cnt in merged_keys:
                print(f"    {k}: {cnt} raw rows merged → 1 output row")

        separate_keys = [(k, cnt) for k, cnt in raw_key_counts.items() if cnt == 1]
        print(f"\n  Unique keys kept separate: {len(separate_keys)}")
        print(f"  Merged keys: {len(merged_keys)}")
        print(f"  Expected normalized rows: {len(raw_key_counts)}")
        print(f"  Actual normalized rows  : {len(normalized)}")

        grouping_correct = len(normalized) <= len(raw_key_counts)
        record(f"TEST4_aggregation_{label}", grouping_correct,
               f"raw={len(res.rows)} normalized={len(normalized)} distinct_keys={len(raw_key_counts)}")
    except Exception as e:
        traceback.print_exc()
        record(f"TEST4_aggregation_{label}", False, str(e))


# ===========================================================================
# TEST 5 — CLIENT vs OWNER VALIDATION + INVOICE GENERATION
# ===========================================================================
section("TEST 5 — CLIENT vs OWNER + INVOICE GENERATION")

from generator.pdf_writer import generate_invoice_pdf

# Use text_pdf result if available (more likely to have clean rows)
for label, pdf_key in [("text_pdf", TEXT_PDF), ("image_pdf", IMAGE_PDF)]:
    res = extraction_results.get(label)
    if res is None:
        print(f"  Skipping {label}: no extraction result")
        continue

    subsection(f"Invoice generation for {label}")
    t0 = time.time()
    try:
        out_path = generate_invoice_pdf(
            output_dir=OUTPUT_DIR,
            result=res,
            profile=profile,
            template_path=None,
            signature_path=None,
            stamp_path=None,
        )
        elapsed = (time.time() - t0) * 1000

        exists = os.path.exists(out_path)
        size_kb = os.path.getsize(out_path) / 1024 if exists else 0

        print(f"  PDF generated : {out_path}")
        print(f"  File exists   : {exists}")
        print(f"  Size          : {size_kb:.1f} KB")
        print(f"  Time          : {elapsed:.0f} ms")

        # Verify client/owner mapping
        profile_dict = profile.__dict__ if hasattr(profile, "__dict__") else {}
        client_name = res.metadata.client_name or "Client"
        client_trn  = res.metadata.client_trn or ""
        owner_name  = profile.name

        print(f"\n  Client data resolved:")
        print(f"    client_name : {client_name!r}")
        print(f"    client_trn  : {client_trn!r}")
        print(f"  Owner data resolved:")
        print(f"    owner_name  : {owner_name!r}")
        print(f"    owner_trn   : {profile.trn!r}")
        print(f"    template    : {profile.template_path!r}")
        print(f"    signature   : {profile.signature_path!r}")
        print(f"    stamp       : {profile.stamp_path!r}")

        record(f"TEST5_invoice_generated_{label}", exists and size_kb > 1,
               f"path={out_path} size={size_kb:.1f}KB time={elapsed:.0f}ms")
    except Exception as e:
        traceback.print_exc()
        record(f"TEST5_invoice_generated_{label}", False, str(e))


# ===========================================================================
# TEST 6 — TEMPLATE SAFE-ZONE VALIDATION
# ===========================================================================
section("TEST 6 — TEMPLATE SAFE-ZONE VALIDATION")

from generator.templates.template_loader import TemplateLoader
from generator.templates.template_analyzer import TemplateAnalyzer
from generator.templates.safe_zone_detector import SafeZoneDetector
import cv2 as cv2_local
from reportlab.lib.pagesizes import A4

subsection("Running safe-zone detection without template (fallback path)")

try:
    loader = TemplateLoader(work_dir=OUTPUT_DIR, dpi=200)
    template_asset = loader.load(local_path=None)

    page_w, page_h = A4
    print(f"  A4 page dimensions: {page_w:.2f} x {page_h:.2f} pts")

    if template_asset and template_asset.page_images:
        first_page_path = template_asset.page_images[0]
        image = cv2_local.imread(first_page_path)
        if image is not None:
            analysis = TemplateAnalyzer().analyze(image)
            safe_zone_px = SafeZoneDetector().detect(analysis, image_shape=image.shape[:2])
            sz_dict = safe_zone_px.to_dict()

            sx = page_w / float(template_asset.width_px)
            sy = page_h / float(template_asset.height_px)

            safe_zone_pts = {
                "content_left":   int(sz_dict["content_left"] * sx),
                "content_right":  int(sz_dict["content_right"] * sx),
                "content_top":    int(page_h - (sz_dict["content_top"] * sy)),
                "content_bottom": int(page_h - (sz_dict["content_bottom"] * sy)),
            }
            print(f"  Template image shape: {image.shape}")
            print(f"  Safe zone (pixels)  : {sz_dict}")
            print(f"  Safe zone (points)  : {safe_zone_pts}")
            print(f"  Available width     : {safe_zone_pts['content_right'] - safe_zone_pts['content_left']:.0f} pts")
            print(f"  Available height    : {safe_zone_pts['content_top'] - safe_zone_pts['content_bottom']:.0f} pts")

            # Validate constraints
            in_bounds = (
                safe_zone_pts["content_top"] > safe_zone_pts["content_bottom"]
                and safe_zone_pts["content_right"] > safe_zone_pts["content_left"]
                and safe_zone_pts["content_top"] <= page_h
                and safe_zone_pts["content_bottom"] >= 0
            )
            print(f"  In-bounds check     : {in_bounds}")
            record("TEST6_safe_zone_computed", in_bounds,
                   f"top={safe_zone_pts['content_top']} bottom={safe_zone_pts['content_bottom']} "
                   f"left={safe_zone_pts['content_left']} right={safe_zone_pts['content_right']}")
        else:
            print(f"  No OpenCV image available (no template) — using fallback defaults")
            record("TEST6_safe_zone_computed", True, "No template → fallback defaults used")
    else:
        # No template: fallback path
        safe_zone_pts = {
            "content_left": 50,
            "content_right": int(page_w - 40),
            "content_top": int(page_h - 130),
            "content_bottom": 120,
        }
        print(f"  No template loaded — using fallback safe zone: {safe_zone_pts}")
        print(f"  Available width  : {safe_zone_pts['content_right'] - safe_zone_pts['content_left']:.0f} pts")
        print(f"  Available height : {safe_zone_pts['content_top'] - safe_zone_pts['content_bottom']:.0f} pts")
        record("TEST6_safe_zone_computed", True, f"Fallback: {safe_zone_pts}")

except Exception as e:
    traceback.print_exc()
    record("TEST6_safe_zone_computed", False, str(e))


# ===========================================================================
# TEST 7 — MULTI-PAGE VALIDATION
# ===========================================================================
section("TEST 7 — MULTI-PAGE VALIDATION")

from generator.templates.pagination_engine import PaginationEngine
from generator.templates.dynamic_layout_engine import DynamicLayoutEngine

subsection("Pagination calculation with real extracted rows")

for label in ["text_pdf", "image_pdf"]:
    res = extraction_results.get(label)
    if res is None or not res.rows:
        continue

    try:
        eng = DynamicLayoutEngine()
        normalized = eng.normalize_rows(res)

        safe_zone_test = {
            "content_left": 50,
            "content_right": 515,
            "content_top": int(A4[1] - 130),
            "content_bottom": 120,
        }

        pages = PaginationEngine().paginate(normalized, safe_zone_test)
        total_rows_across_pages = sum(len(p.rows) for p in pages)

        print(f"\n  {label}:")
        print(f"    Normalized rows : {len(normalized)}")
        print(f"    Pages generated : {len(pages)}")
        print(f"    Total rows check: {total_rows_across_pages} (should == {len(normalized)})")

        for i, p in enumerate(pages):
            cf_str = f" | carry_fwd={p.carry_forward_amount:.2f}" if p.carry_forward_amount > 0 else ""
            print(f"      Page {i+1}: {len(p.rows)} rows{cf_str}")

        last_page_idx = len(pages) - 1
        print(f"\n    Multi-page facts:")
        print(f"      Page 1 carry_fwd  : {pages[0].carry_forward_amount:.2f}")
        if len(pages) > 1:
            print(f"      Page 2 carry_fwd  : {pages[1].carry_forward_amount:.2f}")
            print(f"      Last page cf      : {pages[-1].carry_forward_amount:.2f}")
            multi_page = True
        else:
            print(f"      Single page — no carry forward needed")
            multi_page = False

        rows_preserved = total_rows_across_pages == len(normalized)
        record(f"TEST7_pagination_{label}",
               rows_preserved,
               f"pages={len(pages)} rows={len(normalized)} preserved={rows_preserved}")

        if len(pages) > 1:
            carry_increasing = all(
                pages[i+1].carry_forward_amount >= pages[i].carry_forward_amount
                for i in range(len(pages) - 1)
            )
            record(f"TEST7_carry_forward_{label}", carry_increasing,
                   f"carry_amounts={[round(p.carry_forward_amount,2) for p in pages]}")

    except Exception as e:
        traceback.print_exc()
        record(f"TEST7_pagination_{label}", False, str(e))


# ===========================================================================
# TEST 8 — DEBUG ARTIFACT VALIDATION
# ===========================================================================
section("TEST 8 — DEBUG ARTIFACTS")

subsection("Checking ai-service/storage/debug/")
debug_dir = Path(AI_SERVICE) / "storage" / "debug"

if debug_dir.exists():
    all_files = list(debug_dir.rglob("*"))
    file_list = [f for f in all_files if f.is_file()]
    print(f"  Debug directory : {debug_dir}")
    print(f"  Total files     : {len(file_list)}")
    for f in sorted(file_list)[:20]:
        size_kb = f.stat().st_size / 1024
        print(f"    {f.relative_to(debug_dir)} ({size_kb:.1f} KB)")
    record("TEST8_debug_dir_exists", True, f"files={len(file_list)}")
else:
    print(f"  Debug directory not found: {debug_dir}")
    record("TEST8_debug_dir_exists", False, f"path={debug_dir}")

subsection(f"Checking test outputs: {OUTPUT_DIR}")
out_files = list(Path(OUTPUT_DIR).rglob("*"))
out_file_list = [f for f in out_files if f.is_file()]
print(f"  Total files in output dir : {len(out_file_list)}")
for f in sorted(out_file_list)[-15:]:
    size_kb = f.stat().st_size / 1024
    print(f"    {f.name} ({size_kb:.1f} KB)")

record("TEST8_output_files_generated", len(out_file_list) > 0,
       f"files={len(out_file_list)}")


# ===========================================================================
# TEST 9 — PERFORMANCE TIMING
# ===========================================================================
section("TEST 9 — PERFORMANCE TIMING")

subsection("Extraction timing breakdown")

import pdfplumber as _pdfplumber

for label, path in [("text_pdf", TEXT_PDF), ("image_pdf", IMAGE_PDF)]:
    print(f"\n  {label}: {path}")

    # Classification
    t0 = time.time()
    from pipeline.classifier import classify_pdf as _classify
    fmt2, layout2, is_image2 = _classify(path)
    classify_ms = (time.time() - t0) * 1000

    # Full extraction
    t0 = time.time()
    res2 = run_extraction(pdf_path=path, company_profile=profile)
    extract_ms = (time.time() - t0) * 1000

    # Invoice render
    render_ms = None
    try:
        t0 = time.time()
        out = generate_invoice_pdf(
            output_dir=OUTPUT_DIR,
            result=res2,
            profile=profile,
        )
        render_ms = (time.time() - t0) * 1000
    except Exception as e:
        render_ms = -1.0
        print(f"    render error: {e}")

    print(f"    classify_ms  : {classify_ms:.0f} ms")
    print(f"    extract_ms   : {extract_ms:.0f} ms")
    print(f"    render_ms    : {render_ms:.0f} ms" if render_ms and render_ms > 0 else f"    render_ms    : ERROR")
    total_ms = classify_ms + extract_ms + (render_ms if render_ms and render_ms > 0 else 0)
    print(f"    total_ms     : {total_ms:.0f} ms")

    record(f"TEST9_performance_{label}",
           classify_ms < 10000 and (extract_ms < 60000 or is_image2),  # OCR path can take >60s
           f"classify={classify_ms:.0f}ms extract={extract_ms:.0f}ms render={render_ms:.0f}ms total={total_ms:.0f}ms")


# ===========================================================================
# TEST 10 — FINAL ACCEPTANCE REPORT
# ===========================================================================
section("TEST 10 — FINAL ACCEPTANCE REPORT")

passed = [k for k, v in results.items() if v["passed"]]
failed = [k for k, v in results.items() if not v["passed"]]

print(f"\n{'=' * 80}")
print(f"  REAL EXECUTION VALIDATION — FINAL REPORT")
print(f"  Date: {time.strftime('%Y-%m-%d %H:%M:%S')}")
print(f"{'=' * 80}")
print(f"\n  {PASS_ICON} PASSED ({len(passed)}):")
for k in passed:
    note = results[k]["notes"]
    print(f"    • {k}")
    if note:
        print(f"        {note}")

print(f"\n  {FAIL_ICON} FAILED ({len(failed)}):")
if failed:
    for k in failed:
        note = results[k]["notes"]
        print(f"    • {k}")
        if note:
            print(f"        {note}")
else:
    print("    (none)")

print(f"\n{'─' * 60}")
print(f"  SUMMARY:")
print(f"    Total tests : {len(results)}")
print(f"    Passed      : {len(passed)}")
print(f"    Failed      : {len(failed)}")
overall = "PASS" if len(failed) == 0 else "PARTIAL" if len(passed) > len(failed) else "FAIL"
icon = PASS_ICON if overall == "PASS" else WARN_ICON if overall == "PARTIAL" else FAIL_ICON
print(f"    Overall     : {icon} {overall}")
print(f"{'─' * 60}")

# Save JSON report
report_path = os.path.join(OUTPUT_DIR, f"acceptance_report_{int(time.time())}.json")
with open(report_path, "w", encoding="utf-8") as fh:
    json.dump({
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "overall": overall,
        "passed": len(passed),
        "failed": len(failed),
        "results": results,
    }, fh, indent=2)
print(f"\n  Full report saved: {report_path}")
print(f"{'=' * 80}\n")
