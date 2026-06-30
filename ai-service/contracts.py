"""
contracts.py  –  Standardised API response envelopes.
validation.py –  Extraction quality scoring.
"""

# ============================================================================
# contracts.py
# ============================================================================

from typing import Any, Dict, Optional


def ok(data: Dict[str, Any], **extra) -> Dict[str, Any]:
    return {"success": True, "data": data, **extra}


def err(message: str, details: Any = None) -> Dict[str, Any]:
    body: Dict[str, Any] = {"success": False, "error": message}
    if details is not None:
        body["details"] = details
    return body
