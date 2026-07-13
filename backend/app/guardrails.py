"""Guardrails ported from agents/instructions/guardrails.config.json.

Same semantics as agents/evals/lib/guardrails.mjs: jailbreak patterns refuse
with a valid §A envelope; PII is anonymized BEFORE anything is logged. The
config JSON stays the single source of truth — this module only interprets it.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from typing import Any

from .settings import get_settings


@lru_cache(maxsize=1)
def _config() -> dict[str, Any]:
    path = get_settings().instructions_dir / "guardrails.config.json"
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _jailbreak_patterns() -> list[re.Pattern[str]]:
    return [re.compile(p, re.IGNORECASE) for p in _config()["jailbreak"]["patterns"]]


@lru_cache(maxsize=1)
def _pii_rules() -> list[tuple[str, str, re.Pattern[str]]]:
    return [
        (rule["type"], rule["token"], re.compile(rule["regex"]))
        for rule in _config()["anonymization"]["pii_types"]
    ]


def detect_jailbreak(text: str | None) -> bool:
    value = text or ""
    return any(pattern.search(value) for pattern in _jailbreak_patterns())


def anonymize(text: str | None) -> tuple[str, list[str]]:
    """Replace every PII match with its token; returns (text, redacted_types)."""
    out = text or ""
    hits: list[str] = []
    for pii_type, token, pattern in _pii_rules():
        def _sub(_match: re.Match[str], t: str = pii_type, tok: str = token) -> str:
            hits.append(t)
            return tok

        out = pattern.sub(_sub, out)
    return out, hits


def refusal_markdown() -> str:
    return _config()["jailbreak"]["refusal_markdown"]


def refusal_envelope(agent: str = "spot_scout") -> dict[str, Any]:
    return {
        "agent": agent,
        "reply_markdown": refusal_markdown(),
        "citations": [],
        "map_actions": [],
        "checklist": None,
    }
