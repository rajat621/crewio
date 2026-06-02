"""
Backward compatibility test for semantic classifier.

Verify that existing MCC/BKC PDFs are still classified correctly
before integrating new generalization code.
"""

import sys
import os

# Add AI service to path
ai_service_path = os.path.join(os.path.dirname(__file__), 'ai-service')
sys.path.insert(0, ai_service_path)

# Change to ai-service directory for relative imports
os.chdir(ai_service_path)

from pipeline.classifier import classify_pdf
from schema import TimesheetFormat, InvoiceLayout

# Test PDFs
test_cases = [
    ("d:\\Crew_control\\timesheet2.pdf", (TimesheetFormat.MCC, InvoiceLayout.PROJECT_BASED, False)),
    ("d:\\Crew_control\\time_sheet.pdf", (TimesheetFormat.BKC, InvoiceLayout.EMPLOYEE_BASED, True)),
]

print("=" * 70)
print("BACKWARD COMPATIBILITY TEST: Semantic Classifier")
print("=" * 70)

all_passed = True

for pdf_path, expected in test_cases:
    try:
        result = classify_pdf(pdf_path)
        fmt, layout, is_image = result
        
        exp_fmt, exp_layout, exp_is_image = expected
        
        # Check format
        fmt_match = fmt == exp_fmt
        layout_match = layout == exp_layout
        image_match = is_image == exp_is_image
        
        status = "✅ PASS" if (fmt_match and layout_match and image_match) else "❌ FAIL"
        
        print(f"\n{pdf_path.split('/')[-1]}:")
        print(f"  Format:       {fmt.value:15} (expected: {exp_fmt.value:15}) {fmt_match and '✅' or '❌'}")
        print(f"  Layout:       {layout.value:15} (expected: {exp_layout.value:15}) {layout_match and '✅' or '❌'}")
        print(f"  Is Image:     {str(is_image):15} (expected: {str(exp_is_image):15}) {image_match and '✅' or '❌'}")
        print(f"  Status: {status}")
        
        if not (fmt_match and layout_match and image_match):
            all_passed = False
        
    except Exception as e:
        print(f"\n❌ ERROR processing {pdf_path}: {e}")
        all_passed = False

print("\n" + "=" * 70)
if all_passed:
    print("✅ ALL TESTS PASSED - Backward compatibility maintained!")
else:
    print("❌ SOME TESTS FAILED - Review classifier logic")
print("=" * 70)
