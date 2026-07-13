#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import os
import json
from pipeline.table_engine_optimized import optimized_extract_table_engine

pdf = sys.argv[1] if len(sys.argv)>1 else 'backend/src/storage/uploads/timesheets/1782294444184-Alqaser__Alsatea_Tech_Cont__260623_182237.pdf'

os.environ['OCR_RASTER_DPI'] = os.getenv('OCR_RASTER_DPI','250')
print('Running optimized engine on', pdf, 'OCR_RASTER_DPI=', os.environ['OCR_RASTER_DPI'])
res = optimized_extract_table_engine(pdf, None, None, config_overrides=None, request_cache={})
all_tables, warnings, avg_conf, text_parts, debug_payload = res
outdir = Path('temp') / 'debug_diagnostics' / Path(pdf).stem
outdir.mkdir(parents=True, exist_ok=True)
with open(outdir / 'optimized_result.json','w',encoding='utf-8') as fh:
    json.dump({'tables_count': len(all_tables), 'warnings': warnings, 'avg_conf': avg_conf, 'text_parts': text_parts, 'debug': debug_payload}, fh, indent=2)
print('Wrote', outdir / 'optimized_result.json')
