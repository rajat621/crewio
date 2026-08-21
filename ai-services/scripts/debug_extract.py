import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from pipeline.text_extractor import extract_text_pdf
from schema import TimesheetFormat, InvoiceLayout
PDF = 'backend/src/storage/uploads/timesheets/1782294444184-Alqaser__Alsatea_Tech_Cont__260623_182237.pdf'
request_cache = {}
res = extract_text_pdf(PDF, TimesheetFormat.GENERIC, InvoiceLayout.PROJECT_BASED, config_overrides=None, debug_mode=True, run_id='debug1', request_cache=request_cache)
print('success', res.success)
print('rows', len(res.rows))
print('warnings', res.warnings)
print('used_ocr', res.used_ocr)
print('request_cache keys', list(request_cache.keys()))
print('table_engine_debug', request_cache.get('table_engine_debug'))
print('normalized_tables', request_cache.get('normalized_tables'))
print('ocr_table_text snippet:', (request_cache.get('ocr_table_text') or '')[:1000])
from pipeline.text_extractor import _rows_from_normalized_tables
norm = request_cache.get('normalized_tables') or []
rows, fin, summary_hours = _rows_from_normalized_tables(norm, InvoiceLayout.PROJECT_BASED, [])
print('rows from normalized:', len(rows))
for r in rows[:10]:
	print(vars(r))

# Debug classification per normalized row
from pipeline.semantic_filter import classify_row
for table in norm:
    for row in table:
        cells = [str(c or '').strip() for c in row]
        print('ROW CELLS:', cells)
        print('CLASSIFY:', classify_row(cells))
