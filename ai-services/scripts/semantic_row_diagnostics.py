import json
import sys
from pathlib import Path
from collections import Counter, defaultdict

# ensure ai-service on sys.path
sys.path.append(str(Path(__file__).resolve().parents[1]))
from pipeline.semantic_row_assembler import classify_tokens, build_logical_rows, assemble_fields_for_row


def load_debug(path='temp/semantic_debug.json'):
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(path)
    return json.loads(p.read_text(encoding='utf-8'))


def y_range_for_group(group):
    ys = []
    y2s = []
    for t in group:
        raw = t.get('raw', t)
        y = raw.get('y', 0)
        h = raw.get('h', raw.get('height', 0))
        ys.append(y)
        y2s.append(y + h)
    if not ys:
        return [0, 0]
    return [min(ys), max(y2s)]


def median(ls):
    ls = sorted(ls)
    n = len(ls)
    if n == 0:
        return 0
    if n % 2 == 1:
        return ls[n // 2]
    return 0.5 * (ls[n // 2 - 1] + ls[n // 2])


def analyze():
    data = load_debug()
    tokens = data.get('tokens', [])

    classified = classify_tokens(tokens)
    rows = build_logical_rows(classified, overlap_threshold=0.4)

    heights = [t['height'] for t in classified if t.get('height', 0) > 0]
    med_h = median(heights) if heights else 0

    per_row = []
    field_coverage = Counter()
    missing_causes = Counter()

    # map row idx to median y
    row_centers = []
    for grp in rows:
        ymins = [t['raw'].get('y', 0) for t in grp]
        ymaxs = [t['raw'].get('y', 0) + t['raw'].get('h', t['height']) for t in grp]
        row_centers.append((min(ymins) + max(ymaxs)) / 2.0)

    for i, grp in enumerate(rows):
        row_id = i
        yr = y_range_for_group(grp)
        assembled = assemble_fields_for_row(grp)
        missing = []
        if not (assembled.get('employee_id') or assembled.get('employee_name')):
            missing.append('employee')
        if not assembled.get('trade'):
            missing.append('trade')
        if not ((assembled.get('amount') and assembled.get('amount') > 0) or (assembled.get('hours') and assembled.get('hours') > 0)):
            missing.append('amount_or_hours')

        accepted = (len(missing) == 0)

        # track field coverage
        if assembled.get('employee_id'):
            field_coverage['employee_id'] += 1
        if assembled.get('employee_name'):
            field_coverage['employee_name'] += 1
        if assembled.get('trade'):
            field_coverage['trade'] += 1
        if assembled.get('hours') and assembled.get('hours') > 0:
            field_coverage['hours'] += 1
        if assembled.get('rate') and assembled.get('rate') > 0:
            field_coverage['rate'] += 1
        if assembled.get('amount') and assembled.get('amount') > 0:
            field_coverage['amount'] += 1

        per_row.append({
            'row_id': row_id,
            'y_range': yr,
            'employee_id': assembled.get('employee_id') or '',
            'employee_name': assembled.get('employee_name') or '',
            'trade': assembled.get('trade') or '',
            'hours': assembled.get('hours') or None,
            'rate': assembled.get('rate') or None,
            'amount': assembled.get('amount') or None,
            'tokens': assembled.get('tokens'),
            'missing_fields': missing,
            'accepted': accepted,
        })

    # For rows missing fields, check nearby rows (by center Y) that contain those fields
    nearby_presence = defaultdict(lambda: Counter())
    for i, row in enumerate(per_row):
        center_i = (row['y_range'][0] + row['y_range'][1]) / 2.0
        for fld in row['missing_fields']:
            for j, other in enumerate(per_row):
                if i == j:
                    continue
                center_j = (other['y_range'][0] + other['y_range'][1]) / 2.0
                if abs(center_i - center_j) <= max(med_h * 1.0, 20):
                    # check if other row has the missing attribute
                    if fld == 'employee' and (other['employee_id'] or other['employee_name']):
                        nearby_presence[fld]['nearby'] += 1
                    if fld == 'trade' and other['trade']:
                        nearby_presence[fld]['nearby'] += 1
                    if fld == 'amount_or_hours' and ((other['amount'] and other['amount'] > 0) or (other['hours'] and other['hours'] > 0)):
                        nearby_presence[fld]['nearby'] += 1

    # detect OCR coordinate issues: many tokens with very large heights
    bad_heights = [t for t in classified if t.get('height', 0) > max(med_h * 6, 1000)]
    coord_issues = len(bad_heights) > 0

    # Which field prevents acceptance most often
    prevent_counts = Counter()
    for row in per_row:
        for m in row['missing_fields']:
            prevent_counts[m] += 1

    result = {
        'tokens': len(classified),
        'logical_rows': len(rows),
        'per_row': per_row,
        'field_coverage': dict(field_coverage),
        'missing_field_counts': dict(prevent_counts),
        'nearby_presence': {k: dict(v) for k, v in nearby_presence.items()},
        'median_token_height': med_h,
        'ocr_coord_issues': coord_issues,
        'bad_height_samples': [t['text'] for t in bad_heights][:10],
    }

    # Root cause inference
    # If nearby_presence for a missing field is high -> grouped separately
    root_causes = []
    if coord_issues:
        root_causes.append('ocr_token_coordinates_incorrect')
    # threshold: if more than half of missing 'trade' rows have nearby presence -> trades grouped separately
    if prevent_counts.get('trade', 0) > 0 and nearby_presence['trade']['nearby'] > max(2, prevent_counts.get('trade', 0) // 2):
        root_causes.append('trades_grouped_separately')
    if prevent_counts.get('amount_or_hours', 0) > 0 and nearby_presence['amount_or_hours']['nearby'] > max(2, prevent_counts.get('amount_or_hours', 0) // 2):
        root_causes.append('amounts_grouped_separately')
    if prevent_counts.get('employee', 0) > 0 and nearby_presence['employee']['nearby'] > max(2, prevent_counts.get('employee', 0) // 2):
        root_causes.append('horizontal_matching_radius_too_small')

    # employee names split: heuristic if many employee_name tokens exist but per-row employee_name coverage low
    total_employee_name_tokens = sum(1 for t in classified if t['type'] == 'employee_name')
    if total_employee_name_tokens > 0 and field_coverage.get('employee_name', 0) < max(1, total_employee_name_tokens // 2):
        root_causes.append('employee_names_split_across_rows')

    if not root_causes:
        root_causes.append('mixed_causes')

    # Recommended fixes
    recs = []
    if 'ocr_token_coordinates_incorrect' in root_causes:
        recs.append('Investigate OCR bounding boxes; filter/repair tokens with implausible heights. Re-run OCR if necessary.')
    if 'trades_grouped_separately' in root_causes or 'amounts_grouped_separately' in root_causes or 'horizontal_matching_radius_too_small' in root_causes:
        recs.append('Perform post-clustering horizontal assembly: join nearby logical groups by center-Y distance (median_h) and merge tokens before field assignment.')
    if 'employee_names_split_across_rows' in root_causes:
        recs.append('Merge tokens on same near-Y band that form multiword names (use X-order and dictionary/name heuristics).')
    if 'mixed_causes' in root_causes:
        recs.append('Run batch diagnostics across samples and tune overlap threshold and grouping heuristics; add a secondary pass that associates nearby groups by Y-band.')

    result['root_causes'] = root_causes
    result['recommended_fixes'] = recs

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    analyze()
import json
import re
from pathlib import Path
from statistics import median

DATA_PATH = Path('temp/semantic_debug.json')
if not DATA_PATH.exists():
    print('temp/semantic_debug.json not found')
    raise SystemExit(1)

J = json.loads(DATA_PATH.read_text(encoding='utf-8'))
TOKENS = J.get('tokens', [])

EMP_ID_RE = re.compile(r"\b(?:OSAA|SOSAA|EMP|E)\d{1,6}\b", re.I)
TRADE_RE = re.compile(r"\b(tile\s*mason|steel\s*fixer|mason|carpenter|helper|electrician|plumber|painter|scaffolder|welder|foreman|driver|operator|labou?r|technician)\b", re.I)
HEADER_RE = re.compile(r"\b(total|amount|hours|rate|deduction|vat|grand total|employee|profession|project name|s\.no|sno|deductions)\b", re.I)
NUM_RE = re.compile(r"-?\d+[\d\.]*")

def parse_token(t):
    text = (t.get('text') or '').strip()
    x = t.get('x', 0)
    y = t.get('y', 0)
    w = t.get('w', t.get('width', 0))
    h = t.get('h', t.get('height', 0))
    xc = x + w/2.0
    yc = y + h/2.0
    typ = 'unknown'
    if not text:
        typ = 'unknown'
    elif HEADER_RE.search(text):
        typ = 'header'
    elif EMP_ID_RE.search(text):
        typ = 'employee_id'
    elif TRADE_RE.search(text):
        typ = 'trade'
    elif NUM_RE.search(text):
        typ = 'numeric'
    else:
        parts = text.split()
        if len(parts) >=2:
            typ = 'employee_name'
        else:
            typ = 'unknown'
    num = 0.0
    m = NUM_RE.search(text)
    if m:
        try:
            num = float(m.group(0).replace(',', ''))
        except:
            num = 0.0
    return {'text': text, 'x': x, 'y': y, 'w': w, 'h': h, 'xc': xc, 'yc': yc, 'type': typ, 'num': num}

TOK = [parse_token(t) for t in TOKENS]

def vertical_overlap(a,b):
    ay1=a['y']; ay2=a['y']+a['h']
    by1=b['y']; by2=b['y']+b['h']
    inter = max(0, min(ay2,by2)-max(ay1,by1))
    denom = min(a['h'], b['h']) if min(a['h'], b['h'])>0 else 1
    return inter/denom

# build logical rows via union-find with overlap >=40%
n=len(TOK)
parent=list(range(n))
def find(i):
    while parent[i]!=i:
        parent[i]=parent[parent[i]]
        i=parent[i]
    return i
def union(i,j):
    ri,rj=find(i),find(j)
    if ri!=rj:
        parent[rj]=ri

for i in range(n):
    for j in range(i+1,n):
        if vertical_overlap(TOK[i], TOK[j])>=0.4:
            union(i,j)

groups={}
for i in range(n):
    r=find(i)
    groups.setdefault(r,[]).append(TOK[i])

logical_rows = list(groups.values())
logical_rows.sort(key=lambda g: min(t['y'] for t in g))

rows_out = []
coverage = {'employee_id':0,'employee_name':0,'trade':0,'hours':0,'rate':0,'amount':0}
missing_counter={'employee_id':0,'employee_name':0,'trade':0,'hours':0,'rate':0,'amount':0}
fail_reasons_counter={}

for rid,grp in enumerate(logical_rows):
    y_min = min(t['y'] for t in grp)
    y_max = max(t['y']+t['h'] for t in grp)
    # detect fields
    emp_id=''
    emp_name=''
    trade=''
    numerics = [t for t in grp if t['type']=='numeric']
    names = [t for t in grp if t['type']=='employee_name']
    ids = [t for t in grp if t['type']=='employee_id']
    trades = [t for t in grp if t['type']=='trade']
    if ids:
        emp_id = ids[0]['text']
        coverage['employee_id']+=1
    if names:
        emp_name = names[0]['text']
        coverage['employee_name']+=1
    if trades:
        trade = trades[0]['text']
        coverage['trade']+=1

    # heuristics to map numerics to hours/rate/amount using neighboring x order
    hours=None; rate=None; amount=None
    if numerics:
        nums_sorted = sorted(numerics, key=lambda t:t['xc'])
        if len(nums_sorted)>=3:
            hours = nums_sorted[0]['num']
            rate = nums_sorted[1]['num']
            amount = nums_sorted[2]['num']
        elif len(nums_sorted)==2:
            hours = nums_sorted[0]['num']
            amount = nums_sorted[1]['num']
        else:
            val=nums_sorted[0]['num']
            if abs(val)>100:
                amount=val
            else:
                hours=val
    if hours:
        coverage['hours']+=1
    if rate:
        coverage['rate']+=1
    if amount:
        coverage['amount']+=1

    missing=[]
    if not trade: missing.append('trade'); missing_counter['trade']+=1
    if not (emp_id or emp_name): missing.append('employee'); missing_counter['employee_name']+=1
    if not (amount and amount>0) and not (hours and hours>0): missing.append('amount_or_hours'); missing_counter['amount']+=1

    accepted = (bool(trade) and (bool(emp_id) or bool(emp_name)) and ((amount and amount>0) or (hours and hours>0)))
    rows_out.append({
        'row_id': rid,
        'y_range':[y_min,y_max],
        'employee_id': emp_id,
        'employee_name': emp_name,
        'trade': trade,
        'hours': hours,
        'rate': rate,
        'amount': amount,
        'tokens': [t['text'] for t in grp],
        'missing_fields': missing,
        'accepted': accepted,
    })
    if not accepted:
        for m in missing:
            fail_reasons_counter[m]=fail_reasons_counter.get(m,0)+1

# Determine lowest detection rate field
field_counts = {k:v for k,v in coverage.items()}
lowest_field = min(field_counts.items(), key=lambda kv: kv[1])

# Determine which missing field prevents acceptance most often
if fail_reasons_counter:
    most_blocking = max(fail_reasons_counter.items(), key=lambda kv: kv[1])
else:
    most_blocking = (None,0)

# Heuristic root cause checks
num_only_rows = sum(1 for r in rows_out if all(tok and re.search(r"^\d", tok) for tok in r['tokens']))
trade_separate = 0
amounts_separate = 0
name_split = 0

for r in rows_out:
    # trade separate: trade absent in row but a trade token exists within y +/- 20 pixels in other groups
    if not r['trade']:
        ymid = (r['y_range'][0]+r['y_range'][1])/2
        for other in rows_out:
            if other is r: continue
            other_mid = (other['y_range'][0]+other['y_range'][1])/2
            if abs(other_mid-ymid)<=30 and other['trade']:
                trade_separate+=1
                break
    # amounts separate: amount absent but other group nearby has large numeric
    if not r['amount'] or r['amount']==0:
        ymid=(r['y_range'][0]+r['y_range'][1])/2
        for other in rows_out:
            if other is r: continue
            other_mid=(other['y_range'][0]+other['y_range'][1])/2
            if abs(other_mid-ymid)<=30 and other['amount'] and other['amount']>100:
                amounts_separate+=1
                break
    # name split: row lacks name but some other group with overlapping y has a name token
    if not r['employee_name']:
        y1,y2=r['y_range']
        for other in rows_out:
            if other is r: continue
            oy1,oy2=other['y_range']
            inter = max(0, min(y2,oy2)-max(y1,oy1))
            if inter>0 and other['employee_name']:
                name_split+=1
                break

root_causes = []
if num_only_rows > len(rows_out)*0.4:
    root_causes.append('horizontal_matching_radius_too_small')
if name_split > 0:
    root_causes.append('employee_names_split_across_rows')
if trade_separate > 0:
    root_causes.append('trades_grouped_separately')
if amounts_separate > 0:
    root_causes.append('amounts_grouped_separately')

# detect OCR token coordinate anomalies: very large heights
heights = [t['h'] for t in TOK]
med_h = median(heights) if heights else 0
anomalous = sum(1 for h in heights if h>med_h*4 or h>800)
if anomalous>0:
    root_causes.append('ocr_token_coordinates_incorrect_or_merged_boxes')

recommended = []
if 'horizontal_matching_radius_too_small' in root_causes:
    recommended.append('increase horizontal matching tolerance / assemble by y-overlap and merge across columns')
if 'employee_names_split_across_rows' in root_causes:
    recommended.append('merge nearby clusters by y-band and consider multi-token name stitching')
if 'trades_grouped_separately' in root_causes:
    recommended.append('when trade exists in nearby y-band, associate it with numeric/employee tokens by proximity')
if 'amounts_grouped_separately' in root_causes:
    recommended.append('allow numeric columns to be merged into row by x-nearest mapping and not require same cluster')
if 'ocr_token_coordinates_incorrect_or_merged_boxes' in root_causes:
    recommended.append('inspect OCR crop generation and token bounding boxes; re-run OCR with smaller crops or alternative engine')

out = {
    'rows': rows_out,
    'field_coverage': coverage,
    'lowest_detection_field': lowest_field,
    'most_blocking_missing_field': most_blocking,
    'root_causes': root_causes,
    'recommended_fixes': recommended,
}

print(json.dumps(out, indent=2, ensure_ascii=False))
