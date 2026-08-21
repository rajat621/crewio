"""Lightweight offline template learning and profile reuse."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass
class LearnedTemplate:
    name: str
    fingerprint: str
    config_overrides: Dict[str, Any]
    success_count: int = 0


class TemplateLearningStore:
    """Persist successful template tuning profiles for future auto-matching."""

    def __init__(self, file_path: str) -> None:
        self.file_path = Path(file_path)
        self.file_path.parent.mkdir(parents=True, exist_ok=True)

    def load(self) -> List[Dict[str, Any]]:
        if not self.file_path.exists():
            return []
        try:
            payload = json.loads(self.file_path.read_text(encoding="utf-8"))
            return payload.get("templates", []) if isinstance(payload, dict) else []
        except Exception:
            return []

    def save(self, templates: List[Dict[str, Any]]) -> None:
        body = {"templates": templates}
        self.file_path.write_text(json.dumps(body, indent=2), encoding="utf-8")

    def learn_success(self, name: str, fingerprint: str, config_overrides: Dict[str, Any]) -> None:
        templates = self.load()
        for entry in templates:
            if entry.get("fingerprint") == fingerprint:
                entry["success_count"] = int(entry.get("success_count", 0)) + 1
                if config_overrides:
                    entry["config_overrides"] = config_overrides
                self.save(templates)
                return

        templates.append(
            {
                "name": name,
                "fingerprint": fingerprint,
                "config_overrides": config_overrides,
                "success_count": 1,
            }
        )
        self.save(templates)

    def match(self, fingerprint: str) -> Optional[Dict[str, Any]]:
        templates = self.load()
        candidates = [t for t in templates if t.get("fingerprint") == fingerprint]
        if not candidates:
            return None
        candidates.sort(key=lambda t: int(t.get("success_count", 0)), reverse=True)
        return candidates[0]


def build_template_fingerprint(text: str) -> str:
    """Generate a stable lightweight fingerprint from tokenized header content."""

    tokens = [t.strip().lower() for t in (text or "").split() if t.strip()]
    head = tokens[:24]
    return "|".join(head)
