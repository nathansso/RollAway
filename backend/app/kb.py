"""Knowledge-base access for Permit Copilot.

Two retrieval paths, one contract:

- Supabase pgvector (`kb_chunks` via the `match_kb_chunks` RPC) when
  SUPABASE_URL + SUPABASE_SERVICE_KEY are configured — the Phase 2 replacement
  for Gradient Knowledge Bases. `kb_documents.id` IS the frozen §E source id,
  so citations are unchanged (docs/CONTRACTS.md §E invariant).
- Local keyword retrieval over agents/kb/*.md otherwise (identical to the Node
  runtime's retrieveRuleDocs) — dev fallback and degradation path.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from typing import Any

import httpx

from . import gradient
from .forms import parse_form_fields_table, parse_forms_table
from .settings import get_settings

RULE_DOCS = [
    "dpw-182101.md", "sf-sidewalk-width.md", "clearance-rules.md",
    "sfpw-mff-permit.md", "sfdph-mff.md", "sffd-permit.md", "ttx-cert.md", "ca-dmv.md",
]
CHECKLISTS = ["truck.md", "trailer.md", "pushcart_cooking.md", "pushcart_nocook.md"]
VENDOR_TYPES = ["truck", "trailer", "pushcart_cooking", "pushcart_nocook"]


def read_kb(filename: str) -> str:
    return (get_settings().kb_dir / filename).read_text(encoding="utf-8")


def read_instruction(filename: str) -> str:
    return (get_settings().instructions_dir / filename).read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def forms() -> dict[str, dict[str, str]]:
    return parse_forms_table(read_kb("FORMS.md"))


@lru_cache(maxsize=1)
def form_fields() -> dict[str, list[dict[str, Any]]]:
    return parse_form_fields_table(read_kb("FORM_FIELDS.md"))


@lru_cache(maxsize=1)
def sources() -> dict[str, dict[str, str]]:
    """source id -> { file, label } from the SOURCES.md table."""
    mapping: dict[str, dict[str, str]] = {}
    pattern = re.compile(r"^\|\s*`([a-z0-9-]+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]+)\|", re.IGNORECASE | re.MULTILINE)
    for match in pattern.finditer(read_kb("SOURCES.md")):
        mapping[match.group(1)] = {
            "file": match.group(2),
            "label": match.group(3).replace("**", "").strip()[:90],
        }
    return mapping


@lru_cache(maxsize=1)
def file_to_id() -> dict[str, str]:
    return {meta["file"]: source_id for source_id, meta in sources().items()}


def read_kb_files(files: list[str]) -> str:
    blocks = []
    for filename in dict.fromkeys(files):  # de-dupe, keep order
        try:
            content = read_kb(filename)
        except OSError:
            continue
        blocks.append(f"### FILE: kb/{filename}\n{content}")
    return "\n\n".join(blocks)


def retrieve_rule_docs(message: str = "") -> list[str]:
    """Rule docs the question actually mentions (keyword overlap), top 3."""
    terms = list(dict.fromkeys(re.findall(r"[a-z]{4,}", (message or "").lower())))
    scored = []
    for filename in RULE_DOCS:
        try:
            text = read_kb(filename).lower()
        except OSError:
            continue
        score = sum(1 for term in terms if term in text)
        if score > 0:
            scored.append((filename, score))
    scored.sort(key=lambda pair: -pair[1])
    return [filename for filename, _ in scored[:3]]


async def retrieve_rule_docs_semantic(message: str = "") -> list[str]:
    """pgvector retrieval: embed the question, match kb_chunks, map hits back
    to §E source ids -> kb filenames. Falls back to keyword retrieval on any
    failure (no Supabase, no key, network error)."""
    settings = get_settings()
    if not (settings.have_supabase() and settings.have_gradient_key() and (message or "").strip()):
        return retrieve_rule_docs(message)
    try:
        [embedding] = await gradient.embed([message])
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{settings.supabase_url}/rest/v1/rpc/match_kb_chunks",
                headers={
                    "apikey": settings.supabase_service_key,
                    "authorization": f"Bearer {settings.supabase_service_key}",
                },
                json={"query_embedding": embedding, "match_count": 6},
            )
        response.raise_for_status()
        hits = response.json()
        src = sources()
        files: list[str] = []
        for hit in hits:
            meta = src.get(hit.get("document_id") or "")
            if meta and meta["file"] not in files and meta["file"] in RULE_DOCS:
                files.append(meta["file"])
        return files[:3] if files else retrieve_rule_docs(message)
    except Exception:
        return retrieve_rule_docs(message)


def kb_context(vendor_type: str | None, message: str = "", retrieved: list[str] | None = None) -> str:
    files = ["SOURCES.md", "FORMS.md"]
    if vendor_type and f"{vendor_type}.md" in CHECKLISTS:
        files.append(f"{vendor_type}.md")
    else:
        files.extend(CHECKLISTS)
    files.extend(retrieved if retrieved is not None else retrieve_rule_docs(message))
    return read_kb_files(files)


def extract_json_block(markdown: str) -> dict[str, Any] | None:
    """First JSON code block in a kb checklist doc (the authored §D checklist)."""
    for match in re.finditer(r"```(?:json)?\s*([\s\S]*?)```", markdown):
        try:
            parsed = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and parsed.get("vendor_type"):
            return parsed
    return None


def citations_for(checklist: dict[str, Any] | None, retrieved_files: list[str] | None) -> list[dict[str, str]]:
    src = sources()
    out: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(source_id: str | None, quote: str | None) -> None:
        if not source_id or source_id in seen:
            return
        seen.add(source_id)
        meta = src.get(source_id)
        label = meta["label"] if meta else source_id
        fallback = meta["label"] if meta else f"See kb/{source_id}"
        out.append({"label": label, "source": source_id, "quote": (quote or fallback)[:180]})

    if checklist:
        for step in checklist.get("steps", []):
            add(step.get("cite"), step.get("detail"))
    for filename in retrieved_files or []:
        add(file_to_id().get(filename), None)
    return out
