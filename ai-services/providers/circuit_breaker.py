from __future__ import annotations

import random
import time
from typing import Any, Callable, Dict

from config_runtime import CONFIG
from pipeline.structured_logging import get_trace_context, log_event

from .provider_health import get_provider_state, set_provider_state


CB_CLOSED = "CLOSED"
CB_OPEN = "OPEN"
CB_HALF_OPEN = "HALF_OPEN"


class CircuitBreakerOpenError(RuntimeError):
    pass


def _now_ms() -> int:
    return int(time.time() * 1000)


def _classify_provider_failure(exc: Exception | str) -> str:
    msg = str(exc or "").lower()
    if "timeout" in msg or "timed out" in msg:
        return "PROVIDER_TIMEOUT"
    if "429" in msg or "overload" in msg or "too many requests" in msg:
        return "PROVIDER_OVERLOAD"
    if "json" in msg or "non_object_json" in msg or "empty_response" in msg:
        return "MALFORMED_JSON"
    if "connection" in msg or "refused" in msg or "unavailable" in msg:
        return "PROVIDER_UNAVAILABLE"
    return "UNKNOWN_PROVIDER_ERROR"


def _can_probe(state: Dict[str, Any]) -> bool:
    if state.get("state") != CB_OPEN:
        return True
    opened_at = int(state.get("opened_at_ms", 0) or 0)
    return (_now_ms() - opened_at) >= int(CONFIG.circuit_breaker.cooldown_ms)


def _open_state(provider: str, failure_category: str, state: Dict[str, Any]) -> Dict[str, Any]:
    return {
        **state,
        "provider": provider,
        "state": CB_OPEN,
        "opened_at_ms": _now_ms(),
        "half_open_success_count": 0,
        "last_failure_category": failure_category,
    }


def _half_open_state(provider: str, state: Dict[str, Any]) -> Dict[str, Any]:
    return {
        **state,
        "provider": provider,
        "state": CB_HALF_OPEN,
        "half_open_success_count": 0,
    }


def _closed_state(provider: str, state: Dict[str, Any]) -> Dict[str, Any]:
    return {
        **state,
        "provider": provider,
        "state": CB_CLOSED,
        "failure_count": 0,
        "opened_at_ms": 0,
        "half_open_success_count": 0,
    }


def execute_with_circuit_breaker(
    *,
    provider: str,
    operation: Callable[[], Dict[str, Any]],
    logger: Any,
) -> Dict[str, Any]:
    provider_name = str(provider or "unknown").lower()
    trace = get_trace_context()

    if not CONFIG.circuit_breaker.enabled:
        return operation()

    state = get_provider_state(provider_name)
    current_state = state.get("state", CB_CLOSED)

    if current_state == CB_OPEN and not _can_probe(state):
        log_event(
            logger,
            "circuit_breaker_open_block",
            provider=provider_name,
            breaker_state=CB_OPEN,
            failure_category=state.get("last_failure_category", ""),
            retry_count=0,
            fallback_activated=True,
            trace_id=trace.get("trace_id", ""),
        )
        raise CircuitBreakerOpenError(f"provider_circuit_open:{provider_name}")

    if current_state == CB_OPEN and _can_probe(state):
        state = set_provider_state(provider_name, _half_open_state(provider_name, state))
        log_event(
            logger,
            "circuit_breaker_half_open",
            provider=provider_name,
            breaker_state=CB_HALF_OPEN,
            retry_count=0,
            fallback_activated=False,
            trace_id=trace.get("trace_id", ""),
        )

    max_retries = int(CONFIG.circuit_breaker.max_retries)
    base_delay = int(CONFIG.circuit_breaker.base_retry_delay_ms)
    jitter = int(CONFIG.circuit_breaker.jitter_ms)

    last_error: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            result = operation()
            state = get_provider_state(provider_name)
            if state.get("state") == CB_HALF_OPEN:
                success_count = int(state.get("half_open_success_count", 0)) + 1
                state["half_open_success_count"] = success_count
                if success_count >= int(CONFIG.circuit_breaker.half_open_success_threshold):
                    state = _closed_state(provider_name, state)
                    log_event(
                        logger,
                        "circuit_breaker_closed",
                        provider=provider_name,
                        breaker_state=CB_CLOSED,
                        retry_count=attempt,
                        fallback_activated=False,
                        trace_id=trace.get("trace_id", ""),
                    )
            else:
                state = _closed_state(provider_name, state)
            set_provider_state(provider_name, state)
            return result
        except Exception as exc:
            last_error = exc
            failure_category = _classify_provider_failure(exc)
            state = get_provider_state(provider_name)
            state["failure_count"] = int(state.get("failure_count", 0)) + 1
            state["last_failure_category"] = failure_category

            threshold = int(CONFIG.circuit_breaker.failure_threshold)
            should_open = state["failure_count"] >= threshold or state.get("state") == CB_HALF_OPEN
            if should_open:
                state = _open_state(provider_name, failure_category, state)
                set_provider_state(provider_name, state)
                log_event(
                    logger,
                    "circuit_breaker_opened",
                    provider=provider_name,
                    breaker_state=CB_OPEN,
                    failure_category=failure_category,
                    retry_count=attempt,
                    fallback_activated=True,
                    trace_id=trace.get("trace_id", ""),
                )
            else:
                set_provider_state(provider_name, state)

            if attempt >= max_retries:
                break

            sleep_ms = base_delay + random.randint(0, max(0, jitter))
            time.sleep(max(0, sleep_ms) / 1000.0)

    if last_error:
        raise last_error
    raise RuntimeError(f"provider_call_failed:{provider_name}")
