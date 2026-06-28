import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from pipeline.text_extractor import extract_text_pdf
from schema import TimesheetFormat, InvoiceLayout

PDF = 'backend/src/storage/uploads/timesheets/1782294444184-Alqaser__Alsatea_Tech_Cont__260623_182237.pdf'
res = extract_text_pdf(PDF, TimesheetFormat.GENERIC, InvoiceLayout.PROJECT_BASED, config_overrides=None, debug_mode=False, run_id=None, request_cache={})
out = {
    'success': bool(res.success),
    'rows': len(res.rows),
    'warnings': res.warnings,
    'first_rows': [vars(r) for r in res.rows[:5]],
    'used_ocr': res.used_ocr,
}
print(json.dumps(out, indent=2, default=str))
