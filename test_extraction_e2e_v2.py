"""End-to-end extraction validation with new semantic classifier."""

import sys
import os

ai_service_path = os.path.join(os.path.dirname(__file__), 'ai-service')
sys.path.insert(0, ai_service_path)
os.chdir(ai_service_path)

from pipeline.run import run_extraction

test_cases = [
    ("d:\\Crew_control\\timesheet2.pdf", "MCC"),
    ("d:\\Crew_control\\time_sheet.pdf", "BKC"),
]

print("=" * 70)
print("END-TO-END EXTRACTION VALIDATION")
print("=" * 70)

all_passed = True

for pdf_path, format_name in test_cases:
    print(f"\nTesting: {pdf_path.split(chr(92))[-1]} ({format_name})")
    print("-" * 70)
    
    try:
        result = run_extraction(pdf_path, debug_mode=False)
        
        rows_extracted = len(result.rows) if result.rows else 0
        
        # Check success criteria
        has_rows = rows_extracted > 0
        has_subtotal = result.financials.subtotal > 0 if result.financials else False
        has_deduction = result.financials.total_deduction > 0 if result.financials else False
        has_net = result.financials.net_payable > 0 if result.financials else False
        
        print(f"  Rows extracted:     {rows_extracted} {'✅' if has_rows else '❌'}")
        
        if result.financials:
            print(f"  Subtotal:           {result.financials.subtotal:.2f} {'✅' if has_subtotal else '❌'}")
            print(f"  Deduction:          {result.financials.total_deduction:.2f} {'✅' if has_deduction else '❌'}")
            print(f"  Net Payable:        {result.financials.net_payable:.2f} {'✅' if has_net else '❌'}")
            print(f"  Deduction Source:   {result.financials.deduction_source}")
        else:
            print(f"  Financials:         None ❌")
            has_subtotal = has_deduction = has_net = False
        
        if has_rows and has_subtotal and has_deduction and has_net:
            print(f"\n  ✅ EXTRACTION SUCCESSFUL")
        else:
            print(f"\n  ❌ EXTRACTION INCOMPLETE")
            all_passed = False
        
    except Exception as e:
        print(f"  ❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        all_passed = False

print("\n" + "=" * 70)
if all_passed:
    print("✅ ALL EXTRACTIONS SUCCESSFUL - Pipeline is working!")
else:
    print("❌ SOME EXTRACTIONS FAILED - Review logs")
print("=" * 70)
