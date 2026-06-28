import json
import sys
from pathlib import Path
import cv2

sys.path.append(str(Path(__file__).resolve().parents[1]))

from pipeline.text_extractor import _cluster_ocr_tokens_into_lines
from pipeline.semantic_row_assembler import assemble_rows_from_tokens
from pipeline.columnar_ocr import run_columnar_ocr
from rapidocr_onnxruntime import RapidOCR


def load_crops(debug_dir: Path):
    tokens_all = []
    crop_files = sorted(debug_dir.glob('crop_*_full.png'))
    for cf in crop_files:
        try:
            from PIL import Image
        except Exception:
            Image = None
        if Image is None:
            continue
        img = Image.open(cf)
        # use columnar OCR on this crop for diagnostics (debug pipeline only)
        diag = run_columnar_ocr(img, image_path=str(cf))
        # record events
        # remap tokens to expected token shape used downstream: x,y,w,h,text,confidence,bbox,source_crop
        toks = []
        for t in diag.get('tokens', []):
            bx0, by0, bx1, by1 = t.get('bbox', [0, 0, 0, 0])
            w = max(1, int(bx1 - bx0))
            h = max(1, int(by1 - by0))
            tok = {
                'x': int(bx0),
                'y': int(by0),
                'w': w,
                'h': h,
                'text': t.get('text', ''),
                'confidence': float(t.get('confidence', 0.9)),
                'bbox': [int(bx0), int(by0), int(bx1), int(by1)],
                'source_crop': str(cf.name),
            }
            toks.append(tok)
        # attach diagnostics events to the crop-level object for later inspection
        for ev in diag.get('events', []):
            tokens_all.append({'__diag_event': ev, 'source_crop': str(cf.name)})
        tokens_all.extend(toks)
    return tokens_all


def main():
    debug_dir = Path('ai-service/temp/debug_diagnostics/1782294444184-Alqaser__Alsatea_Tech_Cont__260623_182237')
    if not debug_dir.exists():
        print('debug dir not found:', debug_dir)
        return
    tokens = load_crops(debug_dir)
    # Diagnostic prints: sample tokens and coordinate ranges
    print('\nCOLUMNAR OCR SAMPLE TOKENS')
    sample_tokens = [t for t in tokens if not t.get('__diag_event')]
    for i, token in enumerate(sample_tokens[:20]):
        print(i, type(token), token)

    # Compute X/Y ranges ignoring diag events
    xs = [int(t.get('x', 0)) for t in sample_tokens]
    ys = [int(t.get('y', 0)) for t in sample_tokens]
    min_x, max_x = (min(xs) if xs else 0, max(xs) if xs else 0)
    min_y, max_y = (min(ys) if ys else 0, max(ys) if ys else 0)
    print('X RANGE', min_x, max_x)
    print('Y RANGE', min_y, max_y)

    print('TOKENS BEFORE CLUSTERING', len(sample_tokens))
    print('FIRST TOKEN', sample_tokens[0] if sample_tokens else None)
    # Collect diagnostic events produced by columnar OCR
    diag_events = [t['__diag_event'] for t in tokens if '__diag_event' in t]
    oversized_event = None
    for ev in diag_events:
        if ev.get('event') == 'OVERSIZED_OCR_LAYOUT_DETECTED':
            oversized_event = ev
            break

    if oversized_event is not None:
        print('\nOVERSIZED_OCR_LAYOUT_DETECTED — skipping clustering and semantic reconstruction')
        # Compute MEDIAN_TOKEN_HEIGHT and MAX_TOKEN_HEIGHT from sample tokens
        heights = [int(t.get('h', 0)) for t in sample_tokens]
        import statistics
        median_h = statistics.median(heights) if heights else None
        max_h = max(heights) if heights else None
        # Find OVERSIZED_TOKEN_COUNT from oversized event if present
        oversized_count = oversized_event.get('oversized_count') if oversized_event else None
        # Gather examples from diag events
        examples = []
        for ev in diag_events:
            if ev.get('event') in ('OCR_BOX_REJECTED', 'OCR_BOX_SPLIT_REQUIRED'):
                examples.append(ev.get('example'))

        # Print diagnostics summary
        print('MEDIAN_TOKEN_HEIGHT', median_h)
        print('MAX_TOKEN_HEIGHT', max_h)
        print('OVERSIZED_TOKEN_COUNT', oversized_count)
        print('OVERSIZED_EXAMPLES')
        for ex in examples[:10]:
            print(ex)

        # Write a diagnostic-only JSON and exit
        out = {'diag_events': diag_events, 'oversized_examples': examples[:20], 'tokens': [t for t in tokens if not t.get('__diag_event')][:200]}
        out_path = Path('temp/semantic_debug_oversized.json')
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, 'w', encoding='utf-8') as fh:
            json.dump(out, fh, ensure_ascii=False, indent=2, default=str)
        print('wrote', out_path)
        return

    clusters = _cluster_ocr_tokens_into_lines(tokens)
    print('\nCLUSTER COUNT', len(clusters))
    for idx, cluster in enumerate(clusters[:10]):
        ymins = [int(t.get('y', 0)) for t in cluster]
        ymaxs = [int(t.get('y', 0)) + int(t.get('h', 0)) for t in cluster]
        y_min = min(ymins) if ymins else 0
        y_max = max(ymaxs) if ymaxs else 0
        print(idx, y_min, y_max, len(cluster))
    diagnostics = assemble_rows_from_tokens(tokens)

    out = {
        'tokens': tokens,
        'clusters': diagnostics.get('logical_rows'),
        'accepted_rows': diagnostics.get('accepted_rows'),
        'rejected_rows': diagnostics.get('rejected_rows'),
        'reasons': [],
        'diagnostics': {
            'tokens_classified': diagnostics.get('tokens_classified'),
            'logical_rows_created': diagnostics.get('logical_rows_created'),
            'rows_assembled': diagnostics.get('rows_assembled'),
            'rows_accepted': diagnostics.get('rows_accepted'),
            'rows_rejected': diagnostics.get('rows_rejected'),
        }
    }
    out_path = Path('temp/semantic_debug.json')
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2, default=str)
    print('wrote', out_path)
    # print summary
    total_tokens = len(tokens)
    total_clusters = len(clusters)
    accepted = diagnostics.get('rows_accepted')
    rejected = diagnostics.get('rows_rejected')
    print('total_tokens', total_tokens)
    print('total_clusters', total_clusters)
    print('accepted', accepted)
    print('rejected', rejected)

if __name__ == '__main__':
    main()
