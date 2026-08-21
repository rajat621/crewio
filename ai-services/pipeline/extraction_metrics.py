from __future__ import annotations

import json
import threading
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from pipeline.structured_logging import log_event


METRICS_PATH = Path("temp") / "extraction_metrics.json"
_LOCK = threading.Lock()
_METRICS_CONTEXT: ContextVar[Dict[str, str]] = ContextVar("extraction_metrics_context", default={})


def set_extraction_metrics_context(*, run_id: str = "", pdf_path: str = "") -> None:
    current = dict(_METRICS_CONTEXT.get() or {})
    if run_id:
        current["run_id"] = run_id
    if pdf_path:
        current["pdf_path"] = pdf_path
    _METRICS_CONTEXT.set(current)


def _jsonable(value: Any) -> Any:
    try:
        json.dumps(value)
        return value
    except Exception:
        if isinstance(value, dict):
            return {str(k): _jsonable(v) for k, v in value.items()}
        if isinstance(value, (list, tuple, set)):
            return [_jsonable(v) for v in value]
        return str(value)


def _read_payload(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {"events": [], "latest_by_event": {}}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {"events": [], "latest_by_event": {}}
        payload.setdefault("events", [])
        payload.setdefault("latest_by_event", {})
        return payload
    except Exception:
        return {"events": [], "latest_by_event": {}}


def record_extraction_metric(
    event_name: str,
    metrics: Dict[str, Any],
    *,
    logger: Any = None,
    run_id: str = "",
    pdf_path: str = "",
    stage: str = "",
    extra: Optional[Dict[str, Any]] = None,
    path: Path = METRICS_PATH,
) -> Dict[str, Any]:
    """Append an extraction metric event and mirror it to structured logs.

    This is observability-only: it does not influence extraction decisions.
    """

    context = _METRICS_CONTEXT.get() or {}
    if not run_id:
        run_id = context.get("run_id", "")
    if not pdf_path:
        pdf_path = context.get("pdf_path", "")
    clean_metrics = _jsonable(metrics or {})
    record: Dict[str, Any] = {
        "event": event_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "run_id": run_id or "",
        "pdf_path": pdf_path or "",
        "stage": stage or "",
        "metrics": clean_metrics,
    }
    if extra:
        record["extra"] = _jsonable(extra)

    if logger is not None:
        try:
            log_event(logger, event_name, run_id=run_id or "", pdf_path=pdf_path or "", stage=stage or "", **clean_metrics)
        except Exception:
            pass

    try:
        with _LOCK:
            path.parent.mkdir(parents=True, exist_ok=True)
            payload = _read_payload(path)
            events = payload.setdefault("events", [])
            if isinstance(events, list):
                events.append(record)
                del events[:-1000]
            latest = payload.setdefault("latest_by_event", {})
            if isinstance(latest, dict):
                latest[event_name] = record
            payload["updated_at"] = record["timestamp"]
            path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    except Exception:
        pass

    return record


def reset_extraction_metrics(path: Path = METRICS_PATH) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "events": [],
                    "latest_by_event": {},
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
    except Exception:
        pass
