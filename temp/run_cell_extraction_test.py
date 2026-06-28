import json, time, os
from pathlib import Path
import sys
sys.path.insert(0, r'd:\Crew_control\ai-service')
from pipeline.tables.cell_extractor import CellExtractor
from PIL import Image
import numpy as np

# locate debug diagnostics folder
diag = Path(r'd:\Crew_control\ai-service\temp\debug_diagnostics')
folders = list(diag.iterdir()) if diag.exists() else []
if not folders:
    print('no debug diag')
    raise SystemExit(1)
folder = folders[0]
print('using folder', folder)
# use crop_01_full.png
crop_path = folder / 'crop_01_full.png'
if not crop_path.exists():
    print('crop not found', crop_path)
    raise SystemExit(1)
img = np.array(Image.open(crop_path).convert('RGB'))[:,:,::-1]

# load cell_details
cell_file = Path(r'd:\Crew_control\temp\cell_details.json')
if not cell_file.exists():
    cell_file = Path(r'd:\Crew_control\ai-service\temp\cell_details.json')
if not cell_file.exists():
    print('cell details missing')
    raise SystemExit(1)
cells = json.load(open(cell_file,'r',encoding='utf-8'))
# collect boxes for table_index==2
boxes = [tuple(c['bbox']) for c in cells if c.get('table_index')==2 and c.get('bbox')]
print('boxes count', len(boxes))

# run extractor
extractor = CellExtractor(request_cache={})
start = time.time()
res = extractor.extract_cells(img, boxes, table_offset=(0,0), submit_ts=time.time(), table_index=2)
end = time.time()
print('returned cells', len(res))
# compute ocr calls from profiler-like metadata: count entries with ocr_ms>0
ocr_calls = sum(1 for c in res if c.get('ocr_ms'))
ocr_time = sum(c.get('ocr_ms',0) for c in res)
print('ocr_calls', ocr_calls, 'ocr_time_s', ocr_time/1000.0)
print('wall_time_s', end-start)
# write results
open('temp/cell_extraction_test_result.json','w',encoding='utf-8').write(json.dumps({'ocr_calls':ocr_calls,'ocr_time_s':ocr_time/1000.0,'wall_time_s':end-start,'cells_returned':len(res)},indent=2))
print('wrote temp/cell_extraction_test_result.json')
