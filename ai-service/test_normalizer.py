from providers.gemini_provider import (
    GeminiProvider
)

from pipeline.document_normalizer import (
    DocumentNormalizer
)

provider = GeminiProvider()
normalizer = DocumentNormalizer()

raw_result = (
    provider.extract_from_pdf(
        "D:\Crew_control\Alqaser  Alsatea Tech Cont _260623_182237.pdf"
    )
)

normalized = (
    normalizer.normalize(
        raw_result
    )
)

print(normalized)