import logging

from providers.gemini_provider import GeminiProvider

try:
    from providers.ocr_fallback_provider import OCRFallbackProvider
except ImportError:
    OCRFallbackProvider = None


logger = logging.getLogger(__name__)


class ProviderManager:

    def __init__(self):
        self.gemini = GeminiProvider()

        self.ocr = None
        if OCRFallbackProvider:
            self.ocr = OCRFallbackProvider()

    def extract(
        self,
        pdf_path: str
    ):

        try:
            logger.info(
                "Attempting Gemini direct extraction..."
            )

            result = self.gemini.extract_from_pdf(
                pdf_path
            )

            confidence = result.get(
                "confidence",
                0
            )

            if confidence >= 0.75:
                logger.info(
                    f"Gemini extraction successful. "
                    f"Confidence={confidence}"
                )

                result["extraction_method"] = (
                    "gemini_direct"
                )

                return result

            logger.warning(
                f"Low confidence extraction "
                f"({confidence}). "
                f"Switching to OCR fallback."
            )

            raise Exception(
                "Low confidence extraction"
            )

        except Exception as e:

            logger.exception(
                "Gemini extraction failed."
            )

            if self.ocr is None:
                raise Exception(
                    "OCR fallback provider "
                    "not configured."
                ) from e

            logger.info(
                "Starting OCR fallback pipeline..."
            )

            ocr_result = (
                self.ocr.extract_text(
                    pdf_path
                )
            )

            result = (
                self.gemini.extract_from_text(
                    ocr_result
                )
            )

            result[
                "extraction_method"
            ] = "ocr_fallback"

            return result