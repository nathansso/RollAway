"""Menu extraction — port of agents/menu_rag/{parse.mjs,extract.mjs}.

Gradient extracts structure; deterministic code verifies every price against
the source text (hallucinated prices are dropped, never trusted). Phase 2:
uploaded files (data URLs) are persisted to Supabase Storage (private `menus`
bucket) and extraction results to the menus table when Supabase is configured;
the data-URL request path stays working for frontend back-compat.
"""

from __future__ import annotations

import base64
import ipaddress
import json
import re
from typing import Any
from urllib.parse import urlparse

import httpx

from . import gradient
from .settings import get_settings


def _instructions() -> str:
    return (get_settings().instructions_dir / "menu_parser.md").read_text(encoding="utf-8")


def _extract_json(text: str) -> dict[str, Any]:
    source = re.sub(r"^```(?:json)?\s*|\s*```$", "", str(text or "")).strip()
    start, end = source.find("{"), source.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("menu parser returned no JSON object")
    return json.loads(source[start:end + 1])


def _numeric_cents(text: str) -> set[int]:
    values: set[int] = set()
    for match in re.finditer(r"(?:\$\s*)?(\d{1,4}(?:[.,]\d{1,2})?)", str(text or "")):
        try:
            values.add(round(float(match.group(1).replace(",", ".")) * 100))
        except ValueError:
            continue
    return values


def verify_prices_in_source(source_text: str, items: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    source_prices = _numeric_cents(source_text)
    kept: list[dict[str, Any]] = []
    for item in items or []:
        try:
            price = float(item.get("price"))
        except (TypeError, ValueError):
            continue
        cents = round(price * 100)
        if cents not in source_prices:
            continue  # untraceable price -> dropped deterministically
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        keywords = item.get("keywords")
        kept.append({
            "name": name,
            "keywords": [
                str(k).lower().strip() for k in keywords if str(k).strip()
            ][:12] if isinstance(keywords, list) else [],
            "price": cents / 100,
        })
    return kept


def mock_parse(raw_text: str) -> dict[str, Any]:
    items = []
    for line in str(raw_text or "").splitlines():
        match = re.match(r"^\s*[-*]?\s*(.+?)\s+(?:[-:]\s*)?\$?\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*$", line)
        if not match:
            continue
        name = match.group(1).strip()
        keywords = list(dict.fromkeys(re.findall(r"[a-z]{3,}", name.lower())))
        items.append({"name": name, "keywords": keywords, "price": float(match.group(2).replace(",", "."))})
    return {"currency": "USD", "items": items}


async def parse_menu_text(
    *, text: str, vendor_id: str, vendor_type: str = "unknown", mock: bool = False
) -> dict[str, Any]:
    if not str(text or "").strip():
        raise ValueError("raw menu text is required")
    if not str(vendor_id or "").strip():
        raise ValueError("vendor_id is required")
    if mock or not gradient.have_key():
        parsed = mock_parse(text)
    else:
        output = await gradient.complete([
            {"role": "system", "content": _instructions()},
            {"role": "user", "content": (
                f"Vendor id: {vendor_id}\nVendor type: {vendor_type}\n\nUNTRUSTED MENU TEXT:\n{text}"
            )},
        ], max_tokens=1400)
        parsed = _extract_json(output)
    return {
        "vendor_id": str(vendor_id).strip(),
        "vendor_type": str(vendor_type or "unknown").strip(),
        "currency": parsed.get("currency") if isinstance(parsed.get("currency"), str) and parsed.get("currency") else "USD",
        "items": verify_prices_in_source(text, parsed.get("items") if isinstance(parsed.get("items"), list) else []),
    }


def assert_public_url(raw: str) -> str:
    """Basic SSRF guard: public http(s) only, no localhost / private ranges."""
    try:
        url = urlparse(str(raw))
    except ValueError as error:
        raise ValueError("invalid url") from error
    if url.scheme not in ("http", "https") or not url.hostname:
        raise ValueError("url must be http(s)")
    host = url.hostname.lower()
    blocked = host in ("localhost", "0.0.0.0") or host.endswith(".local")
    try:
        blocked = blocked or ipaddress.ip_address(host).is_private or ipaddress.ip_address(host).is_link_local
    except ValueError:
        pass  # not an IP literal
    if blocked:
        raise ValueError("url host not allowed")
    return str(raw)


def _strip_html(html: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", str(html or ""), flags=re.IGNORECASE)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"&amp;", "&", text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip()


async def _fetch_url_text(url: str) -> str:
    target = assert_public_url(url)
    async with httpx.AsyncClient(
        timeout=10, follow_redirects=True, headers={"user-agent": "rollaway-menu-extractor"}
    ) as client:
        response = await client.get(target)
    if response.status_code != 200:
        raise ValueError(f"fetch {response.status_code}")
    text = _strip_html(response.text)[:20000]
    if not text:
        raise ValueError("no readable text at that link")
    return text


def to_plain_text(items: list[dict[str, Any]]) -> str:
    lines = []
    for item in items:
        price = f"{float(item['price']):.2f}"
        price = re.sub(r"\.00$", "", price)
        lines.append(f"{item['name']} — ${price}")
    return "\n".join(lines)


async def _extract_from_image(
    *, image_data_url: str, vendor_id: str, vendor_type: str
) -> dict[str, Any]:
    if not gradient.have_key():
        raise ValueError("image extraction requires a Gradient vision model (GRADIENT_API_KEY)")
    output = await gradient.complete([
        {"role": "system", "content": _instructions()},
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        f"Vendor id: {vendor_id}\nVendor type: {vendor_type}\n"
                        "Extract the menu items and prices visible in this image."
                    ),
                },
                {"type": "image_url", "image_url": {"url": image_data_url}},
            ],
        },
    ], max_tokens=1400)
    try:
        parsed = _extract_json(output)
    except (ValueError, json.JSONDecodeError):
        # Blank/unreadable image: model answered in prose -> no items.
        return {"vendor_id": str(vendor_id), "vendor_type": str(vendor_type), "currency": "USD", "items": []}
    items = []
    for it in parsed.get("items", []) if isinstance(parsed.get("items"), list) else []:
        name = str((it or {}).get("name") or "").strip()
        try:
            price = float((it or {}).get("price"))
        except (TypeError, ValueError):
            continue
        if not name:
            continue
        keywords = (it or {}).get("keywords")
        items.append({
            "name": name,
            "keywords": [str(k).lower().strip() for k in keywords if str(k).strip()][:12]
            if isinstance(keywords, list) else [],
            "price": price,
        })
    return {
        "vendor_id": str(vendor_id),
        "vendor_type": str(vendor_type),
        "currency": parsed.get("currency") or "USD",
        "items": items,
    }


async def _persist_upload(payload: dict[str, Any], result: dict[str, Any]) -> str | None:
    """Best-effort: store the uploaded menu image in the private `menus`
    Storage bucket + the extraction result in the menus table. Never blocks or
    fails the extraction response."""
    settings = get_settings()
    data_url = payload.get("image_data_url")
    if not settings.have_supabase() or not isinstance(data_url, str):
        return None
    match = re.match(r"^data:([\w/+.-]+);base64,(.+)$", data_url, re.DOTALL)
    if not match:
        return None
    mime, b64 = match.group(1), match.group(2)
    ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf"}.get(mime, "bin")
    vendor_id = re.sub(r"[^a-zA-Z0-9_-]", "-", str(payload.get("vendor_id") or "anonymous"))
    import time
    object_path = f"uploads/{vendor_id}/{int(time.time() * 1000)}.{ext}"
    headers = {
        "apikey": settings.supabase_service_key,
        "authorization": f"Bearer {settings.supabase_service_key}",
    }
    try:
        blob = base64.b64decode(b64)
        async with httpx.AsyncClient(timeout=20) as client:
            upload = await client.post(
                f"{settings.supabase_url}/storage/v1/object/menus/{object_path}",
                headers={**headers, "content-type": mime},
                content=blob,
            )
            if upload.status_code not in (200, 201):
                return None
            await client.post(
                f"{settings.supabase_url}/rest/v1/menus",
                headers={**headers, "content-type": "application/json", "prefer": "return=minimal"},
                json={
                    "storage_path": object_path,
                    "items": result.get("items") or [],
                    "keywords": sorted({
                        k for item in result.get("items") or [] for k in item.get("keywords", [])
                    }),
                },
            )
        return object_path
    except Exception:
        return None


async def extract_menu(payload: dict[str, Any]) -> dict[str, Any]:
    input_type = payload.get("input_type")
    vendor_id = payload.get("vendor_id", "vendor")
    vendor_type = payload.get("vendor_type", "unknown")
    mock = bool(payload.get("mock", False))

    if input_type == "url" or (not input_type and payload.get("url")):
        text = await _fetch_url_text(payload.get("url"))
        result = await parse_menu_text(text=text, vendor_id=vendor_id, vendor_type=vendor_type, mock=mock)
    elif input_type == "image" or (not input_type and payload.get("image_data_url")):
        result = await _extract_from_image(
            image_data_url=payload.get("image_data_url"), vendor_id=vendor_id, vendor_type=vendor_type
        )
    else:
        result = await parse_menu_text(
            text=payload.get("text"), vendor_id=vendor_id, vendor_type=vendor_type, mock=mock
        )

    storage_path = await _persist_upload(payload, result)
    out = {"ok": True, **result, "plain_text": to_plain_text(result["items"])}
    if storage_path:
        out["storage_path"] = storage_path
    return out
