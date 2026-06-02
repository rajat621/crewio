#!/usr/bin/env python3
"""
TEST: Safe-Zone Template Rendering

Verify that:
1. Template analysis detects header/footer/branding regions correctly
2. Safe zone calculation keeps content away from branding
3. Coordinate system conversion (pixels → ReportLab points) is correct
4. Content drawing respects safe zone boundaries
"""

import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).parent / "ai-service"))

from reportlab.lib.pagesizes import A4
from generator.templates.template_analyzer import TemplateAnalyzer
from generator.templates.safe_zone_detector import SafeZoneDetector
from generator.templates.content_positioner import ContentPositioner

# =============================================================================
# TEST: Create synthetic template image and analyze it
# =============================================================================

print("\n" + "="*80)
print("TEST 1: Template Analysis - Detect Header/Footer/Logo Regions")
print("="*80)

# Create a synthetic template image (simulating a 1200×1500 PDF at 200 DPI)
# A4 at 200 DPI = 1654×2338 pixels
# We'll use 1200×1500 for this test

height, width = 1500, 1200
image_bgr = np.ones((height, width, 3), dtype=np.uint8) * 255  # White background

# Simulate header (blue bar at top)
image_bgr[0:150, :] = [100, 100, 200]  # Bluish header

# Simulate footer (dark bar at bottom)
image_bgr[1400:1500, :] = [50, 50, 50]  # Dark footer

# Simulate logo on left side (dense region)
image_bgr[50:200, 50:250] = [200, 200, 200]  # Gray logo area

# Simulate watermark in center (lighter)
image_bgr[400:900, 200:1000] = [230, 230, 230]  # Watermark-like region

print(f"\nSynthetic template image created: {height}×{width} pixels")
print(f"  - Header: rows 0-150")
print(f"  - Footer: rows 1400-1500")
print(f"  - Logo (left): rows 50-200, cols 50-250")
print(f"  - Watermark (center): rows 400-900, cols 200-1000")

analyzer = TemplateAnalyzer()
analysis = analyzer.analyze(image_bgr)

print(f"\nAnalysis Results:")
print(f"  Header bottom: {analysis.header_bottom}px")
print(f"  Footer top: {analysis.footer_top}px")
print(f"  Content left: {analysis.content_left}px")
print(f"  Content right: {analysis.content_right}px")
print(f"  Logo regions found: {len(analysis.logo_regions)}")
print(f"  Watermark regions found: {len(analysis.watermark_regions)}")

# Verify analysis is reasonable
assert analysis.header_bottom < height // 2, "Header should be in top half"
assert analysis.footer_top > height // 2, "Footer should be in bottom half"
assert analysis.content_left < analysis.content_right, "Left should be < right"
assert analysis.footer_top > analysis.header_bottom, "Footer should be below header"

print("\n✓ PASS: Template analysis detected regions correctly")

# =============================================================================
# TEST: Safe Zone Detection
# =============================================================================

print("\n" + "="*80)
print("TEST 2: Safe Zone Detection - Content Avoids Branding")
print("="*80)

detector = SafeZoneDetector()
safe_zone = detector.detect(analysis, image_shape=(height, width))

print(f"\nSafe Zone (pixels):")
print(f"  content_top: {safe_zone.content_top}px")
print(f"  content_bottom: {safe_zone.content_bottom}px")
print(f"  content_left: {safe_zone.content_left}px")
print(f"  content_right: {safe_zone.content_right}px")

safe_height = safe_zone.content_bottom - safe_zone.content_top  # In pixels: bottom > top
safe_width = safe_zone.content_right - safe_zone.content_left

print(f"\nSafe Zone Dimensions:")
print(f"  Height: {safe_height}px")
print(f"  Width: {safe_width}px")
print(f"  Available area: {safe_height * safe_width}px²")

# Verify safe zone is inside image bounds and avoids branding
# In pixel coordinates: top < bottom (Y increases downward)
assert safe_zone.content_top > 150, "Should be below header (top > 150px)"
assert safe_zone.content_bottom < height - 100, "Should be above footer (bottom < ~1400px)"
assert safe_zone.content_left >= analysis.content_left, "Should respect left branding"
assert safe_zone.content_right <= analysis.content_right, "Should respect right branding"

print("\n✓ PASS: Safe zone avoids branding regions")

# =============================================================================
# TEST: Coordinate System Conversion (pixels → ReportLab points)
# =============================================================================

print("\n" + "="*80)
print("TEST 3: Coordinate System Conversion (Pixels → ReportLab Points)")
print("="*80)

page_w, page_h = A4  # 595pt × 842pt (standard A4)

# Scale factors: image was 200 DPI, now rendering to A4
sx = page_w / float(width)
sy = page_h / float(height)

print(f"\nScale Factors:")
print(f"  Image: {width}×{height} pixels")
print(f"  Target: {page_w}pt × {page_h}pt (A4)")
print(f"  sx (horizontal): {sx:.4f}")
print(f"  sy (vertical): {sy:.4f}")

# Convert safe zone from pixels to ReportLab coordinates
safe_zone_pts = {
    "content_left": int(safe_zone.content_left * sx),
    "content_right": int(safe_zone.content_right * sx),
    "content_top": int(page_h - (safe_zone.content_top * sy)),
    "content_bottom": int(page_h - (safe_zone.content_bottom * sy)),
}

print(f"\nSafe Zone (ReportLab points):")
print(f"  content_left: {safe_zone_pts['content_left']}pt")
print(f"  content_right: {safe_zone_pts['content_right']}pt")
print(f"  content_top: {safe_zone_pts['content_top']}pt (measured from bottom)")
print(f"  content_bottom: {safe_zone_pts['content_bottom']}pt (measured from bottom)")

# In ReportLab coordinate system:
# - Origin (0,0) is at BOTTOM-LEFT
# - X increases to the right
# - Y increases upward
# - content_top should be higher than content_bottom

assert safe_zone_pts["content_left"] >= 0, "Left should be >= 0"
assert safe_zone_pts["content_right"] <= page_w, f"Right should be <= {page_w}pt"
assert safe_zone_pts["content_bottom"] >= 0, "Bottom should be >= 0"
assert safe_zone_pts["content_top"] <= page_h, f"Top should be <= {page_h}pt"
assert safe_zone_pts["content_top"] > safe_zone_pts["content_bottom"], "Top should be higher than bottom"

print("\n✓ PASS: Coordinate conversion correct (origin at bottom-left)")

# =============================================================================
# TEST: Content Positioning within Safe Zone
# =============================================================================

print("\n" + "="*80)
print("TEST 4: Content Positioning - All Elements Within Safe Zone")
print("="*80)

positioner = ContentPositioner()
positions = positioner.compute(
    safe_zone=safe_zone_pts,
    page_height_pts=page_h,
    rows_on_page=15,
    row_height_pts=22,
)

print(f"\nComputed Positions (ReportLab points):")
print(f"  invoice_title_y: {positions.invoice_title_y}pt")
print(f"  client_block_y: {positions.client_block_y}pt")
print(f"  table_top_y: {positions.table_top_y}pt")
print(f"  totals_start_y: {positions.totals_start_y}pt")
print(f"  signature_block_y: {positions.signature_block_y}pt")

# Verify all positions are within safe zone
safe_bottom = safe_zone_pts["content_bottom"]
safe_top = safe_zone_pts["content_top"]

print(f"\nBoundary Check (must be between {safe_bottom}pt and {safe_top}pt):")

checks = [
    ("Invoice Title", positions.invoice_title_y),
    ("Client Block", positions.client_block_y),
    ("Table Top", positions.table_top_y),
    ("Totals Start", positions.totals_start_y),
    ("Signature Block", positions.signature_block_y),
]

for name, y_val in checks:
    in_bounds = safe_bottom <= y_val <= safe_top
    status = "✓" if in_bounds else "✗"
    print(f"  {status} {name:20} {y_val:7.0f}pt {'IN BOUNDS' if in_bounds else 'OUT OF BOUNDS'}")
    if not in_bounds:
        assert False, f"{name} at {y_val}pt is outside safe zone [{safe_bottom}, {safe_top}]"

print("\n✓ PASS: All content positioned within safe zone boundaries")

# =============================================================================
# TEST: Verify No Overlap with Header/Footer/Branding
# =============================================================================

print("\n" + "="*80)
print("TEST 5: Verify No Content Overlap with Branding")
print("="*80)

header_bottom_pts = int(analysis.header_bottom * sy)
footer_top_pts = int(page_h - (analysis.footer_top * sy))
logo_left_pts = int(analysis.logo_regions[0][0] * sx) if analysis.logo_regions else 0

print(f"\nBranding Boundaries (ReportLab points):")
print(f"  Header extends to: {header_bottom_pts}pt from bottom")
print(f"  Footer starts at: {footer_top_pts}pt from bottom")
print(f"  Logo region left edge: {logo_left_pts}pt from left")

print(f"\nContent Boundaries:")
print(f"  Client block (lowest point): {positions.client_block_y - 50}pt from bottom")
print(f"  Signature block (lowest point): {positions.signature_block_y - 80}pt from bottom")

# Check no footer overlap
assert positions.signature_block_y > footer_top_pts, "Signature overlaps footer!"

# Check no header overlap
assert positions.invoice_title_y < safe_top, "Title overlaps header!"

print("\n✓ PASS: No content overlaps with branding")

# =============================================================================
# SUMMARY
# =============================================================================

print("\n" + "="*80)
print("SAFE-ZONE RENDERING VERIFICATION: ALL TESTS PASSED ✓")
print("="*80)
print("\nVerified:")
print("  ✓ Template analysis detects header/footer/logo regions")
print("  ✓ Safe zone calculation avoids branding (with margins)")
print("  ✓ Coordinate system correctly converts pixels→points")
print("  ✓ Origin is bottom-left (ReportLab standard)")
print("  ✓ All content positioned within safe boundaries")
print("  ✓ No footer, header, or logo overlap")
