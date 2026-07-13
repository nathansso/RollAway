"""Environment configuration for the Rollaway FastAPI backend.

Mirrors the env contract of agents/runtime (GRADIENT_*) plus the Phase 2
additions (Supabase, DO Functions gateway). Everything is optional: with no
keys the service still boots and every LLM-flavored path degrades to its
deterministic template, exactly like the Node runtime did.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path


def _agents_dir() -> Path:
    env = os.environ.get("AGENTS_DIR")
    if env:
        return Path(env)
    # Repo checkout layout: backend/app/settings.py -> ../../agents
    return Path(__file__).resolve().parents[2] / "agents"


class Settings:
    def __init__(self) -> None:
        self.gradient_api_key = os.environ.get("GRADIENT_API_KEY", "")
        self.gradient_url = os.environ.get(
            "GRADIENT_INFERENCE_URL", "https://inference.do-ai.run/v1"
        ).rstrip("/")
        self.gradient_model = os.environ.get("GRADIENT_MODEL", "anthropic-claude-haiku-4.5")
        self.gradient_timeout_s = float(os.environ.get("GRADIENT_TIMEOUT_MS", "45000")) / 1000
        self.embedding_model = os.environ.get("EMBEDDING_MODEL", "bge-m3")

        self.supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        self.supabase_service_key = os.environ.get("SUPABASE_SERVICE_KEY", "")

        # DO Functions namespace base, e.g.
        # https://faas-sfo3-xxxx.doserverless.co/api/v1/web/fn-xxxx/rollaway
        self.functions_base_url = os.environ.get("FUNCTIONS_BASE_URL", "").rstrip("/")

        self.cors_origins = [
            origin.strip()
            for origin in os.environ.get("CORS_ORIGIN", "*").split(",")
            if origin.strip()
        ]

        self.agents_dir = _agents_dir()
        self.kb_dir = self.agents_dir / "kb"
        self.instructions_dir = self.agents_dir / "instructions"
        self.menu_rag_dir = self.agents_dir / "menu_rag"

    def have_gradient_key(self) -> bool:
        return bool(self.gradient_api_key)

    def have_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
