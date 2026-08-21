from providers.gemini_provider import GeminiProvider

provider = GeminiProvider()

result = provider.extract_from_pdf(
    "D:\Crew_control\Alqaser  Alsatea Tech Cont _260623_182237.pdf"
)

print(result)