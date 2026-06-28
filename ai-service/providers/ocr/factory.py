from __future__ import annotations

from .paddle_rapid_provider import PaddleRapidOCRProvider
from config_runtime import CONFIG


class DisabledOCRProvider:
    def available(self) -> bool:
        return False

    def image_tokens(self, image):
        _ = image
        raise RuntimeError("PROVIDER_UNAVAILABLE:ocr_provider_disabled")


def get_ocr_provider():
    if not CONFIG.feature_flags.enable_paddle_ocr:
        return DisabledOCRProvider()

    provider = CONFIG.providers.ocr_provider
    if provider == "paddle_rapid":
        return PaddleRapidOCRProvider()
    return DisabledOCRProvider()
