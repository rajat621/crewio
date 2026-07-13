from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict


import requests
import threading
import time
import random
from config_runtime import CONFIG
from providers.circuit_breaker import execute_with_circuit_breaker
from pipeline.structured_logging import log_event


logger = logging.getLogger(__name__)

os.environ.setdefault("OLLAMA_PARALLEL", "1")


_SEMANTIC_SEMAPHORE = threading.Semaphore(CONFIG.concurrency_limits.inference_concurrency)
_SEMANTIC_MAX_WAIT_S = getattr(CONFIG, 'semantic_max_wait_s', 8)
_SEMANTIC_PAYLOAD_LIMIT = getattr(CONFIG.resource_limits, 'max_semantic_tokens', 4096)

def _truncate_payload(text, max_tokens):
    # Naive token truncation (word count)
    tokens = text.split()
    if len(tokens) > max_tokens:
        return ' '.join(tokens[:max_tokens])
    return text

class OllamaProvider:
    def __init__(self) -> None:
        self.base_url = CONFIG.providers.ollama_url
        self.model = CONFIG.providers.ollama_model
        self.timeout_s = max(10, int(CONFIG.timeouts.provider_timeout_ms / 1000))

    def chat_json(self, *, system_prompt: str, user_prompt: str, num_predict: int = 1800) -> Dict[str, Any]:
        # Throttle: try to acquire semaphore with bounded wait
        acquired = _SEMANTIC_SEMAPHORE.acquire(timeout=_SEMANTIC_MAX_WAIT_S)
        if not acquired:
            log_event(logger, "semantic_throttled_skipped", reason="provider_busy", wait_s=_SEMANTIC_MAX_WAIT_S)
            return {"skipped": True, "reason": "provider_busy"}
        queue_start = time.time()
        try:
            # Truncate payloads to avoid runaway inference
            user_prompt = _truncate_payload(user_prompt, _SEMANTIC_PAYLOAD_LIMIT)
            body = {
                "model": self.model,
                "stream": False,
                "format": "json",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "options": {
                    "temperature": 0,
                    "num_predict": num_predict,
                },
            }

            def _call() -> Dict[str, Any]:
                tries = 0
                max_retries = getattr(CONFIG, 'semantic_max_retries', 2)
                base_delay = getattr(CONFIG, 'semantic_retry_base_delay', 0.7)
                while tries <= max_retries:
                    try:
                        resp = requests.post(
                            f"{self.base_url}/api/chat",
                            json=body,
                            timeout=self.timeout_s,
                        )
                        resp.raise_for_status()
                        payload = resp.json() or {}
                        content = ((payload.get("message") or {}).get("content") or "").strip()
                        if not content:
                            raise ValueError("MALFORMED_JSON:ollama_empty_response")
                        parsed = json.loads(content)
                        if not isinstance(parsed, dict):
                            raise ValueError("MALFORMED_JSON:ollama_non_object_json")
                        queue_latency = time.time() - queue_start
                        log_event(logger, "semantic_provider_latency", latency_s=queue_latency)
                        return parsed
                    except (requests.Timeout, requests.ConnectionError) as exc:
                        tries += 1
                        if tries > max_retries:
                            log_event(logger, "semantic_provider_failed", error=str(exc), tries=tries)
                            raise TimeoutError("PROVIDER_TIMEOUT:ollama_timeout") from exc
                        # Jittered backoff
                        delay = base_delay * (1 + random.random()) * tries
                        time.sleep(delay)
                    except requests.HTTPError as exc:
                        status = getattr(exc.response, "status_code", None)
                        if status == 429:
                            log_event(logger, "semantic_provider_overload", status=429)
                            raise RuntimeError("PROVIDER_OVERLOAD:ollama_429") from exc
                        if status and status >= 500:
                            log_event(logger, "semantic_provider_unavailable", status=status)
                            raise RuntimeError("PROVIDER_UNAVAILABLE:ollama_5xx") from exc
                        log_event(logger, "semantic_provider_http_error", status=status)
                        raise RuntimeError(f"UNKNOWN_PROVIDER_ERROR:ollama_http_{status or 'unknown'}") from exc
                    except Exception as exc:
                        log_event(logger, "semantic_provider_unknown_error", error=str(exc))
                        raise

            return execute_with_circuit_breaker(provider="ollama", operation=_call, logger=logger)
        finally:
            _SEMANTIC_SEMAPHORE.release()
