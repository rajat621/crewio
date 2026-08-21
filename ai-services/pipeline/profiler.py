from __future__ import annotations

import os
import time
import threading
from contextlib import contextmanager
from typing import Any, Dict, List

_tls = threading.local()


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


class ProfileCollector:
    def __init__(self, enabled: bool = False) -> None:
        self.enabled = bool(enabled)
        self.stages: Dict[str, List[int]] = {}
        self._starts: Dict[str, float] = {}
        self.counters: Dict[str, int] = {}
        self.metadata: Dict[str, Any] = {}

    def start(self, stage: str) -> None:
        if not self.enabled:
            return
        self._starts[stage] = time.time()

    def stop(self, stage: str) -> None:
        if not self.enabled:
            return
        s = self._starts.pop(stage, None)
        if s is None:
            return
        ms = int((time.time() - s) * 1000)
        self.stages.setdefault(stage, []).append(ms)
        if ms > 10000:
            try:
                # lazy import to avoid cycles
                from pipeline.structured_logging import log_event

                log_event(None, "performance_warning", stage=stage, duration_ms=ms)
            except Exception:
                pass

    @contextmanager
    def time_stage(self, stage: str):
        try:
            self.start(stage)
            yield
        finally:
            self.stop(stage)

    def incr(self, key: str, amount: int = 1) -> None:
        if not self.enabled:
            return
        self.counters[key] = int(self.counters.get(key, 0) + int(amount))

    def set_meta(self, key: str, value: Any) -> None:
        if not self.enabled:
            return
        self.metadata[key] = value

    def report(self) -> str:
        if not self.enabled:
            return ""
        lines: List[str] = []
        # Summarize key stages in approximate order
        order = [
            "pdf_load",
            "rasterization",
            "orientation_detection",
            "rotation",
            "deskew",
            "margin_removal",
            "content_detection",
            "preprocessing",
            "google_vision",
            "ocr_request",
            "ocr_parsing",
            "table_detection",
            "table_reconstruction",
            "row_extraction",
            "validation",
            "semantic_processing",
        ]
        total = 0
        detailed: List[Tuple[str, int, int, int, int]] = []
        for k in order:
            vals = self.stages.get(k) or []
            cnt = len(vals)
            total_ms = sum(vals)
            max_ms = int(max(vals)) if vals else 0
            avg_ms = int(total_ms / cnt) if cnt else 0
            total += total_ms
            detailed.append((k, cnt, int(total_ms), avg_ms, max_ms))

        # include any other stages
        other_keys = [k for k in self.stages.keys() if k not in order]
        for k in other_keys:
            vals = self.stages.get(k) or []
            cnt = len(vals)
            total_ms = sum(vals)
            max_ms = int(max(vals)) if vals else 0
            avg_ms = int(total_ms / cnt) if cnt else 0
            total += total_ms
            detailed.append((k, cnt, int(total_ms), avg_ms, max_ms))

        summary_lines = ["================= AI Extraction Profile ================="]
        summary_lines.append(f"{'Stage':25s} | Count | Total(ms) | Avg(ms) | Max(ms)")
        summary_lines.append("---------------------------------------------------------")
        for k, cnt, total_ms, avg_ms, max_ms in detailed:
            summary_lines.append(f"{k:25s} | {cnt:5d} | {total_ms:9d} | {avg_ms:7d} | {max_ms:7d}")
        summary_lines.append("---------------------------------------------------------")
        summary_lines.append(f"{'Total':25s} |      | {int(total):9d} ms")
        summary_lines.append("=========================================================")

        # append metadata counters
        meta_lines = []
        for k, v in self.counters.items():
            meta_lines.append(f"{k}: {v}")
        for k, v in self.metadata.items():
            meta_lines.append(f"{k}: {v}")

        if meta_lines:
            summary_lines.append("--- Meta ---")
            summary_lines.extend(meta_lines)

        return "\n".join(summary_lines)


def set_current(col: ProfileCollector | None) -> None:
    _tls.current = col


def current() -> ProfileCollector | None:
    return getattr(_tls, "current", None)


# Convenience for quick use
def new_request_collector() -> ProfileCollector:
    return ProfileCollector(enabled=_env_flag("AI_PROFILE", False))


# Reuse a singleton no-op collector to avoid allocations when profiling disabled
_NOOP_COLLECTOR = ProfileCollector(enabled=False)


def new_request_collector() -> ProfileCollector:
    enabled = _env_flag("AI_PROFILE", False)
    if not enabled:
        return _NOOP_COLLECTOR
    return ProfileCollector(enabled=True)
