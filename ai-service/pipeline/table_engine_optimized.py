from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
import json
import os
import time
import threading
from types import SimpleNamespace
from concurrent.futures import ThreadPoolExecutor
try:
    from rapidocr_onnxruntime import RapidOCR  # type: ignore
    _RAPID_AVAILABLE = True
except Exception:
    RapidOCR = None
    _RAPID_AVAILABLE = False

import cv2
import numpy as np

from pipeline.page_preprocessing import preprocess_pages_for_ocr
from pipeline.text_extractor import (
    load_extraction_config,
    apply_runtime_overrides,
    current,
    new_request_collector,
    _convert_from_path,
    _build_cell_boxes_from_bounds,
)
from pipeline.profiler import new_request_collector as _new_prof_collector
from pipeline.debug_utils import ensure_debug
from pipeline.tables.grid_reconstructor import GridReconstructor, GridReconstructorConfig
from pipeline.tables import TableDetector, TableDetectorConfig
from pipeline.tables.grid_reconstructor import GridReconstructor
from pipeline.tables import TableNormalizer, TableNormalizerConfig
from pipeline.tables import CellExtractor, CellExtractorConfig
from pipeline.text_extractor import _extract_table_engine as original_table_engine
from pipeline.text_extractor import _env_int, _env_float
import logging

logger = logging.getLogger(__name__)
_worker_local = threading.local()


def optimized_extract_table_engine(
    pdf_path: str,
    fmt: Any,
    debug: Any,
    config_overrides: Optional[Dict[str, Any]] = None,
    request_cache: Optional[Dict[str, Any]] = None,
) -> Tuple[List[List[List[str]]], List[str], float, str, Dict[str, Any]]:
    """Optimized table engine in separate module."""
    # Ensure debug is never None; use NoOpDebug shim when debugging disabled.
    debug = ensure_debug(debug)
    # read runtime thresholds for optimized engine fallback protection
    OPT_MAX_MS = _env_int("OPTIMIZED_ENGINE_MAX_RUNTIME_MS", 0, minimum=0)
    OPT_MIN_CONF = _env_float("OPTIMIZED_ENGINE_MIN_CONFIDENCE", 0.65, minimum=0.0)

    try:
        if not True:
            return [], ["RapidOCR/pdf2image not available; OCR pipeline skipped"], 0.0, "", {}

        config = load_extraction_config()
        config = apply_runtime_overrides(config, config_overrides)

        prof = current()
        warnings: List[str] = []

        timings: Dict[str, int] = {}
        timing_counts: Dict[str, int] = {}
        cached_pages = list((request_cache or {}).get("preprocessed_pages") or []) if request_cache else []
        if cached_pages:
            pages = cached_pages
        else:
            # rasterize pages (use runtime-configured DPI or default)
            OCR_DPI = _env_int("OCR_RASTER_DPI", 200, minimum=120)
            t0 = time.time()
            pages = _convert_from_path(pdf_path, dpi=OCR_DPI, first_page=1, last_page=max(1, int(1)))
            t1 = time.time()
            timings['rasterization'] = int((t1 - t0) * 1000)
            timing_counts['rasterization'] = 1
            if request_cache is not None and pages:
                request_cache["rasterized_pages"] = list(pages)
            if pages:
                t0 = time.time()
                preprocessed_pages = preprocess_pages_for_ocr(
                    pages,
                    target_long_edge=_env_int("OCR_TARGET_LONG_EDGE", 2200, minimum=1200),
                    margin_pad_px=_env_int("OCR_MARGIN_PAD_PX", 14, minimum=0),
                    max_orientation_dim=_env_int("OCR_ORIENTATION_MAX_DIM", 1400, minimum=600),
                    max_deskew_angle_deg=float(getattr(config.extraction if hasattr(config, 'extraction') else config, "skew", SimpleNamespace(max_angle_deg=8.0)).max_angle_deg),
                )
                t1 = time.time()
                timings['preprocessing'] = int((t1 - t0) * 1000)
                timing_counts['preprocessing'] = len(preprocessed_pages)
                pages = [item.image for item in preprocessed_pages]
                if request_cache is not None:
                    request_cache["preprocessed_pages"] = list(pages)
                    request_cache["preprocessed_page_meta"] = [
                        {
                            "orientation_deg": item.orientation_deg,
                            "deskew_deg": item.deskew_deg,
                            "content_bbox": item.content_bbox,
                            "timings_ms": dict(item.timings_ms),
                            "skipped_steps": list(item.skipped_steps),
                            "warnings": list(item.warnings),
                        }
                        for item in preprocessed_pages
                    ]

        if not pages:
            return [], ["No pages available for OCR"], 0.0, "", {}

        detect_scale = max(0.2, min(0.6, _env_float("TABLE_DETECT_SCALE", 0.35)))
        min_text_density = _env_float("TABLE_MIN_TEXT_DENSITY", 0.02)
        max_candidates = _env_int("MAX_OCR_TABLES_PER_PAGE", 4, minimum=1)
        max_candidates_eval = _env_int("TABLE_MAX_CANDIDATE_EVAL", 6, minimum=1)

        all_tables: List[List[List[str]]] = []
        confidences: List[float] = []
        ocr_text_parts: List[str] = []
        debug_tables: List[Dict[str, Any]] = []
        # local accumulators for detection metrics
        detected_contours_total = 0
        candidate_count_total = 0
        inferred_rows_total = 0
        inferred_columns_total = 0
        generated_cells_total = 0
        # timing accumulators (ms)
        timing_acc = {
            'table_detect': 0,
            'contour_extraction': 0,
            'contour_filtering': 0,
            'region_crop': 0,
            'grid_reconstruction': 0,
            'grid_reconstruction_count': 0,
        }
        acc_lock = threading.Lock()
        normalizer = TableNormalizer(config=TableNormalizerConfig())
        cell_extractor = CellExtractor(
            config=CellExtractorConfig(
                min_confidence=config.ocr.min_confidence,
                debug_dir=None,
                max_cell_area_px=_env_int("MAX_OCR_CELL_AREA_PX", 90000, minimum=10000),
            )
        )

        # load a single shared RapidOCR instance for this extraction if available
        shared_ocr = None
        if _RAPID_AVAILABLE:
            try:
                tstart = time.time()
                shared_ocr = RapidOCR()
                tload = int((time.time() - tstart) * 1000)
                try:
                    if prof:
                        prof.incr("rapid_model_init", 1)
                        prof.set_meta("rapid_model_load_time_ms", tload)
                except Exception:
                    pass
            except Exception:
                shared_ocr = None

        # local instrumentation collectors (file-backed to survive profiler misses)
        all_cell_details_local: List[Dict[str, Any]] = []
        detected_candidates_log: Dict[str, Any] = {}

        start_time = time.time()
        for page_idx, page in enumerate(pages, 1):
            # runtime protection check
            if OPT_MAX_MS > 0:
                elapsed_ms = int((time.time() - start_time) * 1000)
                if elapsed_ms >= OPT_MAX_MS:
                    try:
                        prof = current()
                        if prof and getattr(prof, 'enabled', False):
                            report = prof.report()
                            os.makedirs('temp', exist_ok=True)
                            with open(os.path.join('temp', 'optimized_profiler_report.txt'), 'w', encoding='utf-8') as fh:
                                fh.write(report)
                    except Exception:
                        pass
                    logger.warning('Optimized engine runtime exceeded %d ms: switching to legacy', OPT_MAX_MS)
                    return original_table_engine(pdf_path, fmt, debug, config_overrides, request_cache)

            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
        
        # reset page loop to real iteration
        for page_idx, page in enumerate(pages, 1):
            if isinstance(page, np.ndarray):
                page_img = page.copy()
            else:
                page_img = cv2.cvtColor(np.array(page), cv2.COLOR_RGB2BGR)

            h, w = page_img.shape[:2]
            ds_w = max(1, int(w * detect_scale))
            ds_h = max(1, int(h * detect_scale))
            # ensure variable existence for downstream processing
            detected_ds = SimpleNamespace(contours=[])
            prof = current() or _new_prof_collector()
            td_s = time.time()
            with (prof or new_request_collector()).time_stage("table_detect"):
                ds = cv2.resize(page_img, (ds_w, ds_h), interpolation=cv2.INTER_AREA)
            td_e = time.time()
            try:
                with acc_lock:
                    timing_acc['table_detect'] += int((td_e - td_s) * 1000)
            except Exception:
                pass
                detector = TableDetector(
                    config=TableDetectorConfig(
                        min_table_area_ratio=0.0005,
                        line_scale_divisor=max(10, config.morphology.horizontal_kernel_width),
                        morphology_iterations=config.morphology.open_iterations,
                        deskew_max_angle_deg=config.skew.max_angle_deg if hasattr(config, 'skew') else 8.0,
                        adaptive_block_size=config.preprocessing.adaptive_block_size,
                        adaptive_c=config.preprocessing.adaptive_c,
                        debug_dir=None,
                    )
                )
                # ensure detected_ds is always defined
                detected_ds = SimpleNamespace(contours=[])
                try:
                    detected_ds = detector.detect_tables(ds)
                except Exception:
                    detected_ds = SimpleNamespace(contours=[])
            # record contour counts
            try:
                contour_count = len(getattr(detected_ds, 'contours', []) or [])
                detected_contours_total += int(contour_count)
                if prof:
                    prof.set_meta('detected_contours', int(contour_count))
            except Exception:
                pass

            candidates = []
            scale_x = float(w) / float(ds_w)
            scale_y = float(h) / float(ds_h)
            # contour extraction timing
            ce_s = time.time()
            with (prof or new_request_collector()).time_stage("contour_extraction"):
                for c in detected_ds.contours:
                    x = int(c.x * scale_x)
                    y = int(c.y * scale_y)
                    cw = int(c.w * scale_x)
                    ch = int(c.h * scale_y)
                    if cw <= 0 or ch <= 0:
                        continue
                    area = cw * ch
                    candidates.append((x, y, cw, ch, area))

            ce_e = time.time()
            try:
                with acc_lock:
                    timing_acc['contour_extraction'] += int((ce_e - ce_s) * 1000)
            except Exception:
                pass

            # record candidate count after contour extraction
            try:
                cnt_pre = int(len(candidates))
                candidate_count_total += cnt_pre
                if prof:
                    prof.set_meta('candidate_count_pre_filter', cnt_pre)
            except Exception:
                pass

            candidates = sorted(candidates, key=lambda x: x[4], reverse=True)
            eval_list = candidates[:max_candidates_eval]

            filt_s = time.time()
            filtered = []
            for (x, y, cw, ch, area) in eval_list:
                if cw < _env_int("MIN_OCR_TABLE_WIDTH_PX", 180, minimum=1):
                    continue
                if ch < _env_int("MIN_OCR_TABLE_HEIGHT_PX", 60, minimum=1):
                    continue
                crop = page_img[y:y + ch, x:x + cw]
                if crop is None or crop.size == 0:
                    continue
                gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
                _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
                non_zero = int((th > 0).sum())
                density = float(non_zero) / max(1, (cw * ch))
                if density < min_text_density:
                    continue
                filtered.append((x, y, cw, ch, area))

            filt_e = time.time()
            try:
                with acc_lock:
                    timing_acc['contour_filtering'] += int((filt_e - filt_s) * 1000)
            except Exception:
                pass

            # record filtered candidate count
            try:
                cnt_filt = int(len(filtered))
                candidate_count_total += cnt_filt
                if prof:
                    prof.set_meta('candidate_count_filtered', cnt_filt)
            except Exception:
                pass

            selected = filtered[:max_candidates]
            if request_cache is not None:
                request_cache.setdefault("detected_table_candidates", {})[f"page_{page_idx}"] = [
                    {"x": x, "y": y, "w": w_, "h": h_, "area": a} for (x, y, w_, h_, a) in selected
                ]
            detected_candidates_log[f"page_{page_idx}"] = [
                {"x": x, "y": y, "w": w_, "h": h_, "area": a} for (x, y, w_, h_, a) in selected
            ]

            page_area = float(w * h)
            if len(selected) == 1 and (selected[0][4] / max(1.0, page_area)) >= 0.80:
                selected_only = True
            else:
                selected_only = False

            if not selected:
                warnings.append(f"no_table_candidates_page_{page_idx}")
                # write instrumentation for missing candidates
                try:
                    os.makedirs("temp", exist_ok=True)
                    with open(os.path.join("temp", "detected_table_candidates.json"), "w", encoding="utf-8") as fh:
                        json.dump(detected_candidates_log, fh, indent=2)
                except Exception:
                    pass
                return original_table_engine(pdf_path, fmt, debug, config_overrides, request_cache)

            def _process_candidate(candidate_with_ts):
                # candidate_with_ts: ( (table_idx, (x,y,cw,ch,area)), submit_ts )
                (table_idx, (x, y, cw, ch, area)), submit_ts = candidate_with_ts
                try:
                    from pipeline.profiler import set_current
                    # propagate parent profiler collector into worker thread
                    set_current(prof)
                except Exception:
                    pass

                # ensure per-thread CellExtractor with its own OCR engine (created once per worker)
                try:
                    worker_ex = getattr(_worker_local, 'cell_extractor', None)
                    if worker_ex is None:
                        worker_ex = CellExtractor(
                            config=CellExtractorConfig(
                                min_confidence=config.ocr.min_confidence,
                                debug_dir=None,
                                max_cell_area_px=_env_int("MAX_OCR_CELL_AREA_PX", 90000, minimum=10000),
                            ),
                            ocr_engine=shared_ocr,
                            request_cache=request_cache,
                        )
                        _worker_local.cell_extractor = worker_ex
                except Exception:
                    worker_ex = cell_extractor

                # region cropping + grid reconstruction timing
                rc_s = time.time()
                with (prof or new_request_collector()).time_stage('region_crop'):
                    crop = page_img[y:y + ch, x:x + cw]
                rc_e = time.time()
                try:
                    with acc_lock:
                        timing_acc['region_crop'] += int((rc_e - rc_s) * 1000)
                except Exception:
                    pass

                gr_s = time.time()
                with (prof or new_request_collector()).time_stage('grid_reconstruction'):
                    boundary_recon = GridReconstructor(config=GridReconstructorConfig()).reconstruct(
                        table_image=crop,
                        ocr_cells=[],
                        horizontal_mask=None,
                        vertical_mask=None,
                    )
                gr_e = time.time()
                try:
                    with acc_lock:
                        timing_acc['grid_reconstruction'] += int((gr_e - gr_s) * 1000)
                        timing_acc['grid_reconstruction_count'] += 1
                except Exception:
                    pass
                # collect reconstruction-derived metrics
                try:
                    rows = len(getattr(boundary_recon, 'row_boundaries', []) or [])
                    cols = len(getattr(boundary_recon, 'col_boundaries', []) or [])
                    inferred_rows_total += int(rows)
                    inferred_columns_total += int(cols)
                    if prof:
                        prof.set_meta('inferred_rows', int(rows))
                        prof.set_meta('inferred_columns', int(cols))
                except Exception:
                    pass
                cell_boxes = _build_cell_boxes_from_bounds(boundary_recon.row_boundaries, boundary_recon.col_boundaries)
                # record generated cell count for this candidate
                try:
                    gen_cells = len(cell_boxes or [])
                    generated_cells_total += int(gen_cells)
                    if prof:
                        prof.set_meta('generated_cells', int(gen_cells))
                except Exception:
                    pass
                if not cell_boxes:
                    return table_idx, None, [], 0.0, ""
                max_cells = _env_int("MAX_OCR_CELLS_PER_TABLE", 80, minimum=4)
                try:
                    # cell extraction + OCR timing
                    with (prof or new_request_collector()).time_stage('cell_extraction'):
                        # pass table index for better attribution in profiler metadata
                        rel_cells = worker_ex.extract_cells(crop, cell_boxes[:max_cells], submit_ts=submit_ts, table_index=table_idx, page_number=page_idx)
                except Exception:
                    return table_idx, None, [], 0.0, ""
                if not any(c.get("text") for c in rel_cells):
                    # Fallback: run one-shot batch OCR on the cropped region and cluster tokens into lines
                    try:
                        ocr_engine = RapidOCR() if _RAPID_AVAILABLE else None
                        tokens = _batch_ocr_image(crop, ocr_engine, min_confidence=0.25)
                        if tokens:
                            # cluster tokens into lines using helper from text_extractor
                            from pipeline.text_extractor import _cluster_ocr_tokens_into_lines, _line_text
                            lines = _cluster_ocr_tokens_into_lines(tokens)
                            if lines:
                                rel_cells = []
                                normalized = []
                                for line in lines:
                                    row_texts = [ _line_text([t]) for t in line ]
                                    normalized.append([ _line_text([t]) for t in line ])
                                    # add tokens as rel_cells entries
                                    for t in line:
                                        rel_cells.append({
                                            'x': int(t.get('x',0)),
                                            'y': int(t.get('y',0)),
                                            'w': int(t.get('w',0)),
                                            'h': int(t.get('h',0)),
                                            'text': str(t.get('text') or ''),
                                            'confidence': float(t.get('confidence') or 0.0),
                                        })
                                avg_conf = float(np.mean([float(c.get('confidence',0.0)) for c in rel_cells])) if rel_cells else 0.0
                                text_part = "\n".join([" ".join(r) for r in normalized])
                                return table_idx, normalized, rel_cells, avg_conf, text_part
                    except Exception:
                        pass
                    return table_idx, None, [], 0.0, ""
                gr2_s = time.time()
                with (prof or new_request_collector()).time_stage('grid_reconstruction'):
                    recon = GridReconstructor(config=GridReconstructorConfig()).reconstruct(
                    table_image=crop,
                    ocr_cells=rel_cells,
                    horizontal_mask=None,
                    vertical_mask=None,
                )
                gr2_e = time.time()
                try:
                    with acc_lock:
                        timing_acc['grid_reconstruction'] += int((gr2_e - gr2_s) * 1000)
                        timing_acc['grid_reconstruction_count'] += 1
                except Exception:
                    pass
                with (prof or new_request_collector()).time_stage('normalization'):
                    normalized = normalizer.normalize(recon.table)
                rel_conf = [float(c.get("confidence", 0.0) or 0.0) for c in rel_cells if c.get("text")]
                avg_conf = float(np.mean(rel_conf)) if rel_conf else 0.0
                text_part = "\n".join([" ".join(str(c) for c in row if c) for row in (normalized or [])])
                return table_idx, normalized, rel_cells, avg_conf, text_part

            indexed = list(enumerate(sorted(selected, key=lambda item: item[1])))
            # choose workers based on CPU and candidate count
            max_workers = min(len(indexed), max(1, (os.cpu_count() or 1)))
            results = []
            prof = current()
            with (prof or new_request_collector()).time_stage("threadpool.create"):
                pass
                with ThreadPoolExecutor(max_workers=max_workers) as execp:
                    # submit with timestamp to allow queue wait measurement
                    futures = {execp.submit(_process_candidate, (it, time.time())): it for it in indexed}
                    for fut in futures:
                        try:
                            with (prof or new_request_collector()).time_stage("threadpool.wait"):
                                res = fut.result(timeout=max(30.0, float(_env_int("CELL_OCR_TABLE_TIMEOUT_MS", 12000))/1000.0))
                            results.append(res)
                        except Exception:
                            results.append((futures[fut][0], None, [], 0.0, ""))

            results_sorted = sorted(results, key=lambda r: r[0])
            for _, normalized, rel_cells, avg_conf, text_part in results_sorted:
                if normalized:
                    all_tables.append(normalized)
                    if avg_conf > 0:
                        confidences.append(avg_conf)
                    if text_part:
                        ocr_text_parts.append(text_part)
                    # collect per-cell details into local collector
                    try:
                        for c in rel_cells:
                            # ensure consistent keys
                            rec = dict(c)
                            rec.setdefault('table_index', None)
                            all_cell_details_local.append(rec)
                    except Exception:
                        pass

            if not all_tables:
                # check runtime protection before fallback
                elapsed_ms = int((time.time() - start_time) * 1000)
                if OPT_MAX_MS > 0 and elapsed_ms >= OPT_MAX_MS:
                    logger.warning('Optimized engine exceeded max runtime and produced no tables; falling back')
                    try:
                        prof = current()
                        if prof and getattr(prof, 'enabled', False):
                            report = prof.report()
                            os.makedirs('temp', exist_ok=True)
                            with open(os.path.join('temp', 'optimized_profiler_report.txt'), 'w', encoding='utf-8') as fh:
                                fh.write(report)
                    except Exception:
                        pass
                    return original_table_engine(pdf_path, fmt, debug, config_overrides, request_cache)
                return original_table_engine(pdf_path, fmt, debug, config_overrides, request_cache)

        avg_conf = float(np.mean(confidences)) if confidences else 0.0
        debug_payload = {
            "tables": debug_tables,
            "scan_quality_avg": 0.0,
            "config": {},
            "downscaled_pages": 1,
        }
        # write local instrumentation outputs
        try:
            os.makedirs("temp", exist_ok=True)
            with open(os.path.join("temp", "cell_details.json"), "w", encoding="utf-8") as fh:
                json.dump(all_cell_details_local, fh, indent=2)

            # produce ocr summary
            summary = {
                "total_cells": len(all_cell_details_local),
                "ocr_calls": int(sum(1 for c in all_cell_details_local if c.get('text'))),
                "worker_threads": len(set(c.get('thread_id') for c in all_cell_details_local if c.get('thread_id'))),
                "max_concurrent_ocr": int((current().metadata.get('max_concurrent_ocr', 0) if current() else 0)),
                "rapid_model_init": int((current().counters.get('rapid_model_init', 0) if current() else 0)),
            }
            with open(os.path.join("temp", "ocr_summary.json"), "w", encoding="utf-8") as fh:
                json.dump({"summary": summary}, fh, indent=2)
                # persist optimized engine timings
                try:
                    # augment timing dump with profiler metadata counters when available
                    prof_meta = current().metadata if current() else {}
                    detailed = {
                        'detected_contours_total': int(prof_meta.get('detected_contours_total', detected_contours_total)),
                        'candidate_count_total': int(prof_meta.get('candidate_count_total', candidate_count_total)),
                        'inferred_rows_total': int(prof_meta.get('inferred_rows_total', inferred_rows_total)),
                        'inferred_columns_total': int(prof_meta.get('inferred_columns_total', inferred_columns_total)),
                        'generated_cells_total': int(prof_meta.get('generated_cells_total', generated_cells_total)),
                        'ocr_batch_count': int(prof_meta.get('ocr_batch_count', 0)),
                        'ocr_batch_time_ms': int(prof_meta.get('last_ocr_batch_ms', 0)),
                    }
                    with open(os.path.join("temp", "optimized_timing.json"), "w", encoding="utf-8") as fh:
                        json.dump({"timings": timings, "counts": timing_counts, "detailed": detailed}, fh, indent=2)
                except Exception:
                    pass
        except Exception:
            pass

        return all_tables, warnings, avg_conf, "\n".join(ocr_text_parts), debug_payload
    except Exception as exc:
        logger.exception("optimized engine failure: %s", exc)
        return original_table_engine(pdf_path, fmt, debug, config_overrides, request_cache)
