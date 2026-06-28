"""Debug semantic classifier characteristics detection."""

import sys
import os

ai_service_path = os.path.join(os.path.dirname(__file__), 'ai-service')
sys.path.insert(0, ai_service_path)
os.chdir(ai_service_path)

from pipeline.classifier import _analyze_table_structure, _determine_layout, _determine_complexity

# Test PDFs
pdfs = [
    ("d:\\Crew_control\\timesheet2.pdf", "MCC (Project-based)"),
    ("d:\\Crew_control\\time_sheet.pdf", "BKC (Employee-based)"),
]

print("=" * 70)
print("DEBUG: Semantic Characteristics Detection")
print("=" * 70)

for pdf_path, expected in pdfs:
    print(f"\n{pdf_path.split(chr(92))[-1]} ({expected})")
    print("-" * 70)
    
    try:
        chars = _analyze_table_structure(pdf_path)
        
        print("Characteristics detected:")
        for key, value in chars.items():
            print(f"  {key:30} : {value}")
        
        layout, conf = _determine_layout(chars)
        complexity = _determine_complexity(chars)
        
        print(f"\nDerived values:")
        print(f"  Layout:      {layout.value} (confidence: {conf})")
        print(f"  Complexity:  {complexity}")
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()

print("\n" + "=" * 70)
