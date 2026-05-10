from typing import Any, Dict


def extraction_response(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "success": True,
        "data": payload,
    }


def error_response(message: str, details: Any = None) -> Dict[str, Any]:
    body = {
        "success": False,
        "error": message,
    }
    if details is not None:
        body["details"] = details
    return body
