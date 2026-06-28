import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from pipeline.text_extractor import _convert_from_path, _batch_ocr_image
try:
    from rapidocr_onnxruntime import RapidOCR
    eng = RapidOCR()
    print('RapidOCR available')
except Exception as e:
    eng = None
    print('RapidOCR not available:', e)
PDF = 'backend/src/storage/uploads/timesheets/1782294444184-Alqaser__Alsatea_Tech_Cont__260623_182237.pdf'
pages = _convert_from_path(PDF, dpi=200, first_page=1, last_page=1)
if not pages:
    print('No pages')
    sys.exit(0)
img = pages[0]
import numpy as np
try:
    arr = np.array(img)
except Exception:
    arr = img
cells = _batch_ocr_image(arr, eng, min_confidence=0.2)
print('tokens:', len(cells))
for i,c in enumerate(cells[:20]):
    print(i, repr(c.get('text')[:80]), c.get('confidence'))
