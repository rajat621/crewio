import json, os, statistics
base = r"d:\Crew_control\temp"
files = [os.path.join(base,'cell_details.json'), os.path.join(r'd:\Crew_control\ai-service\temp','cell_details.json')]
cell_file = None
for f in files:
    if os.path.exists(f):
        cell_file = f
        break
if not cell_file:
    print('MISSING_CELL_FILE')
    raise SystemExit(1)
with open(cell_file,'r',encoding='utf-8') as fh:
    cells = json.load(fh)
ocr_entries = [c for c in cells if isinstance(c.get('ocr_ms'), (int,float))]
ocr_ms = [c['ocr_ms'] for c in ocr_entries]
cell_total_ms = [c.get('cell_total_ms', c.get('ocr_ms',0)) for c in ocr_entries]
prep_ms = [c.get('prep_ms',0) for c in ocr_entries]
print('cell_file:', cell_file)
print('total_cells_count:', len(cells))
print('ocr_calls_count:', len(ocr_entries))
print('ocr_ms_sum_s:', sum(ocr_ms)/1000.0)
print('cell_total_ms_sum_s:', sum(cell_total_ms)/1000.0)
print('prep_ms_sum_s:', sum(prep_ms)/1000.0)
print('ocr_ms_mean_ms:', statistics.mean(ocr_ms) if ocr_ms else 0)
print('ocr_ms_median_ms:', statistics.median(ocr_ms) if ocr_ms else 0)
print('ocr_ms_max_ms:', max(ocr_ms) if ocr_ms else 0)
meta_path = r'd:\Crew_control\ai-service\temp\debug_diagnostics\1782294444184-Alqaser__Alsatea_Tech_Cont__260623_182237\metadata.json'
if os.path.exists(meta_path):
    meta = json.load(open(meta_path,'r',encoding='utf-8'))
    print('metadata:', meta)
else:
    print('no metadata')
opt_timing = os.path.join(r'd:\Crew_control\ai-service\temp','optimized_timing.json')
if os.path.exists(opt_timing):
    print('optimized_timing present')
    print(open(opt_timing,'r',encoding='utf-8').read())
else:
    print('no optimized_timing.json')
