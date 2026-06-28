import json, os, statistics
paths = [r'd:\Crew_control\temp\cell_details.json', r'd:\Crew_control\ai-service\temp\cell_details.json']
all_cells = []
for p in paths:
    if os.path.exists(p):
        try:
            with open(p,'r',encoding='utf-8') as fh:
                cs = json.load(fh)
                all_cells.extend(cs)
                print('loaded', p, 'entries', len(cs))
        except Exception as e:
            print('err reading', p, e)
print('total combined entries', len(all_cells))
ocr_entries = [c for c in all_cells if isinstance(c.get('ocr_ms'), (int,float))]
ocr_ms = [c['ocr_ms'] for c in ocr_entries]
print('ocr_calls_count:', len(ocr_entries))
print('ocr_ms_sum_s:', sum(ocr_ms)/1000.0)
print('ocr_ms_mean_ms:', statistics.mean(ocr_ms) if ocr_ms else 0)
print('ocr_ms_median_ms:', statistics.median(ocr_ms) if ocr_ms else 0)
print('ocr_ms_max_ms:', max(ocr_ms) if ocr_ms else 0)
prep_ms = [c.get('prep_ms',0) for c in ocr_entries]
cell_total_ms = [c.get('cell_total_ms',0) for c in ocr_entries]
print('prep_ms_sum_s:', sum(prep_ms)/1000.0)
print('cell_total_ms_sum_s:', sum(cell_total_ms)/1000.0)
# group by table_index
from collections import defaultdict
by_table = defaultdict(list)
for c in ocr_entries:
    by_table[c.get('table_index')].append(c)
for t, items in by_table.items():
    print('table', t, 'calls', len(items), 'ocr_s', sum(i['ocr_ms'] for i in items)/1000.0)
