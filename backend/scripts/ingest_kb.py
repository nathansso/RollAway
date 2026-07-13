#!/usr/bin/env python
"""Ingest agents/kb/*.md into Supabase pgvector (kb_documents + kb_chunks).

Documents are keyed by the frozen §E source ids from kb/SOURCES.md so Permit
Copilot citations survive the migration unchanged (docs/CONTRACTS.md §E).

Chunking: ~500 tokens with 50-token overlap (token ≈ whitespace word here —
the KB docs are short; most fit in one chunk). Embeddings: Gradient inference
`bge-m3` (1024 dims — must match supabase/migrations/0001_kb.sql).

Usage:
  GRADIENT_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
    python backend/scripts/ingest_kb.py [--dry-run]
"""

from __future__ import annotations

import asyncio
import re
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import gradient  # noqa: E402
from app.settings import get_settings  # noqa: E402

CHUNK_TOKENS = 500
OVERLAP_TOKENS = 50


def chunk_text(text: str) -> list[str]:
    words = text.split()
    if not words:
        return []
    chunks = []
    start = 0
    while start < len(words):
        end = min(start + CHUNK_TOKENS, len(words))
        chunks.append(" ".join(words[start:end]))
        if end == len(words):
            break
        start = end - OVERLAP_TOKENS
    return chunks


def load_sources() -> dict[str, dict[str, str]]:
    settings = get_settings()
    pattern = re.compile(r"^\|\s*`([a-z0-9-]+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]+)\|", re.IGNORECASE | re.MULTILINE)
    text = (settings.kb_dir / "SOURCES.md").read_text(encoding="utf-8")
    return {
        m.group(1): {"file": m.group(2), "label": m.group(3).replace("**", "").strip()}
        for m in pattern.finditer(text)
    }


async def main(dry_run: bool) -> None:
    settings = get_settings()
    sources = load_sources()
    print(f"[ingest] {len(sources)} §E source ids from SOURCES.md")

    docs = []
    for source_id, meta in sources.items():
        path = settings.kb_dir / meta["file"]
        if not path.is_file():
            print(f"[ingest] skip {source_id}: kb/{meta['file']} missing")
            continue
        body = path.read_text(encoding="utf-8")
        docs.append({"id": source_id, "title": meta["label"], "body_md": body, "chunks": chunk_text(body)})

    total_chunks = sum(len(d["chunks"]) for d in docs)
    print(f"[ingest] {len(docs)} documents, {total_chunks} chunks (~{CHUNK_TOKENS} tokens, overlap {OVERLAP_TOKENS})")
    if dry_run:
        for d in docs:
            print(f"  {d['id']}: {len(d['chunks'])} chunk(s)")
        return

    if not settings.have_supabase():
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_KEY are required (or use --dry-run)")
    if not settings.have_gradient_key():
        raise SystemExit("GRADIENT_API_KEY is required for embeddings (or use --dry-run)")

    headers = {
        "apikey": settings.supabase_service_key,
        "authorization": f"Bearer {settings.supabase_service_key}",
        "content-type": "application/json",
    }
    async with httpx.AsyncClient(timeout=60) as client:
        for doc in docs:
            embeddings = await gradient.embed(doc["chunks"]) if doc["chunks"] else []
            upsert = await client.post(
                f"{settings.supabase_url}/rest/v1/kb_documents",
                headers={**headers, "prefer": "resolution=merge-duplicates"},
                json=[{"id": doc["id"], "title": doc["title"], "body_md": doc["body_md"]}],
            )
            upsert.raise_for_status()
            # replace chunks wholesale (idempotent re-ingest)
            delete = await client.delete(
                f"{settings.supabase_url}/rest/v1/kb_chunks",
                params={"document_id": f"eq.{doc['id']}"},
                headers=headers,
            )
            delete.raise_for_status()
            if doc["chunks"]:
                insert = await client.post(
                    f"{settings.supabase_url}/rest/v1/kb_chunks",
                    headers={**headers, "prefer": "return=minimal"},
                    json=[
                        {"document_id": doc["id"], "chunk_index": i, "content": chunk, "embedding": emb}
                        for i, (chunk, emb) in enumerate(zip(doc["chunks"], embeddings))
                    ],
                )
                insert.raise_for_status()
            print(f"[ingest] {doc['id']}: {len(doc['chunks'])} chunk(s) upserted")
    print("[ingest] done — citations keep the §E ids unchanged")


if __name__ == "__main__":
    asyncio.run(main("--dry-run" in sys.argv))
