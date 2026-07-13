import json
import os
from typing import Dict, Any

from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()


class GeminiProvider:
    def __init__(self):
        api_key = os.getenv("GOOGLE_API_KEY")

        if not api_key:
            raise ValueError(
                "GOOGLE_API_KEY not found in environment variables"
            )

        self.client = genai.Client(
            api_key=api_key
        )

        self.model = os.getenv(
            "GEMINI_MODEL",
            "gemini-2.5-flash"
        )

    def extract_from_pdf(
        self,
        pdf_path: str
    ) -> Dict[str, Any]:

        prompt = """
You are an expert construction timesheet extraction system.

Analyze the uploaded document and extract all available information.

The document may contain:

- scanned PDF
- image based PDF
- computer generated PDF
- portrait pages
- landscape pages
- rotated pages
- multiple pages
- multiple tables
- merged cells
- summary tables
- no summary table
- employee level data
- project level summaries

Requirements:

1. Extract every trade present in the document.
2. Never skip a trade even if totals appear elsewhere.
3. Preserve employee level information if available.
4. Preserve additions and deductions.
5. Do not hallucinate values.
6. Use null when a field is missing.
7. Return JSON only.
8. Confidence must be between 0 and 1.

Return JSON using this schema:

{
    "document_type": "",
    "company_name": "",
    "project_name": "",
    "invoice_period": "",
    "trades": [],
    "summary": {},
    "confidence": 0.0
}
"""

        uploaded_file = self.client.files.upload(
            file=pdf_path
        )

        response = self.client.models.generate_content(
            model=self.model,
            contents=[
                uploaded_file,
                prompt
            ],
            config=types.GenerateContentConfig(
                temperature=0,
                response_mime_type="application/json"
            )
        )

        return self._parse_response(
            response.text
        )

    def extract_from_text(
        self,
        text: str
    ) -> Dict[str, Any]:

        prompt = f"""
You are an expert construction timesheet extraction system.

The following text was extracted using OCR.

Your task is to reconstruct the original structure
and extract all information from it.

OCR TEXT:

{text}

Return valid JSON only using this schema:

{{
    "document_type": "",
    "company_name": "",
    "project_name": "",
    "invoice_period": "",
    "trades": [],
    "summary": {{}},
    "confidence": 0.0
}}
"""

        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0,
                response_mime_type="application/json"
            )
        )

        return self._parse_response(
            response.text
        )

    def _parse_response(
        self,
        response_text: str
    ) -> Dict[str, Any]:

        try:
            return json.loads(
                response_text
            )

        except json.JSONDecodeError:
            return {
                "document_type": None,
                "company_name": None,
                "project_name": None,
                "invoice_period": None,
                "trades": [],
                "summary": {},
                "confidence": 0.0,
                "raw_response": response_text,
                "error": "Failed to parse Gemini response"
            }

    def is_confident(
        self,
        result: Dict[str, Any],
        threshold: float = 0.75
    ) -> bool:

        confidence = result.get(
            "confidence",
            0
        )

        try:
            confidence = float(
                confidence
            )
        except Exception:
            confidence = 0

        return confidence >= threshold