from __future__ import annotations

import json
import os
import threading
import time
from typing import Any, Dict

from config_runtime import CONFIG


_lock = threading.Lock()
_memory_state: Dict[str, Dict[str, Any]] = {}


def _now_ms() -> int:
    return int(time.time() * 1000)


def _default_state(provider: str) -> Dict[str, Any]:
    return {
        "provider": provider,
        "state": "CLOSED",
        "failure_count": 0,
        "half_open_success_count": 0,
        "opened_at_ms": 0,
        "updated_at_ms": _now_ms(),
        "last_failure_category": "",
    }


def _cache_path() -> str:
    path = CONFIG.provider_health.shared_cache_path
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    return path


def _read_shared() -> Dict[str, Any]:
    path = _cache_path()
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            loaded = json.load(fh)
            return loaded if isinstance(loaded, dict) else {}
    except Exception:
        return {}


def _write_shared(state: Dict[str, Any]) -> None:
    path = _cache_path()
    tmp = f"{path}.tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(state, fh, ensure_ascii=True)
        os.replace(tmp, path)
    except Exception:
        pass


def _prune_stale(all_state: Dict[str, Any]) -> Dict[str, Any]:
    ttl_ms = CONFIG.provider_health.state_ttl_ms
    now = _now_ms()
    out: Dict[str, Any] = {}
    for key, value in all_state.items():
        updated = int((value or {}).get("updated_at_ms", 0))
        if updated <= 0 or (now - updated) > ttl_ms:
            continue
        out[key] = value
    return out


def get_provider_state(provider: str) -> Dict[str, Any]:
    provider = str(provider or "unknown").lower()
    with _lock:
        all_state = _prune_stale(_read_shared())
        shared = all_state.get(provider)
        if isinstance(shared, dict):
            _memory_state[provider] = dict(shared)
            return dict(shared)
        local = _memory_state.get(provider) or _default_state(provider)
        _memory_state[provider] = dict(local)
        return dict(local)


def set_provider_state(provider: str, state: Dict[str, Any]) -> Dict[str, Any]:
    provider = str(provider or "unknown").lower()
    payload = dict(state or {})
    payload["provider"] = provider
    payload["updated_at_ms"] = _now_ms()

    with _lock:
        _memory_state[provider] = dict(payload)
        all_state = _prune_stale(_read_shared())
        all_state[provider] = dict(payload)
        _write_shared(all_state)

    return dict(payload)
