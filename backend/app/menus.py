"""Menu source for /menu_overlap.

Phase 2: menus live in Supabase (menus table) with the local
agents/menu_rag/menu_kb.*.json manifests kept as the offline/demo fallback
(they replace the old Gradient KB manifest lookup byte-for-byte).
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from .overlap import competition_overlap_core
from .settings import get_settings


def resolve_local_menu(menu_kb_id: str) -> dict[str, Any] | None:
    menu_rag_dir = get_settings().menu_rag_dir
    if not menu_rag_dir.is_dir():
        return None
    for path in sorted(menu_rag_dir.glob("menu_kb.*.json")):
        try:
            manifest = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if manifest.get("menu_kb_id") == menu_kb_id:
            return manifest
    return None


async def resolve_supabase_menu(menu_kb_id: str) -> dict[str, Any] | None:
    """menus table row (items jsonb) -> menu object. menu_kb_id convention for
    Supabase-backed menus: 'menu-sb-<row id>'."""
    settings = get_settings()
    if not settings.have_supabase() or not menu_kb_id.startswith("menu-sb-"):
        return None
    row_id = menu_kb_id.removeprefix("menu-sb-")
    if not row_id.isdigit():
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{settings.supabase_url}/rest/v1/menus",
                params={"id": f"eq.{row_id}", "select": "id,items,keywords"},
                headers={
                    "apikey": settings.supabase_service_key,
                    "authorization": f"Bearer {settings.supabase_service_key}",
                },
            )
        response.raise_for_status()
        rows = response.json()
    except Exception:
        return None
    if not rows:
        return None
    return {"menu_kb_id": menu_kb_id, "menu": {"vendor_id": menu_kb_id, "items": rows[0].get("items") or []}}


async def competition_overlap(
    *,
    menu_kb_id: str | None = None,
    competitors: list[dict[str, Any]] | None = None,
    menu: dict[str, Any] | None = None,
) -> dict[str, Any]:
    provider = "local"
    if not menu and menu_kb_id:
        manifest = await resolve_supabase_menu(menu_kb_id)
        if manifest:
            provider = "supabase"
        else:
            manifest = resolve_local_menu(menu_kb_id)
        if not manifest:
            raise ValueError(f'menu_kb_id "{menu_kb_id}" not found — ingest the menu first')
        menu = manifest["menu"]
    if not menu:
        raise ValueError("provide menu_kb_id (resolved via manifest) or a menu object")

    provenance = {
        "menu_kb_id": menu_kb_id,
        "provider": provider,
        "kb_verified": provider == "supabase",
        "retrieval": "deterministic",
    }
    core = competition_overlap_core(menu, competitors or [])
    return {**provenance, **core}
