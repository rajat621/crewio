"""
Cell-level OCR extraction.

This module crops each detected cell region and runs RapidOCR offline.
It also applies confidence filtering and light image preprocessing.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from pipeline.profiler import current, new_request_collector
import threading
import time
import cv2
import numpy as np
import hashlib
import os

from pipeline.cache import load_ocr_cache, store_ocr_cache
from pipeline.structured_logging import log_event

try:
    from rapidocr_onnxruntime import RapidOCR  # type: ignore

    _RAPID_OCR_AVAILABLE = True
except Exception:  # pragma: no cover - guarded import
    RapidOCR = None
    _RAPID_OCR_AVAILABLE = False

logger = logging.getLogger(__name__)


OCRCell = Dict[str, Any]
BBox = Tuple[int, int, int, int]


@dataclass
class CellExtractorConfig:
    """Config for OCR and preprocessing behavior."""

    min_box_w: int = 8
    min_box_h: int = 8
    pad_px: int = 2
    min_confidence: float = 0.45
    merge_line_breaks: bool = True
    sharpen: bool = True
    debug_dir: Optional[str] = None
    max_cell_area_px: int = 120000


class CellExtractor:
    """Extract text from table cell boxes using offline RapidOCR."""

    def __init__(self, config: Optional[CellExtractorConfig] = None, ocr_engine: Any = None, request_cache: Optional[Dict[str, Any]] = None) -> None:
        self.config = config or CellExtractorConfig()
        # allow passing a preloaded OCR engine (for reuse across threads)
        self._ocr_engine = ocr_engine if ocr_engine is not None else (RapidOCR() if _RAPID_OCR_AVAILABLE else None)
        # per-request cache for OCR results (hash -> (text, conf, rapid_ms))
        self.request_cache = request_cache if request_cache is not None else {}
        try:
            prof = current()
            if self._ocr_engine is not None:
                # measure rapid model load time
                try:
                    load_time_ms = prof.metadata.get("rapid_model_load_time_ms", 0) if prof and prof.metadata else 0
                except Exception:
                    load_time_ms = 0
                prof_start = time.time() if prof else None
                # RapidOCR() already constructed above; attempt to record
                if prof:
                    prof.incr("rapid_model_init", 1)
                    if prof_start:
                        prof.set_meta("rapid_model_load_time_ms", int((time.time() - prof_start) * 1000))
        except Exception:
            pass

    @property
    def is_ocr_available(self) -> bool:
        """Whether RapidOCR backend is available."""

        return self._ocr_engine is not None

    def extract_cells(self, image: np.ndarray, boxes: Sequence[BBox], table_offset: Tuple[int, int] = (0, 0), submit_ts: Optional[float] = None, table_index: Optional[int] = None, page_number: Optional[int] = None) -> List[OCRCell]:
        """
        OCR each cell and return position-preserving dictionaries.

        Args:
            image: BGR or grayscale image containing the table.
            boxes: Iterable of (x, y, w, h) boxes relative to image.
            table_offset: Optional absolute table offset in parent page.

        Returns:
            List of dict entries in the form:
            {x, y, w, h, text, confidence}
        """


        prof = current()
        with (prof or new_request_collector()).time_stage("cell_extractor.extract_cells"):
            if image is None or image.size == 0:
                raise ValueError("Input image is empty")

            h_img, w_img = image.shape[:2]
            dx, dy = table_offset

            cells: List[OCRCell] = []

            start_extract = time.time()
            queue_wait_base = (start_extract - submit_ts) if submit_ts else 0.0

            # ensure concurrency tracking structures exist in profiler metadata
            try:
                if prof:
                    meta = prof.metadata or {}
                    if "cell_concurrency_lock" not in meta:
                        meta["cell_concurrency_lock"] = threading.Lock()
                    if "active_ocr" not in meta:
                        meta["active_ocr"] = 0
                    if "max_concurrent_ocr" not in meta:
                        meta["max_concurrent_ocr"] = 0
                    if "worker_thread_ids" not in meta:
                        meta["worker_thread_ids"] = []
                    prof.set_meta("cell_concurrency_initialized", True)
            except Exception:
                pass

            # --- Prepare all crops, compute hashes and short-circuit cache hits ---
            tasks = []  # list of (idx, x,y,w,h, padded, prepared, hval)
            persistent_dir = os.getenv('OCR_PERSISTENT_CACHE_DIR')
            for idx, box in enumerate(boxes):
                cell_start = time.time()
                x, y, w, h = self._sanitize_box(box, w_img, h_img)
                if w < self.config.min_box_w or h < self.config.min_box_h:
                    continue
                if w * h > max(1, int(self.config.max_cell_area_px)):
                    logger.info("Skipping oversized OCR cell: x=%s y=%s w=%s h=%s", x, y, w, h)
                    cell_record = {
                        "x": int(x + dx),
                        "y": int(y + dy),
                        "w": int(w),
                        "h": int(h),
                        "text": "",
                        "confidence": 0.0,
                    }
                    if page_number is not None:
                        cell_record["page_number"] = int(page_number)
                    cells.append(cell_record)
                    continue

                padded = self._apply_padding(x, y, w, h, w_img, h_img)
                crop = image[padded[1] : padded[1] + padded[3], padded[0] : padded[0] + padded[2]]
                prepared = self._prepare_crop(crop)

                try:
                    _, enc = cv2.imencode('.png', prepared)
                    hval = hashlib.sha256(enc.tobytes()).hexdigest()
                except Exception:
                    hval = None

                used_cache = False
                cache_text = None
                cache_conf = 0.0
                cache_rapid_ms = 0

                # check in-memory request-local cache first
                if hval and self.request_cache is not None:
                    cache = self.request_cache.setdefault('ocr_cache', {})
                    entry = cache.get(hval)
                    if entry:
                        cache_text, cache_conf, cache_rapid_ms = entry
                        used_cache = True
                        try:
                            prof.incr('ocr_cache_hits', 1)
                        except Exception:
                            pass

                # if not found and persistent cache enabled, check filesystem cache
                if (not used_cache) and hval and persistent_dir and OCR_CACHE_ENABLED():
                    entry = load_ocr_cache(persistent_dir, hval)
                    if entry:
                        cache_text, cache_conf, cache_rapid_ms = entry
                        used_cache = True
                        try:
                            prof.incr('ocr_cache_hits', 1)
                        except Exception:
                            pass

                if not used_cache:
                    try:
                        prof.incr('ocr_cache_misses', 1)
                    except Exception:
                        pass

                tasks.append({
                    'idx': idx,
                    'box': (x, y, w, h),
                    'padded': padded,
                    'prepared': prepared,
                    'hval': hval,
                    'from_cache': used_cache,
                    'cache_text': cache_text,
                    'cache_conf': cache_conf,
                    'cache_rapid_ms': cache_rapid_ms,
                })

            # If there are no tasks, return recorded cells
            if not tasks:
                return cells

            # --- Adaptive strategy: decide cell vs row OCR mode ---
            num_cells = len(tasks)
            expected_per_call_ms = _estimate_expected_ocr_ms(self, prof)
            estimated_cost_s = (expected_per_call_ms * num_cells) / 1000.0
            ocr_mode = 'cell'
            try:
                prof.set_meta('ocr_mode', ocr_mode)
            except Exception:
                pass

            if num_cells > 300 or estimated_cost_s > 30.0:
                ocr_mode = 'row'
            if estimated_cost_s > 60.0:
                logger.warning('OCR_RUNTIME_WARNING estimated_s=%s', estimated_cost_s)
            if estimated_cost_s > 120.0:
                ocr_mode = 'row'

            try:
                prof.set_meta('ocr_mode', ocr_mode)
            except Exception:
                pass

            # --- small-cell aggregation (row-wise) for efficiency ---
            merged_tasks = self._merge_small_adjacent_cells(tasks, image, mode=ocr_mode)

            # Validate merged task keys align with built tasks (handles row_fallback where keys may reference old grid indexes)
            try:
                max_key = max([k for m in merged_tasks for k in m.get('keys', [])]) if merged_tasks else -1
            except Exception:
                max_key = -1

            if max_key >= len(tasks) or max_key < 0:
                # Mismatch detected — rebuild mapping from final boxes (no reuse of previous grid keys)
                try:
                    log_event(logger, "ROW_FALLBACK_ENABLED", table_index=table_index, table_offset=table_offset, task_count=len(tasks), merged_count=len(merged_tasks))
                except Exception:
                    pass
                try:
                    log_event(logger, "CELL_MAPPING_MISMATCH", table_index=table_index, max_key=max_key, task_count=len(tasks))
                except Exception:
                    pass

                # rebuild merged_tasks as singletons from tasks
                rebuilt = []
                for i, t in enumerate(tasks):
                    rebuilt.append({
                        'keys': [i],
                        'prepared': t['prepared'],
                        'union_bbox': t['box'],
                        'boxes': [t['box']],
                    })
                merged_tasks = rebuilt
                try:
                    log_event(logger, "CELL_MAPPING_REBUILT", table_index=table_index, new_merged_count=len(merged_tasks))
                except Exception:
                    pass

            # Build list of crops that actually need OCR (skip cache hits)
            ocr_jobs = []  # list of (task_key, prepared_image)
            for m in merged_tasks:
                # m: {'keys': [task_indexes], 'prepared': np.ndarray, 'union_bbox':(...), 'boxes': [...]}
                needs = any(not tasks[k]['from_cache'] for k in m['keys'])
                if needs:
                    ocr_jobs.append((m['keys'], m['prepared'], m.get('union_bbox'), m.get('boxes')))

            # Batch OCR: configure
            batch_size = int(os.getenv('OCR_BATCH_SIZE', '32'))
            max_workers = min((os.cpu_count() or 1), 8)
            try:
                prof.set_meta('ocr_batch_size', batch_size)
                prof.set_meta('ocr_parallel_workers', min(max_workers, max(1, (len(ocr_jobs)//batch_size))))
            except Exception:
                pass

            # Create batches
            batches = [ocr_jobs[i:i+batch_size] for i in range(0, len(ocr_jobs), batch_size)]

            # Avoid thread creation overhead if <2 batches
            use_threads = len(batches) >= 2 and min(max_workers, len(batches)) >= 2

            batch_results = []  # list of tuples (keys_list, result)
            start_all = time.time()
            try:
                log_event(logger, "OCR_TASKS_CREATED", table_index=table_index, ocr_job_count=len(ocr_jobs), batch_count=len(batches))
            except Exception:
                pass
            try:
                if use_threads:
                    from concurrent.futures import ThreadPoolExecutor, as_completed
                    workers = min(max_workers, len(batches))
                    with ThreadPoolExecutor(max_workers=workers) as ex:
                        futs = {ex.submit(self._process_batch, b): b for b in batches}
                        for fut in as_completed(futs):
                            try:
                                batch_results.extend(fut.result())
                            except Exception:
                                batch_results.extend([])
                else:
                    # sequential batches
                    for b in batches:
                        batch_results.extend(self._process_batch(b))
            finally:
                try:
                    prof.set_meta('ocr_batch_time_ms', int((time.time() - start_all) * 1000))
                except Exception:
                    pass

            try:
                log_event(logger, "OCR_TASKS_COMPLETED", table_index=table_index, batch_results_count=len(batch_results))
            except Exception:
                pass

            # --- map batch_results back to individual cells and fill cache ---
            for keys, res in batch_results:
                # res is list of per-merged-item OCR outputs (one per merged crop)
                # if res is a list of lists (per merged item), iterate
                for item_idx, out in enumerate(res):
                    # keys[item_idx] is list of task indexes that this merged output corresponds to
                    target_keys = keys[item_idx]
                    # out may be None (failed); if so, fallback to blanks
                    if not out:
                        for k in target_keys:
                            t = tasks[k]
                            cells.append({
                                "x": int(t['box'][0] + dx),
                                "y": int(t['box'][1] + dy),
                                "w": int(t['box'][2]),
                                "h": int(t['box'][3]),
                                "text": "",
                                "confidence": 0.0,
                                "ocr_ms": 0,
                                "prep_ms": 0,
                                "pad_ms": 0,
                                "cell_total_ms": 0,
                                "thread_id": int(threading.get_ident()),
                                "queue_wait_ms": int(queue_wait_base * 1000),
                                "cell_index": t['idx'],
                                "table_index": table_index,
                                "bbox": [int(t['box'][0] + dx), int(t['box'][1] + dy), int(t['box'][2]), int(t['box'][3])],
                                "size": f"{t['box'][2]}x{t['box'][3]}",
                                "area_px": int(t['box'][2] * t['box'][3]),
                                "text_len": 0,
                                "preprocessing_applied": True,
                                "from_cache": False,
                                "rapid_ms": 0,
                            })
                        continue

                    # out expected as list of per-merged-crop OCR results; each res item is either a single string or list of word items with boxes
                    # We expect out[item_idx] to be either {'per_cell': [(text,conf,rapid_ms), ...]} mapping to target_keys
                    per_cell_results = out.get('per_cell') if isinstance(out, dict) and 'per_cell' in out else None
                    if per_cell_results and len(per_cell_results) == len(target_keys):
                        for k, (text, conf, rapid_ms) in zip(target_keys, per_cell_results):
                            t = tasks[k]
                            cell_total_ms = int((time.time() - start_all) * 1000)
                            cell = {
                                "x": int(t['box'][0] + dx),
                                "y": int(t['box'][1] + dy),
                                "w": int(t['box'][2]),
                                "h": int(t['box'][3]),
                                "text": text,
                                "confidence": float(conf),
                                "ocr_ms": int(rapid_ms),
                                "prep_ms": 0,
                                "pad_ms": 0,
                                "cell_total_ms": cell_total_ms,
                                "thread_id": int(threading.get_ident()),
                                "queue_wait_ms": int(queue_wait_base * 1000),
                                "cell_index": t['idx'],
                                "table_index": table_index,
                                "bbox": [int(t['box'][0] + dx), int(t['box'][1] + dy), int(t['box'][2]), int(t['box'][3])],
                                "size": f"{t['box'][2]}x{t['box'][3]}",
                                "area_px": int(t['box'][2] * t['box'][3]),
                                "text_len": len(text) if text else 0,
                                "preprocessing_applied": False,
                                "from_cache": False,
                                "rapid_ms": int(rapid_ms),
                            }
                            if page_number is not None:
                                cell["page_number"] = int(page_number)
                            cells.append(cell)
                            # store in request cache and persistent cache
                            try:
                                if t['hval'] and self.request_cache is not None:
                                    cache = self.request_cache.setdefault('ocr_cache', {})
                                    cache[t['hval']] = (text, conf, rapid_ms)
                                if t['hval'] and persistent_dir and OCR_CACHE_ENABLED():
                                    store_ocr_cache(persistent_dir, t['hval'], (text, conf, rapid_ms))
                            except Exception:
                                pass
                    else:
                        # fallback: if mapping not available, try to assign full merged text to first cell and blanks to others to preserve ordering
                        merged_text = out.get('text') if isinstance(out, dict) and 'text' in out else ''
                        merged_conf = out.get('confidence', 0.0) if isinstance(out, dict) else 0.0
                        for k in target_keys:
                            t = tasks[k]
                            text = merged_text if k == target_keys[0] else ''
                            conf = merged_conf if k == target_keys[0] else 0.0
                            cell = {
                                "x": int(t['box'][0] + dx),
                                "y": int(t['box'][1] + dy),
                                "w": int(t['box'][2]),
                                "h": int(t['box'][3]),
                                "text": text,
                                "confidence": float(conf),
                                "ocr_ms": 0,
                                "prep_ms": 0,
                                "pad_ms": 0,
                                "cell_total_ms": 0,
                                "thread_id": int(threading.get_ident()),
                                "queue_wait_ms": int(queue_wait_base * 1000),
                                "cell_index": t['idx'],
                                "table_index": table_index,
                                "bbox": [int(t['box'][0] + dx), int(t['box'][1] + dy), int(t['box'][2]), int(t['box'][3])],
                                "size": f"{t['box'][2]}x{t['box'][3]}",
                                "area_px": int(t['box'][2] * t['box'][3]),
                                "text_len": len(text) if text else 0,
                                "preprocessing_applied": False,
                                "from_cache": False,
                                "rapid_ms": 0,
                            }
                            if page_number is not None:
                                cell["page_number"] = int(page_number)
                            cells.append(cell)

            # write debug and metadata into profiler
            try:
                if prof:
                    prof.set_meta('ocr_batch_count', len(batches))
            except Exception:
                pass

            # append detailed metadata per cell into profiler
            try:
                if prof:
                    details = prof.metadata.get("cell_details", []) if prof.metadata else []
                    details.extend(cells)
                    prof.set_meta("cell_details", details)
            except Exception:
                pass

            # preserve original return shape and ordering (sort by cell_index)
            cells = sorted(cells, key=lambda c: c.get('cell_index', 0))

            # --- Attempt to reconstruct rows from OCR tokens when no formal grid exists ---
            try:
                # cluster by vertical center (y + h/2)
                tokens = [c for c in cells if c.get('text')]
                centers = [(int(c['y'] + c['h'] / 2), c) for c in tokens]
                centers.sort(key=lambda x: x[0])
                clusters: List[List[Dict[str, Any]]] = []
                tol = int(os.getenv('OCR_ROW_CLUSTER_TOLERANCE', '18'))
                for y, cell in centers:
                    if not clusters or abs(clusters[-1][0][0] - y) > tol:
                        clusters.append([(y, cell)])
                    else:
                        clusters[-1].append((y, cell))

                reconstructed_rows: List[Dict[str, Any]] = []
                accepted_rows = 0
                for cl in clusters:
                    # sort by x and join texts
                    row_cells = [c for (_, c) in sorted(cl, key=lambda t: t[1]['x'])]
                    texts = [str(c.get('text') or '').strip() for c in row_cells if (c.get('text') or '').strip()]
                    row_text = ' | '.join(texts)

                    # simple heuristics
                    amount = None
                    m = re.findall(r"\d+[\.,]?\d{0,2}", row_text)
                    if m:
                        try:
                            amount = float(m[-1].replace(',', '.'))
                        except Exception:
                            amount = None

                    # trade: look for uppercase alpha tokens
                    trade = None
                    words = re.findall(r"[A-Za-z\&/\-]{3,}", row_text)
                    for w in words:
                        if w.isalpha() and w.upper() == w and len(w) > 2:
                            trade = w
                            break

                    employee_name = None
                    # heuristic: tokens with spaces and letters, not all-caps
                    for txt in texts:
                        if txt and any(ch.isalpha() for ch in txt) and not txt.isupper() and len(txt.split()) >= 2:
                            employee_name = txt
                            break

                    row_obj = {
                        'text': row_text,
                        'cells': row_cells,
                        'amount': amount,
                        'trade': trade,
                        'employee_name': employee_name,
                    }
                    reconstructed_rows.append(row_obj)
                    if trade and amount and float(amount) > 0:
                        accepted_rows += 1

                try:
                    prof.set_meta('reconstructed_rows', reconstructed_rows)
                    prof.set_meta('reconstructed_rows_count', len(reconstructed_rows))
                except Exception:
                    pass

                try:
                    log_event(logger, 'ROWS_RECONSTRUCTED', table_index=table_index, reconstructed_count=len(reconstructed_rows), accepted_rows=accepted_rows)
                except Exception:
                    pass
            except Exception:
                # non-fatal; row reconstruction best-effort
                pass
            return cells

    def _ocr_cell(self, crop: np.ndarray) -> Tuple[str, float, int, bool]:
        """Run OCR with confidence-aware line filtering."""

        prof = current()
        with (prof or new_request_collector()).time_stage("cell_extractor._ocr_cell"):
            if self._ocr_engine is None:
                return "", 0.0, 0, False

            try:
                # concurrency accounting: increment active OCR count
                rapid_start = time.time()
                # record active concurrent OCR
                try:
                    if prof and prof.metadata:
                        lock = prof.metadata.get("cell_concurrency_lock")
                        if lock:
                            with lock:
                                active = prof.metadata.get("active_ocr", 0) + 1
                                prof.set_meta("active_ocr", active)
                                if active > prof.metadata.get("max_concurrent_ocr", 0):
                                    prof.set_meta("max_concurrent_ocr", active)
                except Exception:
                    pass

                result, _ = self._ocr_engine(crop)
                rapid_ms = int((time.time() - rapid_start) * 1000)
                used_cache = False
                try:
                    if prof:
                        prof.incr("rapid_calls", 1)
                        prof.set_meta("last_rapid_ms", rapid_ms)
                except Exception:
                    pass
                finally:
                    try:
                        if prof and prof.metadata:
                            lock = prof.metadata.get("cell_concurrency_lock")
                            if lock:
                                with lock:
                                    prof.set_meta("active_ocr", max(0, prof.metadata.get("active_ocr", 0) - 1))
                    except Exception:
                        pass
            except Exception as exc:
                logger.warning("RapidOCR cell OCR failed: %s", exc)
                return "", 0.0, 0, False

            if not result:
                return "", 0.0, rapid_ms if 'rapid_ms' in locals() else 0, False

            parse_start = time.time()
            parts: List[str] = []
            confs: List[float] = []

            for item in result:
                text = str(item[1] or "").strip()
                score = float(item[2] or 0.0)
                if not text:
                    continue
                if score < self.config.min_confidence:
                    continue

                parts.append(text)
                confs.append(score)

            parse_ms = int((time.time() - parse_start) * 1000)

            if not parts:
                return "", 0.0, rapid_ms if 'rapid_ms' in locals() else 0, False

            joiner = " " if self.config.merge_line_breaks else "\n"
            full_text = joiner.join(parts).strip()
            mean_conf = float(np.mean(confs)) if confs else 0.0

            # record parsing timing
            try:
                if prof:
                    details = prof.metadata.get("last_cell_parse_ms", 0)
                    prof.set_meta("last_cell_parse_ms", parse_ms)
            except Exception:
                pass

            return full_text, mean_conf, rapid_ms if 'rapid_ms' in locals() else 0, False

    def _prepare_crop(self, crop: np.ndarray) -> np.ndarray:
        """Enhance cell crop to improve OCR quality on faint scans."""

        gray = self._to_gray(crop)
        denoised = cv2.fastNlMeansDenoising(gray, h=8)

        resized = cv2.resize(denoised, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)

        _, binary = cv2.threshold(resized, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        if self.config.sharpen:
            kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
            binary = cv2.filter2D(binary, -1, kernel)

        return binary

    def _sanitize_box(self, box: BBox, max_w: int, max_h: int) -> BBox:
        """Clamp OCR box to image boundaries."""

        x, y, w, h = [int(v) for v in box]

        x = max(0, min(x, max_w - 1))
        y = max(0, min(y, max_h - 1))
        w = max(0, min(w, max_w - x))
        h = max(0, min(h, max_h - y))

        return x, y, w, h

    def _apply_padding(self, x: int, y: int, w: int, h: int, max_w: int, max_h: int) -> BBox:
        """Expand a box by a small padding margin."""

        p = max(int(self.config.pad_px), 0)

        x0 = max(0, x - p)
        y0 = max(0, y - p)
        x1 = min(max_w, x + w + p)
        y1 = min(max_h, y + h + p)

        return x0, y0, max(0, x1 - x0), max(0, y1 - y0)

    def _debug_write(self, stem: str, image: np.ndarray) -> None:
        """Write debug image if debug directory is configured."""

        if not self.config.debug_dir:
            return

        out_dir = Path(self.config.debug_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(out_dir / f"{stem}.png"), image)

    @staticmethod
    def _to_gray(image: np.ndarray) -> np.ndarray:
        """Convert BGR input to grayscale."""

        if len(image.shape) == 2:
            return image
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    def _estimate_expected_ocr_ms(self, prof=None) -> int:
        """Estimate expected per-cell OCR ms from profiler metadata or a sensible default."""
        try:
            if prof and getattr(prof, 'metadata', None):
                last = prof.metadata.get('last_rapid_ms')
                if last:
                    return int(last)
        except Exception:
            pass
        # fallback default (ms)
        return int(os.getenv('OCR_ESTIMATED_PER_CALL_MS', '7000'))

    def _process_batch(self, batch: List[Tuple[List[int], np.ndarray]]):
        """Process a batch (list of (keys, prepared_image)) and return [(keys_list, [per_merged_outs...])]"""
        prof = current()
        results = []
        # prepare list of images and extra mapping info
        keys_list = [keys for keys, img, ubox, boxes in batch]
        imgs = [img for keys, img, ubox, boxes in batch]
        ubxes = [ubox for keys, img, ubox, boxes in batch]
        boxes_list = [boxes for keys, img, ubox, boxes in batch]
        start = time.time()
        try:
            # try batch API if available
            raw = None
            try:
                if hasattr(self._ocr_engine, 'batch'):
                    raw = self._ocr_engine.batch(imgs)
                else:
                    # try calling with list
                    raw = self._ocr_engine(imgs)
            except Exception:
                # fallback to per-image calls
                raw = [self._ocr_engine(img) for img in imgs]

            # normalize raw to list and map words back to sub-cells when possible
            per_item = []
            for i, r in enumerate(raw):
                interpreted = self._interpret_ocr_output(r)
                # if we have words and mapping boxes, assign words to subcells
                boxes_info = boxes_list[i] if i < len(boxes_list) else None
                ubox = ubxes[i] if i < len(ubxes) else None
                if isinstance(interpreted, dict) and 'words' in interpreted and boxes_info and ubox:
                    # words: list of (bbox, text, conf)
                    words = interpreted['words']
                    # prepare containers
                    per_cell_words = [[] for _ in boxes_info]
                    ux, uy, uw, uh = ubox
                    for wbox, wtext, wconf in words:
                        try:
                            if not wbox:
                                # append to first cell as fallback
                                per_cell_words[0].append((wtext, wconf))
                                continue
                            # detect bbox format
                            if len(wbox) >= 4:
                                wx = float(wbox[0])
                                ww = float(wbox[2])
                            else:
                                wx = float(wbox[0])
                                ww = 0.0
                            # center x relative to merged crop
                            cx = wx + ww / 2.0
                            assigned = False
                            for si, sb in enumerate(boxes_info):
                                sx_rel = float(sb[0] - ux)
                                sw = float(sb[2])
                                if cx >= sx_rel and cx <= (sx_rel + sw):
                                    per_cell_words[si].append((wtext, wconf))
                                    assigned = True
                                    break
                            if not assigned:
                                per_cell_words[0].append((wtext, wconf))
                        except Exception:
                            per_cell_words[0].append((wtext, wconf))
                    # convert per_cell_words to per_cell_results
                    per_cell_results = []
                    for lst in per_cell_words:
                        texts = [t for t, _ in lst]
                        confs = [float(c) for _, c in lst] if lst else []
                        txt = ' '.join(texts).strip()
                        mean_conf = float(np.mean(confs)) if confs else 0.0
                        per_cell_results.append((txt, mean_conf, int(0)))
                    per_item.append({'per_cell': per_cell_results})
                else:
                    per_item.append(interpreted)
            results.append((keys_list, per_item))
            try:
                if prof:
                    prof.incr('ocr_batch_count', 1)
            except Exception:
                pass
            return results
        except Exception:
            return [(keys_list, [None] * len(imgs))]
        finally:
            try:
                if prof:
                    prof.set_meta('last_ocr_batch_ms', int((time.time() - start) * 1000))
            except Exception:
                pass

    def _interpret_ocr_output(self, raw):
        """Interpret raw OCR output into a mapping suitable for merged-crop splitting.

        Returns a dict with either 'per_cell': [(text,conf,rapid_ms), ...] or 'text'/'confidence'.
        If raw contains bounding boxes, we return positions so caller can map to cells.
        """
        # raw is usually a list of tuples like (bbox, text, conf)
        try:
            if not raw:
                return {'text': '', 'confidence': 0.0}
            # if raw is a list of items with bbox
            words = []
            for item in raw:
                try:
                    bbox = item[0] if isinstance(item[0], (list, tuple)) else None
                    text = str(item[1] or '').strip()
                    conf = float(item[2] or 0.0)
                    if not text:
                        continue
                    words.append((bbox, text, conf))
                except Exception:
                    continue

            # collapse words into a single text if no bbox info
            if not any(w[0] for w in words):
                # simple join
                texts = [w[1] for w in words]
                confs = [w[2] for w in words]
                return {'text': ' '.join(texts).strip(), 'confidence': float(np.mean(confs) if confs else 0.0)}

            # if bbox info present, return raw words so caller can assign to subcells
            return {'words': words}
        except Exception:
            return {'text': '', 'confidence': 0.0}

    def _merge_small_adjacent_cells(self, tasks: List[Dict[str, Any]], image: Optional[np.ndarray] = None, mode: str = 'auto') -> List[Dict[str, Any]]:
        """Merge neighboring small cells into larger strips per row.

        Returns list of {'keys':[idxs], 'prepared': np.ndarray, 'union_bbox':(...)}.
        """
        if not tasks:
            return []
        # sort by y then x
        sorted_tasks = sorted(tasks, key=lambda t: (t['box'][1], t['box'][0]))
        heights = [t['box'][3] for t in sorted_tasks]
        median_h = int(np.median(heights)) if heights else 0
        groups = []
        cur = None
        for t in sorted_tasks:
            x, y, w, h = t['box']
            is_small = False
            try:
                is_small = (w * h) < max(1, median_h * max(1, w) * 0.2) if median_h else False
            except Exception:
                is_small = False
            if cur is None:
                cur = {'keys': [t['idx']], 'boxes': [t['box']]}
                continue
            last_box = cur['boxes'][-1]
            v_ov = max(0, min(last_box[1] + last_box[3], y + h) - max(last_box[1], y))
            if mode == 'row':
                # group by row irrespective of small size
                cond = v_ov >= min(last_box[3], h) * 0.25
            else:
                cond = v_ov >= min(last_box[3], h) * 0.25 and is_small
            if cond:
                cur['keys'].append(t['idx'])
                cur['boxes'].append(t['box'])
            else:
                groups.append(cur)
                cur = {'keys': [t['idx']], 'boxes': [t['box']]}
        if cur:
            groups.append(cur)

        merged = []
        for g in groups:
            keys = g['keys']
            boxes = g['boxes']
            if image is None:
                first_idx = keys[0]
                merged.append({'keys': keys, 'prepared': tasks[first_idx]['prepared']})
                continue
            x0 = min(b[0] for b in boxes)
            y0 = min(b[1] for b in boxes)
            x1 = max(b[0] + b[2] for b in boxes)
            y1 = max(b[1] + b[3] for b in boxes)
            x0c, y0c, w_union, h_union = int(x0), int(y0), int(x1 - x0), int(y1 - y0)
            crop = image[y0c:y0c + h_union, x0c:x0c + w_union]
            prepared = self._prepare_crop(crop)
            merged.append({'keys': keys, 'prepared': prepared, 'union_bbox': (x0c, y0c, w_union, h_union), 'boxes': boxes})
        return merged

def OCR_CACHE_ENABLED() -> bool:
    return os.getenv('OCR_CACHE_ENABLED', 'true').lower() in ('1', 'true', 'yes')

def _estimate_expected_ocr_ms(self_obj, prof=None) -> int:
    try:
        if prof and getattr(prof, 'metadata', None):
            last = prof.metadata.get('last_rapid_ms')
            if last:
                return int(last)
    except Exception:
        pass
    return int(os.getenv('OCR_ESTIMATED_PER_CALL_MS', '7000'))




def extract_cell_texts(
    image: np.ndarray,
    boxes: Sequence[BBox],
    table_offset: Tuple[int, int] = (0, 0),
    page_number: Optional[int] = None,
    config: Optional[CellExtractorConfig] = None,
) -> List[OCRCell]:
    """Convenience function for one-shot cell OCR."""

    extractor = CellExtractor(config=config)
    return extractor.extract_cells(image=image, boxes=boxes, table_offset=table_offset, page_number=page_number)
