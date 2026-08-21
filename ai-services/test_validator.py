from providers.gemini_provider import (
    GeminiProvider
)

from pipeline.document_normalizer import (
    DocumentNormalizer
)

from pipeline.extraction_validator import (
    ExtractionValidator
)

provider = GeminiProvider()
normalizer = DocumentNormalizer()
validator = ExtractionValidator()

raw = provider.extract_from_pdf(
    "D:\Crew_control\Alqaser  Alsatea Tech Cont _260623_182237.pdf"
)

normalized = normalizer.normalize(
    raw
)

result = validator.validate(
    normalized
)

print(result)