"""Vision LLM providers for strict JSON timesheet extraction."""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import re
from typing import Any, Dict, List, Sequence

import requests
from PIL import Image

from config_runtime import CONFIG


logger = logging.getLogger(__name__)


VISION_EXTRACTION_PROMPT = """
Extract all valid labor invoice rows from this timesheet image.

Return ONLY valid JSON. Do not return markdown, prose, or explanations.

Rows may come from attendance tables or summary tables. Do not create rows
from logos, headers, footers, addresses, signatures, totals-only lines, or
random OCR text.

If a summary table with columns like Trade, Hour, Rate, Amount exists, return
ONLY those summary trade rows as invoice rows. Do not return employee rows from
the attendance grid in that case. Do not copy employee IDs into summary rows
unless the summary table itself contains employee IDs.

Schema:
{
  "client_name": "",
  "invoice_month": "",
  "rows": [
    {
      "employee_id": "",
      "employee_name": "",
      "project_id": "",
      "trade": "",
      "hours": 0,
      "rate": 0,
      "amount": 0
    }
  ],
  "subtotal": 0,
  "deductions": 0,
  "net_total": 0
}
""".strip()


def _image_to_base64_jpeg(image: Image.Image) -> str:
    rgb = image.convert("RGB")
    max_side = int(__import__("os").getenv("VISION_MAX_IMAGE_SIDE", "1800") or "1800")
    if max(rgb.size) > max_side:
        scale = float(max_side) / float(max(rgb.size))
        rgb = rgb.resize((max(1, int(rgb.width * scale)), max(1, int(rgb.height * scale))))

    buf = io.BytesIO()
    rgb.save(buf, format="JPEG", quality=88, optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _extract_json_object(text: str) -> Dict[str, Any]:
    content = (text or "").strip()
    if not content:
        raise ValueError("VISION_EMPTY_RESPONSE")
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.S)
        if not match:
            raise
        parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("VISION_JSON_NOT_OBJECT")
    return parsed


class OllamaVisionProvider:
    def __init__(self) -> None:
        self.base_url = CONFIG.providers.ollama_url
        self.model = CONFIG.providers.vision_model
        self.timeout_s = max(10, int(CONFIG.timeouts.provider_timeout_ms / 1000))

    def extract_pages(self, images: Sequence[Image.Image]) -> Dict[str, Any]:
        all_rows: List[Dict[str, Any]] = []
        client_name = ""
        invoice_month = ""
        subtotal = 0.0
        deductions = 0.0
        net_total = 0.0

        for page_index, image in enumerate(images, 1):
            payload = self._extract_page(image=image, page_index=page_index)
            if not client_name:
                client_name = str(payload.get("client_name") or "").strip()
            if not invoice_month:
                invoice_month = str(payload.get("invoice_month") or "").strip()

            rows = payload.get("rows") if isinstance(payload.get("rows"), list) else []
            all_rows.extend(row for row in rows if isinstance(row, dict))

            subtotal = max(subtotal, _to_float(payload.get("subtotal")))
            deductions = max(deductions, _to_float(payload.get("deductions")))
            net_total = max(net_total, _to_float(payload.get("net_total")))

        return {
            "client_name": client_name,
            "invoice_month": invoice_month,
            "rows": all_rows,
            "subtotal": subtotal,
            "deductions": deductions,
            "net_total": net_total,
        }

    def _extract_page(self, image: Image.Image, page_index: int) -> Dict[str, Any]:
        body = {
            "model": self.model,
            "stream": False,
            "format": "json",
            "messages": [
                {
                    "role": "user",
                    "content": f"{VISION_EXTRACTION_PROMPT}\n\nPage {page_index}.",
                    "images": [_image_to_base64_jpeg(image)],
                }
            ],
            "options": {
                "temperature": 0,
                "num_predict": int(__import__("os").getenv("VISION_NUM_PREDICT", "2500") or "2500"),
            },
        }
        resp = requests.post(f"{self.base_url}/api/chat", json=body, timeout=self.timeout_s)
        if resp.status_code == 404:
            raise RuntimeError(f"VISION_MODEL_NOT_FOUND:{self.model}")
        resp.raise_for_status()
        content = (((resp.json() or {}).get("message") or {}).get("content") or "").strip()
        return _extract_json_object(content)


class GeminiVisionProvider:
    def __init__(self) -> None:
        self.api_key = (
            os.getenv("GOOGLE_API_KEY")
            or os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_GENERATIVE_AI_API_KEY")
            or ""
        ).strip()
        if not self.api_key:
            raise RuntimeError("VISION_PROVIDER_MISSING_API_KEY:GOOGLE_API_KEY")
        self.model = CONFIG.providers.vision_model or "gemini-2.5-flash-lite"
        self.timeout_s = max(10, int(CONFIG.timeouts.provider_timeout_ms / 1000))

    def extract_pages(self, images: Sequence[Image.Image]) -> Dict[str, Any]:
        from pipeline.profiler import current, new_request_collector
        prof = current()
        if prof:
            prof.incr("vision_api_calls", 1)
        else:
            # no-op collector to time if AI_PROFILE enabled via env
            prof = new_request_collector()

        prompt = (
            f"{VISION_EXTRACTION_PROMPT}\n\n"
            "Read every visible table carefully. If both an attendance grid and a summary table "
            "exist, return the summary trade rows as invoice rows and use the attendance grid only "
            "as cross-check evidence. Preserve exact trade names, hours, rates, deductions, and totals. "
            "The sum of row amounts must match the subtotal/total amount when a summary total is visible."
        )
        parts: List[Dict[str, Any]] = [{"text": prompt}]
        for page_index, image in enumerate(images, 1):
            parts.append({"text": f"Page {page_index}:"})
            parts.append(
                {
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": _image_to_base64_jpeg(image),
                    }
                }
            )

        body = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {
                "temperature": 0,
                "response_mime_type": "application/json",
            },
        }
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent"
        )
        with (prof).time_stage("google_vision"):
            resp = requests.post(
                url,
                headers={"x-goog-api-key": self.api_key, "Content-Type": "application/json"},
                json=body,
                timeout=self.timeout_s,
            )
        if resp.status_code == 404:
            raise RuntimeError(f"VISION_MODEL_NOT_FOUND:{self.model}")
        if resp.status_code in {400, 401, 403}:
            raise RuntimeError(f"VISION_PROVIDER_AUTH_OR_REQUEST_ERROR:gemini_http_{resp.status_code}")
        resp.raise_for_status()
        payload = resp.json() or {}
        candidates = payload.get("candidates") if isinstance(payload.get("candidates"), list) else []
        if not candidates:
            raise ValueError("VISION_EMPTY_RESPONSE")
        content = candidates[0].get("content") or {}
        response_parts = content.get("parts") if isinstance(content.get("parts"), list) else []
        text = "\n".join(str(part.get("text") or "") for part in response_parts if isinstance(part, dict)).strip()
        return _extract_json_object(text)


def _to_float(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = re.sub(r"[^0-9.\-]", "", str(value or ""))
    try:
        return float(cleaned) if cleaned else 0.0
    except ValueError:
        return 0.0


def get_vision_provider() -> Any:
    provider = str(CONFIG.providers.vision_provider or "ollama").strip().lower()
    if provider == "ollama":
        return OllamaVisionProvider()
    if provider in {"google", "gemini", "google_gemini"}:
        return GeminiVisionProvider()
    raise RuntimeError(f"VISION_PROVIDER_UNSUPPORTED:{CONFIG.providers.vision_provider}")
