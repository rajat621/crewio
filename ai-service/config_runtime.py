"""Centralized runtime configuration governance for AI service (warn-mode validation)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal


ExtractionMode = Literal["deterministic_only", "hybrid", "semantic_full", "vision_hybrid"]


@dataclass(frozen=True)
class FeatureFlags:
    enable_async_ai: bool
    enable_ollama: bool
    enable_vision: bool
    enable_semantic_extraction: bool
    enable_paddle_ocr: bool
    enable_observability: bool
    enable_circuit_breaker: bool


@dataclass(frozen=True)
class ExtractionConfig:
    mode: ExtractionMode
    semantic_confidence_threshold: float
    ocr_enabled: bool
    provider_priority: str


@dataclass(frozen=True)
class TimeoutConfig:
    ocr_timeout_ms: int
    table_extraction_timeout_ms: int
    provider_timeout_ms: int
    worker_timeout_ms: int
    backend_request_timeout_ms: int


@dataclass(frozen=True)
class RetryConfig:
    ocr_retries: int
    provider_retries: int
    worker_retries: int
    queue_retries: int


@dataclass(frozen=True)
class QueueConfig:
    worker_concurrency: int
    backoff_delay_ms: int
    dedupe_window_ms: int
    remove_on_complete: int
    remove_on_fail: int
    cleanup_interval_ms: int


@dataclass(frozen=True)
class ObservabilityConfig:
    tracing_enabled: bool
    metrics_enabled: bool
    structured_logging_enabled: bool
    verbosity_level: str
    failure_classification_enabled: bool
    trace_sampling_rate: float
    verbose_sampling_rate: float
    debug_artifact_sampling_rate: float
    metrics_aggregation_interval_ms: int


@dataclass(frozen=True)
class StorageGovernanceConfig:
    temp_file_retention_ms: int
    debug_retention_ms: int
    queue_retention_ms: int
    cleanup_schedule_ms: int
    generated_file_governance: str


@dataclass(frozen=True)
class ProviderConfig:
    llm_provider: str
    ocr_provider: str
    ollama_url: str
    ollama_model: str
    vision_provider: str
    vision_model: str


@dataclass(frozen=True)
class CircuitBreakerConfig:
    enabled: bool
    failure_threshold: int
    cooldown_ms: int
    half_open_success_threshold: int
    max_retries: int
    base_retry_delay_ms: int
    jitter_ms: int


@dataclass(frozen=True)
class ProviderHealthConfig:
    shared_cache_path: str
    state_ttl_ms: int


@dataclass(frozen=True)
class RuntimeOverrideConfig:
    ai_extract_debug: bool
    ai_extract_debug_dir: str
    ai_ocr_min_conf: str


# @dataclass()
@dataclass()
class ConcurrencyLimitsConfig:
    ocr_concurrency: int
    semantic_concurrency: int
    pdf_concurrency: int
    inference_concurrency: int

@dataclass(frozen=True)
class ResourceLimitsConfig:
    max_pdf_pages: int
    max_payload_mb: int
    max_ocr_images: int
    max_semantic_tokens: int
    vision_max_pages: int

@dataclass(frozen=True)
class RuntimeConfig:
    feature_flags: FeatureFlags
    extraction: ExtractionConfig
    timeouts: TimeoutConfig
    retries: RetryConfig
    queue: QueueConfig
    observability: ObservabilityConfig
    storage: StorageGovernanceConfig
    concurrency_limits: ConcurrencyLimitsConfig
    resource_limits: ResourceLimitsConfig
    providers: ProviderConfig
    circuit_breaker: CircuitBreakerConfig
    provider_health: ProviderHealthConfig
    overrides: RuntimeOverrideConfig
    strict_validation: bool


def _warn(message: str, value: object | None = None) -> None:
    print(f"[config warning] {message} {value if value is not None else ''}".rstrip())


def _to_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    v = str(value).strip().lower()
    if v in {"1", "true", "yes", "on"}:
        return True
    if v in {"0", "false", "no", "off"}:
        return False
    return default


def _to_int(value: str | None, default: int, *, minimum: int | None = None) -> int:
    try:
        parsed = int(str(value)) if value is not None else default
    except Exception:
        parsed = default
    if minimum is not None and parsed < minimum:
        return default
    return parsed


def _to_float(value: str | None, default: float, *, minimum: float | None = None) -> float:
    try:
        parsed = float(str(value)) if value is not None else default
    except Exception:
        parsed = default
    if minimum is not None and parsed < minimum:
        return default
    return parsed


def _validate_warn_only(cfg: RuntimeConfig) -> None:
    if cfg.extraction.mode not in {"deterministic_only", "hybrid", "semantic_full", "vision_hybrid"}:
        _warn("Invalid extraction mode; expected deterministic_only|hybrid|semantic_full|vision_hybrid", cfg.extraction.mode)

    bounds = {
        "ocr_timeout_ms": cfg.timeouts.ocr_timeout_ms,
        "table_extraction_timeout_ms": cfg.timeouts.table_extraction_timeout_ms,
        "provider_timeout_ms": cfg.timeouts.provider_timeout_ms,
        "worker_timeout_ms": cfg.timeouts.worker_timeout_ms,
        "backend_request_timeout_ms": cfg.timeouts.backend_request_timeout_ms,
    }
    for key, val in bounds.items():
        if val <= 0:
            _warn("Timeout must be positive", {key: val})

    counts = {
        "ocr_retries": cfg.retries.ocr_retries,
        "provider_retries": cfg.retries.provider_retries,
        "worker_retries": cfg.retries.worker_retries,
        "queue_retries": cfg.retries.queue_retries,
    }
    for key, val in counts.items():
        if val < 0:
            _warn("Retry count must be non-negative", {key: val})

    if cfg.queue.worker_concurrency <= 0:
        _warn("Worker concurrency should be > 0", cfg.queue.worker_concurrency)

    if cfg.feature_flags.enable_ollama and not cfg.providers.ollama_url:
        _warn("ENABLE_OLLAMA is true but OLLAMA_URL is empty")

    if cfg.circuit_breaker.failure_threshold <= 0:
        _warn("CB_FAILURE_THRESHOLD should be > 0", cfg.circuit_breaker.failure_threshold)
    if cfg.circuit_breaker.cooldown_ms < 1000:
        _warn("CB_COOLDOWN_MS should be >= 1000", cfg.circuit_breaker.cooldown_ms)
    if cfg.circuit_breaker.half_open_success_threshold <= 0:
        _warn("CB_HALF_OPEN_SUCCESS_THRESHOLD should be > 0", cfg.circuit_breaker.half_open_success_threshold)
    if cfg.provider_health.state_ttl_ms < 1000:
        _warn("PROVIDER_HEALTH_STATE_TTL_MS should be >= 1000", cfg.provider_health.state_ttl_ms)


# Single source of truth. Legacy aliases preserved where present.
STRICT_VALIDATION = _to_bool(os.getenv("CONFIG_STRICT_VALIDATION"), False)

EXTRACTION_MODE_RAW = str(os.getenv("EXTRACTION_MODE", "hybrid")).strip().lower()
EXTRACTION_MODE: ExtractionMode = (
    EXTRACTION_MODE_RAW if EXTRACTION_MODE_RAW in {"deterministic_only", "hybrid", "semantic_full", "vision_hybrid"} else "hybrid"
)
if EXTRACTION_MODE_RAW != EXTRACTION_MODE:
    _warn("Invalid EXTRACTION_MODE; falling back to hybrid", EXTRACTION_MODE_RAW)

ENABLE_SEMANTIC_ALIAS = _to_bool(os.getenv("OLLAMA_ENABLE_SEMANTIC"), True)
ENABLE_SEMANTIC = _to_bool(os.getenv("ENABLE_SEMANTIC_EXTRACTION"), ENABLE_SEMANTIC_ALIAS)

# CONFIG = RuntimeConfig(
#     feature_flags=FeatureFlags(
#         enable_async_ai=_to_bool(os.getenv("ENABLE_ASYNC_AI"), False),
#         enable_ollama=_to_bool(os.getenv("ENABLE_OLLAMA"), True),
#         enable_semantic_extraction=ENABLE_SEMANTIC,
#         enable_paddle_ocr=_to_bool(os.getenv("ENABLE_PADDLE_OCR"), True),
#         enable_observability=_to_bool(os.getenv("ENABLE_OBSERVABILITY"), True),
#         enable_circuit_breaker=_to_bool(os.getenv("ENABLE_CIRCUIT_BREAKER"), False),
#     ),
#     extraction=ExtractionConfig(
#         mode=EXTRACTION_MODE,
#         semantic_confidence_threshold=_to_float(os.getenv("SEMANTIC_CONFIDENCE_THRESHOLD"), 0.6, minimum=0.0),
#         ocr_enabled=_to_bool(os.getenv("ENABLE_PADDLE_OCR"), True),
#         provider_priority=str(os.getenv("PROVIDER_PRIORITY", "deterministic,ocr,semantic")),
#     ),
#     timeouts=TimeoutConfig(
#         ocr_timeout_ms=_to_int(os.getenv("OCR_TIMEOUT_MS"), 90000, minimum=1),
#         table_extraction_timeout_ms=_to_int(os.getenv("TABLE_EXTRACTION_TIMEOUT_MS"), 90000, minimum=1),
#         provider_timeout_ms=_to_int(os.getenv("PROVIDER_TIMEOUT_MS"), _to_int(os.getenv("OLLAMA_TIMEOUT_S"), 90, minimum=1) * 1000, minimum=1),
#         worker_timeout_ms=_to_int(os.getenv("AI_JOB_TIMEOUT_MS"), 240000, minimum=1),
#         backend_request_timeout_ms=_to_int(os.getenv("AI_SERVICE_TIMEOUT_MS"), 45000, minimum=1),
#     ),
#     retries=RetryConfig(
#         ocr_retries=_to_int(os.getenv("OCR_RETRIES"), 1, minimum=0),
#         provider_retries=_to_int(os.getenv("PROVIDER_RETRIES"), 1, minimum=0),
#         worker_retries=_to_int(os.getenv("WORKER_RETRIES"), 3, minimum=0),
#         queue_retries=_to_int(os.getenv("QUEUE_ATTEMPTS"), 3, minimum=0),
#     ),
#     queue=QueueConfig(
#         worker_concurrency=_to_int(os.getenv("AI_WORKER_CONCURRENCY"), 4, minimum=1),
#         backoff_delay_ms=_to_int(os.getenv("QUEUE_BACKOFF_DELAY_MS"), 5000, minimum=0),
#         dedupe_window_ms=_to_int(os.getenv("ASYNC_AI_DEDUP_WINDOW_MS"), 120000, minimum=0),
#         remove_on_complete=_to_int(os.getenv("QUEUE_REMOVE_ON_COMPLETE"), 500, minimum=0),
#         remove_on_fail=_to_int(os.getenv("QUEUE_REMOVE_ON_FAIL"), 1000, minimum=0),
#         cleanup_interval_ms=_to_int(os.getenv("QUEUE_CLEANUP_INTERVAL_MS"), 600000, minimum=0),
#     ),
#     observability=ObservabilityConfig(
#         tracing_enabled=_to_bool(os.getenv("TRACING_ENABLED"), True),
#         metrics_enabled=_to_bool(os.getenv("METRICS_ENABLED"), True),
#         structured_logging_enabled=_to_bool(os.getenv("STRUCTURED_LOGS_ENABLED"), True),
#         verbosity_level=str(os.getenv("LOG_VERBOSITY", "info")),
#         failure_classification_enabled=_to_bool(os.getenv("FAILURE_CLASSIFICATION_ENABLED"), True),
#         trace_sampling_rate=_to_float(os.getenv("TRACE_SAMPLING_RATE"), 0.1, minimum=0.0),
#         verbose_sampling_rate=_to_float(os.getenv("VERBOSE_LOG_SAMPLING_RATE"), 0.05, minimum=0.0),
#         debug_artifact_sampling_rate=_to_float(os.getenv("DEBUG_ARTIFACT_SAMPLING_RATE"), 0.02, minimum=0.0),
#         metrics_aggregation_interval_ms=_to_int(os.getenv("METRICS_AGGREGATION_INTERVAL_MS"), 60000, minimum=1000),
#     ),
#     storage=StorageGovernanceConfig(
#         temp_file_retention_ms=_to_int(os.getenv("TEMP_FILE_RETENTION_MS"), 24 * 60 * 60 * 1000, minimum=0),
#         debug_retention_ms=_to_int(os.getenv("DEBUG_RETENTION_MS"), 7 * 24 * 60 * 60 * 1000, minimum=0),
#         queue_retention_ms=_to_int(os.getenv("QUEUE_RETENTION_MS"), 7 * 24 * 60 * 60 * 1000, minimum=0),
#         cleanup_schedule_ms=_to_int(os.getenv("CLEANUP_SCHEDULE_MS"), 60 * 60 * 1000, minimum=0),
#         generated_file_governance=str(os.getenv("GENERATED_FILE_GOVERNANCE", "filesystem-v1")),
#     ),
#     providers=ProviderConfig(
#         llm_provider=str(os.getenv("LLM_PROVIDER", "ollama")).strip().lower(),
#         ocr_provider=str(os.getenv("OCR_PROVIDER", "paddle_rapid")).strip().lower(),
#         ollama_url=str(os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")).rstrip("/"),
#         ollama_model=str(os.getenv("OLLAMA_MODEL", "qwen2.5:7b-instruct-q4_K_M")),
#     ),
#     circuit_breaker=CircuitBreakerConfig(
#         enabled=_to_bool(os.getenv("ENABLE_CIRCUIT_BREAKER"), False),
#         failure_threshold=_to_int(os.getenv("CB_FAILURE_THRESHOLD"), 3, minimum=1),
#         cooldown_ms=_to_int(os.getenv("CB_COOLDOWN_MS"), 30000, minimum=1000),
#         half_open_success_threshold=_to_int(os.getenv("CB_HALF_OPEN_SUCCESS_THRESHOLD"), 2, minimum=1),
#         max_retries=_to_int(os.getenv("PROVIDER_RETRIES"), 1, minimum=0),
#         base_retry_delay_ms=_to_int(os.getenv("PROVIDER_RETRY_DELAY_MS"), 500, minimum=0),
#         jitter_ms=_to_int(os.getenv("PROVIDER_RETRY_JITTER_MS"), 250, minimum=0),
#     ),
#     provider_health=ProviderHealthConfig(
#         shared_cache_path=str(os.getenv("PROVIDER_HEALTH_CACHE_PATH", os.path.join(os.getenv("TEMP", "."), "ai_provider_health.json"))),
#         state_ttl_ms=_to_int(os.getenv("PROVIDER_HEALTH_STATE_TTL_MS"), 24 * 60 * 60 * 1000, minimum=1000),
#     ),
#     overrides=RuntimeOverrideConfig(
#         ai_extract_debug=_to_bool(os.getenv("AI_EXTRACT_DEBUG"), False),
#         ai_extract_debug_dir=str(os.getenv("AI_EXTRACT_DEBUG_DIR", "")).strip(),
#         ai_ocr_min_conf=str(os.getenv("AI_OCR_MIN_CONF", "")).strip(),
#     ),
#     strict_validation=STRICT_VALIDATION,
# )
CONFIG = RuntimeConfig(
    feature_flags=FeatureFlags(
        enable_async_ai=_to_bool(os.getenv("ENABLE_ASYNC_AI"), False),
        enable_ollama=_to_bool(os.getenv("ENABLE_OLLAMA"), True),
        enable_vision=_to_bool(os.getenv("ENABLE_VISION"), False),
        enable_semantic_extraction=ENABLE_SEMANTIC,
        enable_paddle_ocr=_to_bool(os.getenv("ENABLE_PADDLE_OCR"), True),
        enable_observability=_to_bool(os.getenv("ENABLE_OBSERVABILITY"), True),
        enable_circuit_breaker=_to_bool(os.getenv("ENABLE_CIRCUIT_BREAKER"), False),
    ),

    extraction=ExtractionConfig(
        mode=EXTRACTION_MODE,
        semantic_confidence_threshold=_to_float(
            os.getenv("SEMANTIC_CONFIDENCE_THRESHOLD"),
            0.6,
            minimum=0.0
        ),
        ocr_enabled=_to_bool(os.getenv("ENABLE_PADDLE_OCR"), True),
        provider_priority=str(
            os.getenv("PROVIDER_PRIORITY", "deterministic,ocr,semantic")
        ),
    ),

    timeouts=TimeoutConfig(
        ocr_timeout_ms=_to_int(
            os.getenv("OCR_TIMEOUT_MS"),
            300000,
            minimum=1
        ),

        table_extraction_timeout_ms=_to_int(
            os.getenv("TABLE_EXTRACTION_TIMEOUT_MS"),
            300000,
            minimum=1
        ),

        provider_timeout_ms=_to_int(
            os.getenv("PROVIDER_TIMEOUT_MS"),
            300000,
            minimum=1
        ),

        worker_timeout_ms=_to_int(
            os.getenv("AI_JOB_TIMEOUT_MS"),
            300000,
            minimum=1
        ),

        backend_request_timeout_ms=_to_int(
            os.getenv("AI_SERVICE_TIMEOUT_MS"),
            300000,
            minimum=1
        ),
    ),

    retries=RetryConfig(
        ocr_retries=_to_int(
            os.getenv("OCR_RETRIES"),
            1,
            minimum=0
        ),

        provider_retries=_to_int(
            os.getenv("PROVIDER_RETRIES"),
            1,
            minimum=0
        ),

        worker_retries=_to_int(
            os.getenv("WORKER_RETRIES"),
            3,
            minimum=0
        ),

        queue_retries=_to_int(
            os.getenv("QUEUE_ATTEMPTS"),
            3,
            minimum=0
        ),
    ),

    queue=QueueConfig(
        worker_concurrency=_to_int(
            os.getenv("AI_WORKER_CONCURRENCY"),
            2,
            minimum=1
        ),

        backoff_delay_ms=_to_int(
            os.getenv("QUEUE_BACKOFF_DELAY_MS"),
            5000,
            minimum=0
        ),

        dedupe_window_ms=_to_int(
            os.getenv("ASYNC_AI_DEDUP_WINDOW_MS"),
            120000,
            minimum=0
        ),

        remove_on_complete=_to_int(
            os.getenv("QUEUE_REMOVE_ON_COMPLETE"),
            500,
            minimum=0
        ),

        remove_on_fail=_to_int(
            os.getenv("QUEUE_REMOVE_ON_FAIL"),
            1000,
            minimum=0
        ),

        cleanup_interval_ms=_to_int(
            os.getenv("QUEUE_CLEANUP_INTERVAL_MS"),
            600000,
            minimum=0
        ),
    ),

    observability=ObservabilityConfig(
        tracing_enabled=_to_bool(os.getenv("TRACING_ENABLED"), True),

        metrics_enabled=_to_bool(os.getenv("METRICS_ENABLED"), True),

        structured_logging_enabled=_to_bool(
            os.getenv("STRUCTURED_LOGS_ENABLED"),
            True
        ),

        verbosity_level=str(os.getenv("LOG_VERBOSITY", "info")),

        failure_classification_enabled=_to_bool(
            os.getenv("FAILURE_CLASSIFICATION_ENABLED"),
            True
        ),

        trace_sampling_rate=_to_float(
            os.getenv("TRACE_SAMPLING_RATE"),
            0.1,
            minimum=0.0
        ),

        verbose_sampling_rate=_to_float(
            os.getenv("VERBOSE_LOG_SAMPLING_RATE"),
            0.05,
            minimum=0.0
        ),

        debug_artifact_sampling_rate=_to_float(
            os.getenv("DEBUG_ARTIFACT_SAMPLING_RATE"),
            0.02,
            minimum=0.0
        ),

        metrics_aggregation_interval_ms=_to_int(
            os.getenv("METRICS_AGGREGATION_INTERVAL_MS"),
            60000,
            minimum=1000
        ),
    ),

    storage=StorageGovernanceConfig(
        temp_file_retention_ms=_to_int(
            os.getenv("TEMP_FILE_RETENTION_MS"),
            24 * 60 * 60 * 1000,
            minimum=0
        ),

        debug_retention_ms=_to_int(
            os.getenv("DEBUG_RETENTION_MS"),
            7 * 24 * 60 * 60 * 1000,
            minimum=0
        ),

        queue_retention_ms=_to_int(
            os.getenv("QUEUE_RETENTION_MS"),
            7 * 24 * 60 * 60 * 1000,
            minimum=0
        ),

        cleanup_schedule_ms=_to_int(
            os.getenv("CLEANUP_SCHEDULE_MS"),
            60 * 60 * 1000,
            minimum=0
        ),

        generated_file_governance=str(
            os.getenv("GENERATED_FILE_GOVERNANCE", "filesystem-v1")
        ),
    ),

    concurrency_limits=ConcurrencyLimitsConfig(
        ocr_concurrency=_to_int(
            os.getenv("OCR_CONCURRENCY"),
            2,
            minimum=1
        ),

        semantic_concurrency=_to_int(
            os.getenv("SEMANTIC_CONCURRENCY"),
            1,
            minimum=1
        ),

        pdf_concurrency=_to_int(
            os.getenv("PDF_CONCURRENCY"),
            2,
            minimum=1
        ),

        inference_concurrency=_to_int(
            os.getenv("INFERENCE_CONCURRENCY"),
            1,
            minimum=1
        ),
    ),

    resource_limits=ResourceLimitsConfig(
        max_pdf_pages=_to_int(
            os.getenv("MAX_PDF_PAGES"),
            15,
            minimum=1
        ),

        max_payload_mb=_to_int(
            os.getenv("MAX_PAYLOAD_MB"),
            50,
            minimum=1
        ),

        max_ocr_images=_to_int(
            os.getenv("MAX_OCR_PAGES", os.getenv("MAX_OCR_IMAGES")),
            10,
            minimum=1
        ),

        max_semantic_tokens=_to_int(
            os.getenv("MAX_SEMANTIC_TOKENS"),
            4096,
            minimum=1
        ),

        vision_max_pages=_to_int(
            os.getenv("VISION_MAX_PAGES"),
            10,
            minimum=1
        ),
    ),

    providers=ProviderConfig(
        llm_provider=str(
            os.getenv("LLM_PROVIDER", "ollama")
        ).strip().lower(),

        ocr_provider=str(
            os.getenv("OCR_PROVIDER", "paddle_rapid")
        ).strip().lower(),

        ollama_url=str(
            os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
        ).rstrip("/"),

        ollama_model=str(
            os.getenv("OLLAMA_MODEL", "qwen2.5:7b-instruct-q4_K_M")
        ),

        vision_provider=str(
            os.getenv("VISION_PROVIDER", "gemini")
        ).strip().lower(),

        vision_model=str(
            os.getenv("VISION_MODEL", "gemini-2.5-flash")
        ),
    ),

    circuit_breaker=CircuitBreakerConfig(
        enabled=_to_bool(
            os.getenv("ENABLE_CIRCUIT_BREAKER"),
            False
        ),

        failure_threshold=_to_int(
            os.getenv("CB_FAILURE_THRESHOLD"),
            3,
            minimum=1
        ),

        cooldown_ms=_to_int(
            os.getenv("CB_COOLDOWN_MS"),
            30000,
            minimum=1000
        ),

        half_open_success_threshold=_to_int(
            os.getenv("CB_HALF_OPEN_SUCCESS_THRESHOLD"),
            2,
            minimum=1
        ),

        max_retries=_to_int(
            os.getenv("PROVIDER_RETRIES"),
            1,
            minimum=0
        ),

        base_retry_delay_ms=_to_int(
            os.getenv("PROVIDER_RETRY_DELAY_MS"),
            500,
            minimum=0
        ),

        jitter_ms=_to_int(
            os.getenv("PROVIDER_RETRY_JITTER_MS"),
            250,
            minimum=0
        ),
    ),

    provider_health=ProviderHealthConfig(
        shared_cache_path=str(
            os.getenv(
                "PROVIDER_HEALTH_CACHE_PATH",
                os.path.join(
                    os.getenv("TEMP", "."),
                    "ai_provider_health.json"
                )
            )
        ),

        state_ttl_ms=_to_int(
            os.getenv("PROVIDER_HEALTH_STATE_TTL_MS"),
            24 * 60 * 60 * 1000,
            minimum=1000
        ),
    ),

    overrides=RuntimeOverrideConfig(
        ai_extract_debug=_to_bool(
            os.getenv("AI_EXTRACT_DEBUG"),
            False
        ),

        ai_extract_debug_dir=str(
            os.getenv("AI_EXTRACT_DEBUG_DIR", "")
        ).strip(),

        ai_ocr_min_conf=str(
            os.getenv("AI_OCR_MIN_CONF", "")
        ).strip(),
    ),

    strict_validation=STRICT_VALIDATION,
)
_validate_warn_only(CONFIG)
