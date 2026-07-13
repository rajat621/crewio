import json
from pathlib import Path

p = Path('temp/semantic_debug.json')
if not p.exists():
    print('semantic_debug.json not found at', p)
    raise SystemExit(1)

j = json.loads(p.read_text(encoding='utf-8'))
tokens = j.get('tokens', [])
clusters = j.get('clusters', [])
accepted = j.get('accepted_rows', [])
rejected = j.get('rejected_rows', [])

# compute counts
report = {}
report['tokens'] = len(tokens)
report['clusters'] = len(clusters)
report['accepted_rows'] = len(accepted)
report['rejected_rows'] = len(rejected)

# top rejection reasons
from collections import Counter
reasons = Counter()
for r in rejected:
    for rr in r.get('reasons', []):
        reasons[rr] += 1
report['top_rejection_reasons'] = reasons.most_common()

# detected employee ids and trades and numeric fields
EMP_ID_RE = __import__('re').compile(r"\b(?:OSAA|EMP|E|LAB|SOSAA)\d{1,6}\b", __import__('re').I)
TRADE_RE = __import__('re').compile(r"\b(tile\s*mason|steel\s*fixer|mason|carpenter|helper|electrician|plumber|painter|scaffolder|welder|foreman|driver|operator|labou?r|technician)\b", __import__('re').I)
num_count = 0
emp_ids = Counter()
trades = Counter()
for t in tokens:
    txt = str(t.get('text') or '')
    if EMP_ID_RE.search(txt):
        emp_ids[EMP_ID_RE.search(txt).group(0)] += 1
    if TRADE_RE.search(txt):
        trades[TRADE_RE.search(txt).group(0).upper()] += 1
    if __import__('re').search(r"\d", txt):
        num_count += 1

report['employee_ids_detected'] = dict(emp_ids)
report['trades_detected'] = dict(trades)
report['numeric_tokens'] = num_count

# prepare rejected details
rejected_details = []
for r in rejected:
    rejected_details.append({
        'cluster_id': r.get('cluster_id'),
        'text': r.get('snippet'),
        'detected_trade': r.get('detected_trade'),
        'detected_employee': r.get('detected_employee'),
        'detected_employee_id': '',
        'detected_hours': r.get('detected_hours'),
        'detected_rate': None,
        'detected_amount': r.get('detected_amount'),
        'reject_reason': r.get('reasons'),
    })

out = {
    'tokens': report['tokens'],
    'clusters': report['clusters'],
    'accepted_rows': report['accepted_rows'],
    'rejected_rows': report['rejected_rows'],
    'top_rejection_reasons': report['top_rejection_reasons'],
    'employee_ids_detected': report['employee_ids_detected'],
    'trades_detected': report['trades_detected'],
    'numeric_fields_detected': report['numeric_tokens'],
    'rejected_details': rejected_details,
}

print(json.dumps(out, indent=2))
