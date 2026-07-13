#!/usr/bin/env python3
"""Diagnostic script: rasterize a PDF, run table detector, save debug artifacts."""
from pathlib import Path
import os
import sys
import json
import time

# Ensure repository root in path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pdf2image import convert_from_path
import cv2
import numpy as np

from pipeline.tables import TableDetector, TableDetectorConfig
from pipeline.tables.grid_reconstructor import GridReconstructor, GridReconstructorConfig
from pipeline.table_engine_optimized import _env_int, _env_float


def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)


def save_img(path: Path, img):
    # img: numpy BGR or gray
    if img is None:
        return
    ensure_dir(path.parent)
    cv2.imwrite(str(path), img)


def draw_rects(img, rects, color=(0,0,255), thickness=2):
    out = img.copy()
    for (x,y,w,h) in rects:
        cv2.rectangle(out, (int(x),int(y)), (int(x+w), int(y+h)), color, thickness)
    return out


def main(pdf_path):
    pdf = Path(pdf_path)
    if not pdf.exists():
        print('PDF not found:', pdf)
        return
    outdir = Path(ROOT) / 'temp' / 'debug_diagnostics' / pdf.stem
    ensure_dir(outdir)

    OCR_DPI = int(os.getenv('OCR_RASTER_DPI', '250'))
    detect_scale = max(0.2, min(0.6, float(os.getenv('TABLE_DETECT_SCALE', '0.35'))))

    print('Rasterizing', pdf, 'dpi=', OCR_DPI)
    pages = convert_from_path(str(pdf), dpi=OCR_DPI, first_page=1, last_page=1)
    if not pages:
        print('No pages rasterized')
        return
    pil = pages[0]
    page_np = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    h,w = page_np.shape[:2]
    print('Full image:', w, 'x', h, 'pixels:', w*h)
    save_img(outdir / 'page_full.png', page_np)

    # downscale for detection
    ds_w = max(1, int(w * detect_scale))
    ds_h = max(1, int(h * detect_scale))
    ds = cv2.resize(page_np, (ds_w, ds_h), interpolation=cv2.INTER_AREA)
    save_img(outdir / 'page_downscaled.png', ds)

    print('Downscaled image:', ds_w, 'x', ds_h)

    detector = TableDetector(config=TableDetectorConfig())
    print('Running detect_tables...')
    detected = detector.detect_tables(ds)
    print('Detected contours:', len(detected.contours) if hasattr(detected, 'contours') else 'N/A')

    # draw detected contours on ds
    rects_ds = []
    for c in getattr(detected, 'contours', []):
        rects_ds.append((c.x, c.y, c.w, c.h))
    ds_overlay = draw_rects(ds, rects_ds, color=(0,255,0), thickness=2)
    save_img(outdir / 'page_downscaled_detected.png', ds_overlay)

    # map to full res, crop and save
    scale_x = float(w) / float(ds_w)
    scale_y = float(h) / float(ds_h)
    crops = []
    for idx, c in enumerate(getattr(detected, 'contours', [])):
        x = int(c.x * scale_x)
        y = int(c.y * scale_y)
        cw = int(c.w * scale_x)
        ch = int(c.h * scale_y)
        if cw <=0 or ch<=0:
            continue
        crop = page_np[y:y+ch, x:x+cw]
        save_img(outdir / f'crop_{idx:02d}_full.png', crop)
        crop_ds = ds[int(c.y):int(c.y+c.h), int(c.x):int(c.x+c.w)]
        save_img(outdir / f'crop_{idx:02d}_down.png', crop_ds)

        # grid reconstruction and overlay
        recon = GridReconstructor(config=GridReconstructorConfig()).reconstruct(
            table_image=crop,
            ocr_cells=[],
            horizontal_mask=None,
            vertical_mask=None,
        )
        # build cell boxes from boundaries
        rows = recon.row_boundaries
        cols = recon.col_boundaries
        cell_rects = []
        for i in range(len(rows)-1):
            for j in range(len(cols)-1):
                cx = int(cols[j])
                cy = int(rows[i])
                cw2 = int(cols[j+1] - cols[j])
                ch2 = int(rows[i+1] - rows[i])
                cell_rects.append((cx, cy, cw2, ch2))
        overlay = draw_rects(crop.copy(), cell_rects, color=(255,0,0), thickness=1)
        save_img(outdir / f'crop_{idx:02d}_cells.png', overlay)

        crops.append({'idx': idx, 'x': x, 'y': y, 'w': cw, 'h': ch, 'cells': len(cell_rects)})

    with open(outdir / 'metadata.json', 'w', encoding='utf-8') as fh:
        json.dump({'pdf': pdf.name, 'dpi': OCR_DPI, 'full_w': w, 'full_h': h, 'down_w': ds_w, 'down_h': ds_h, 'detect_scale': detect_scale, 'crops': crops}, fh, indent=2)

    print('Saved artifacts to', outdir)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: diagnose_table_failure.py <pdf_path>')
        sys.exit(1)
    main(sys.argv[1])
