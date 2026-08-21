from __future__ import annotations

from .ollama_provider import OllamaProvider
from config_runtime import CONFIG


class DisabledLLMProvider:
    def chat_json(self, *, system_prompt: str, user_prompt: str, num_predict: int = 1800):
        _ = system_prompt
        _ = user_prompt
        _ = num_predict
        raise RuntimeError("PROVIDER_UNAVAILABLE:llm_provider_disabled")


def get_llm_provider():
    if not CONFIG.feature_flags.enable_ollama:
        return DisabledLLMProvider()

    provider = CONFIG.providers.llm_provider
    if provider == "ollama":
        return OllamaProvider()
    return DisabledLLMProvider()
