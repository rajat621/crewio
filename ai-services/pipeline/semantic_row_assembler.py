import re
from typing import List, Dict, Any, Tuple


EMP_ID_RE = re.compile(r"\b(?:OSAA|SOSAA|EMP|E)\d{1,6}\b", re.I)
TRADE_RE = re.compile(r"\b(tile\s*mason|steel\s*fixer|mason|carpenter|helper|electrician|plumber|painter|scaffolder|welder|foreman|driver|operator|labou?r|technician)\b", re.I)
HEADER_KEYWORDS = re.compile(r"\b(total|amount|hours|rate|deduction|vat|grand total|employee|profession|project name|s\.no|sno|deductions)\b", re.I)


def _center(token: Dict[str, Any]) -> Tuple[float, float]:
    x = token.get('x', 0)
    y = token.get('y', 0)
    w = token.get('w', token.get('width', 0))
    h = token.get('h', token.get('height', 0))
    return x + w / 2.0, y + h / 2.0


def _parse_number(text: str) -> float:
    if not text:
        return 0.0
    t = text.replace(',', '').replace('O', '0')
    m = re.search(r"-?\d+[\d\.]*", t)
    if not m:
        return 0.0
    try:
        return float(m.group(0))
    except Exception:
        return 0.0


def classify_tokens(tokens: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    classified = []
    for t in tokens:
        text = (t.get('text') or '').strip()
        x = t.get('x', 0)
        y = t.get('y', 0)
        w = t.get('w', t.get('width', 0))
        h = t.get('h', t.get('height', 0))
        x_c, y_c = x + w / 2.0, y + h / 2.0
        typ = 'unknown'
        if not text:
            typ = 'unknown'
        elif HEADER_KEYWORDS.search(text):
            typ = 'header'
        elif EMP_ID_RE.search(text):
            typ = 'employee_id'
        elif TRADE_RE.search(text):
            typ = 'trade'
        else:
            # numeric?
            if re.search(r"\d", text):
                # treat as numeric (could be hours/rate/amount)
                typ = 'numeric'
            else:
                # Heuristic: multiword and capitalized -> name
                parts = text.split()
                if len(parts) >= 2 and any(p[0].isalpha() for p in parts if p):
                    typ = 'employee_name'
                else:
                    typ = 'unknown'

        classified.append({
            'text': text,
            'x_center': x_c,
            'y_center': y_c,
            'width': w,
            'height': h,
            'type': typ,
            'raw': t,
            'numeric_value': _parse_number(text) if typ == 'numeric' else 0.0,
        })
    return classified


def _vertical_overlap(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    ay1 = a['raw'].get('y', 0)
    ah = a['raw'].get('h', a['height'])
    ay2 = ay1 + ah
    by1 = b['raw'].get('y', 0)
    bh = b['raw'].get('h', b['height'])
    by2 = by1 + bh
    inter_top = max(ay1, by1)
    inter_bottom = min(ay2, by2)
    inter_h = max(0.0, inter_bottom - inter_top)
    if min(ah, bh) <= 0:
        return 0.0
    return inter_h / min(ah, bh)


def build_logical_rows(classified_tokens: List[Dict[str, Any]], overlap_threshold: float = 0.4) -> List[List[Dict[str, Any]]]:
    # union-find by index
    n = len(classified_tokens)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[rj] = ri

    for i in range(n):
        for j in range(i + 1, n):
            a = classified_tokens[i]
            b = classified_tokens[j]
            if _vertical_overlap(a, b) >= overlap_threshold:
                union(i, j)

    groups = {}
    for i in range(n):
        r = find(i)
        groups.setdefault(r, []).append(classified_tokens[i])

    # sort groups by min y
    rows = list(groups.values())
    rows.sort(key=lambda grp: min(t['raw'].get('y', t['y_center']) for t in grp))
    return rows


def assemble_fields_for_row(row_tokens: List[Dict[str, Any]]) -> Dict[str, Any]:
    # sort by x_center
    toks = sorted(row_tokens, key=lambda t: t['x_center'])
    employee_id = None
    employee_name = None
    trade = None
    numeric_tokens = [t for t in toks if t['type'] == 'numeric']
    # find first employee_id and employee_name and trade
    for t in toks:
        if not employee_id and t['type'] == 'employee_id':
            employee_id = t['text']
        if not employee_name and t['type'] == 'employee_name':
            employee_name = t['text']
        if not trade and t['type'] == 'trade':
            trade = t['text'].upper()

    hours = 0.0
    rate = 0.0
    amount = 0.0
    # assign numeric tokens by count and order
    if len(numeric_tokens) >= 3:
        hours = numeric_tokens[0]['numeric_value']
        rate = numeric_tokens[1]['numeric_value']
        amount = numeric_tokens[2]['numeric_value']
    elif len(numeric_tokens) == 2:
        hours = numeric_tokens[0]['numeric_value']
        amount = numeric_tokens[1]['numeric_value']
    elif len(numeric_tokens) == 1:
        val = numeric_tokens[0]['numeric_value']
        # heuristic: large -> amount, else hours
        if abs(val) > 100:
            amount = val
        else:
            hours = val

    return {
        'employee_id': employee_id or '',
        'employee_name': employee_name or '',
        'trade': trade or '',
        'hours': hours,
        'rate': rate,
        'amount': amount,
        'tokens': [t['text'] for t in toks],
    }


def assemble_rows_from_tokens(tokens: List[Dict[str, Any]]) -> Dict[str, Any]:
    classified = classify_tokens(tokens)
    logical_rows = build_logical_rows(classified, overlap_threshold=0.4)

    assembled = []
    accepted = []
    rejected = []

    for grp in logical_rows:
        # skip header-like groups
        if any(t['type'] == 'header' for t in grp):
            rejected.append({'reason': 'header', 'tokens': [t['text'] for t in grp]})
            continue

        row = assemble_fields_for_row(grp)
        # Acceptance rule
        has_trade = bool(row['trade'])
        has_employee = bool(row['employee_id'] or row['employee_name'])
        has_amount_or_hours = (row['amount'] and row['amount'] > 0) or (row['hours'] and row['hours'] > 0)
        if has_trade and has_employee and has_amount_or_hours:
            accepted.append(row)
        else:
            rejected.append({'reason': 'missing_fields', 'row': row})
        assembled.append(row)

    diagnostics = {
        'tokens_classified': len(classified),
        'logical_rows_created': len(logical_rows),
        'rows_assembled': len(assembled),
        'rows_accepted': len(accepted),
        'rows_rejected': len(rejected),
        'tokens': classified,
        'logical_rows': [[t['text'] for t in g] for g in logical_rows],
        'accepted_rows': accepted,
        'rejected_rows': rejected,
    }
    return diagnostics
