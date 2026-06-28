#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import time
import os
import json
import shutil

from pipeline.debug_utils import ensure_debug, NoOpDebug, DebugExporter
from pipeline.table_engine_optimized import optimized_extract_table_engine
from pipeline.text_extractor import _extract_table_engine, extract_text_pdf
from schema import TimesheetFormat, InvoiceLayout
from pipeline.profiler import new_request_collector, set_current

PDF = str(Path('backend/src/storage/uploads/timesheets/1782294444184-Alqaser__Alsatea_Tech_Cont__260623_182237.pdf'))
OUT_ROOT = Path('temp') / 'verification_runs'
OUT_ROOT.mkdir(parents=True, exist_ok=True)

results = {}

# Helper
def count_debug_files(d):
    d = Path(d)
    if not d.exists():
        return 0
    return sum(1 for _ in d.rglob('*') if _.is_file())

# Scenario 1: Optimized engine with real DebugExporter
print('Running Scenario 1: Optimized engine with DebugExporter')
out1 = OUT_ROOT / 'scenario1'
if out1.exists():
    shutil.rmtree(out1)
out1.mkdir(parents=True)
debug1 = DebugExporter(enabled=True, output_dir=str(out1))
start = time.time()
prof = new_request_collector()
set_current(prof)
try:
    tables, warnings, avg_conf, text_parts, debug_payload = optimized_extract_table_engine(PDF, TimesheetFormat.GENERIC, debug1, config_overrides=None, request_cache={})
    exc = None
except Exception as e:
    tables, warnings, avg_conf, text_parts, debug_payload = [], [str(e)], 0.0, '', {}
    exc = e
end = time.time()
# persist profiler report
try:
    report = prof.report()
    with open(out1 / 'profiler_report.txt', 'w', encoding='utf-8') as fh:
        fh.write(report)
except Exception:
    pass
results['scenario1'] = {
    'engine': 'optimized',
    'debug_impl': type(debug1).__name__,
    'runtime_s': round(end - start, 3),
    'tables_count': len(tables) if tables else 0,
    'warnings': warnings,
    'avg_conf': avg_conf,
    'exception': repr(exc) if exc else None,
    'debug_files': count_debug_files(out1),
}
print('Scenario1 done', results['scenario1'])

# Scenario 2: Force optimized engine to fail and trigger fallback.
print('\nRunning Scenario 2: Force optimized engine to fail (patch TableDetector.detect_tables) and call optimized_extract_table_engine with debug=None')
from pipeline.tables import TableDetector
orig_detect = TableDetector.detect_tables

def fake_detect(self, image):
    raise RuntimeError('forced detect failure for test')

TableDetector.detect_tables = fake_detect
start = time.time()
prof = new_request_collector()
set_current(prof)
try:
    tables2, warnings2, avg_conf2, text_parts2, debug_payload2 = optimized_extract_table_engine(PDF, TimesheetFormat.GENERIC, None, config_overrides=None, request_cache={})
    exc2 = None
except Exception as e:
    tables2, warnings2, avg_conf2, text_parts2, debug_payload2 = [], [str(e)], 0.0, '', {}
    exc2 = e
end = time.time()
try:
    (OUT_ROOT / 'scenario2').mkdir(parents=True, exist_ok=True)
    report2 = prof.report()
    with open(OUT_ROOT / 'scenario2' / 'profiler_report.txt', 'w', encoding='utf-8') as fh:
        fh.write(report2)
except Exception:
    pass
# restore
TableDetector.detect_tables = orig_detect
results['scenario2'] = {
    'engine': 'optimized->fallback',
    'debug_impl': type(ensure_debug(None)).__name__,
    'runtime_s': round(end - start, 3),
    'tables_count': len(tables2) if tables2 else 0,
    'warnings': warnings2,
    'avg_conf': avg_conf2,
    'exception': repr(exc2) if exc2 else None,
    'debug_files': 0,
}
print('Scenario2 done', results['scenario2'])

# Scenario 3: Legacy engine direct, with debug enabled and disabled
print('\nRunning Scenario 3: Legacy engine direct (_extract_table_engine)')
# Debug enabled
out3 = OUT_ROOT / 'scenario3_enabled'
if out3.exists():
    shutil.rmtree(out3)
out3.mkdir(parents=True)
debug3 = DebugExporter(enabled=True, output_dir=str(out3))
start = time.time()
prof = new_request_collector()
set_current(prof)
try:
    t3, w3, c3, tp3, dp3 = _extract_table_engine(PDF, TimesheetFormat.GENERIC, debug3, config_overrides=None, request_cache={})
    exc3 = None
except Exception as e:
    t3, w3, c3, tp3, dp3 = [], [str(e)], 0.0, '', {}
    exc3 = e
end = time.time()
try:
    report3 = prof.report()
    with open(out3 / 'profiler_report.txt', 'w', encoding='utf-8') as fh:
        fh.write(report3)
except Exception:
    pass
results['scenario3_enabled'] = {
    'engine': 'legacy',
    'debug_impl': type(debug3).__name__,
    'runtime_s': round(end - start, 3),
    'tables_count': len(t3) if t3 else 0,
    'warnings': w3,
    'avg_conf': c3,
    'exception': repr(exc3) if exc3 else None,
    'debug_files': count_debug_files(out3),
}
print('Scenario3 enabled done', results['scenario3_enabled'])

# Debug disabled (pass None to ensure NoOpDebug)
start = time.time()
try:
    t4, w4, c4, tp4, dp4 = _extract_table_engine(PDF, TimesheetFormat.GENERIC, None, config_overrides=None, request_cache={})
    exc4 = None
except Exception as e:
    t4, w4, c4, tp4, dp4 = [], [str(e)], 0.0, '', {}
    exc4 = e
end = time.time()
results['scenario3_disabled'] = {
    'engine': 'legacy',
    'debug_impl': type(ensure_debug(None)).__name__,
    'runtime_s': round(end - start, 3),
    'tables_count': len(t4) if t4 else 0,
    'warnings': w4,
    'avg_conf': c4,
    'exception': repr(exc4) if exc4 else None,
    'debug_files': 0,
}
print('Scenario3 disabled done', results['scenario3_disabled'])

# Write summary
with open(OUT_ROOT / 'verification_summary.json', 'w', encoding='utf-8') as fh:
    json.dump(results, fh, indent=2)

print('\nVerification complete. Summary written to', OUT_ROOT / 'verification_summary.json')
print(json.dumps(results, indent=2))
