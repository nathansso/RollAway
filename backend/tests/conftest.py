import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Deterministic offline test run: no inference key, no Supabase, no gateway —
# every LLM path must degrade to its template (mirrors the Node offline gate).
for var in (
    "GRADIENT_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY",
    "FUNCTIONS_BASE_URL", "AGENTS_DIR", "GRADIENT_MODEL",
):
    os.environ.pop(var, None)


@pytest.fixture(autouse=True)
def _fresh_settings():
    from app import guardrails, kb
    from app.settings import get_settings

    get_settings.cache_clear()
    for cached in (kb.forms, kb.form_fields, kb.sources, kb.file_to_id):
        cached.cache_clear()
    guardrails._config.cache_clear()
    guardrails._jailbreak_patterns.cache_clear()
    guardrails._pii_rules.cache_clear()
    yield
