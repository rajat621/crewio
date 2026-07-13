import json
from pathlib import Path

from document_classifier import classify_document
from extraction_pipeline import _extract_layout_text_chunks
from extraction_strategy_router import plan_strategy
from invoice_pipeline import extract_only
from layout_classifier import resolve_layout

base = Path(r"D:/Crew_control/ai-service/timesheets")
report = []
for pdf in sorted(base.glob("*.pdf")):
    layout_chunks = _extract_layout_text_chunks(str(pdf))
    doc = classify_document(str(pdf))
    layout = resolve_layout(str(pdf), layout_chunks, doc.document_type)
    strategy = plan_strategy(doc.document_type, layout.layout_type)
    result = extract_only(str(pdf))
    warnings = list(result.get("warnings", []) or [])
    report.append({
        "file": pdf.name,
        "layout": layout.layout_type.value,
        "strategy": strategy.reason,
        "source": result.get("timesheet_meta", {}).get("source", ""),
        "rows_extracted": len(result.get("rows", [])),
        "subtotal": round(float(result.get("totals", {}).get("subtotal", 0) or 0), 2),
        "vat": round(float(result.get("totals", {}).get("vat", 0) or 0), 2),
        "net_total": round(float(result.get("totals", {}).get("net_total", 0) or 0), 2),
        "confidence": round(float(result.get("timesheet_meta", {}).get("confidence", 0) or 0), 4),
        "mismatches": [w for w in warnings if w.startswith("validation:") or w.startswith("reconcile:")],
        "warnings": warnings,
    })
for output_path in [Path(r"D:/Crew_control/ocr_benchmark_report.json"), Path(r"D:/Crew_control/ai-service/ocr_benchmark_report.json")]:
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(len(report))
for item in report:
    print(f"{item['file']} | {item['layout']} | {item['strategy']} | {item['source']} | rows={item['rows_extracted']} | subtotal={item['subtotal']} | vat={item['vat']} | net={item['net_total']} | conf={item['confidence']}")
