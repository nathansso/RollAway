"""Thin client for DigitalOcean Gradient serverless inference.

Python port of agents/runtime/gradient.mjs — OpenAI-compatible chat
completions over httpx with a hard per-call timeout so a stalled inference
call degrades to the deterministic template instead of hanging the request.
"""

from __future__ import annotations

from typing import Any

import httpx

from .settings import get_settings


def have_key() -> bool:
    return get_settings().have_gradient_key()


async def chat(
    messages: list[dict[str, Any]],
    *,
    temperature: float = 0,
    max_tokens: int = 1200,
) -> dict[str, Any]:
    settings = get_settings()
    if not settings.gradient_api_key:
        raise RuntimeError("GRADIENT_API_KEY not set")
    body = {
        "model": settings.gradient_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=settings.gradient_timeout_s) as client:
        response = await client.post(
            f"{settings.gradient_url}/chat/completions",
            headers={"authorization": f"Bearer {settings.gradient_api_key}"},
            json=body,
        )
    if response.status_code != 200:
        raise RuntimeError(f"inference {response.status_code}: {response.text[:300]}")
    return response.json()


async def complete(
    messages: list[dict[str, Any]],
    *,
    temperature: float = 0,
    max_tokens: int = 1200,
) -> str:
    data = await chat(messages, temperature=temperature, max_tokens=max_tokens)
    choices = data.get("choices") or []
    if not choices:
        return ""
    return (choices[0].get("message") or {}).get("content") or ""


async def embed(texts: list[str]) -> list[list[float]]:
    """Embeddings via Gradient inference (verified live: bge-m3, 1024 dims)."""
    settings = get_settings()
    if not settings.gradient_api_key:
        raise RuntimeError("GRADIENT_API_KEY not set")
    async with httpx.AsyncClient(timeout=settings.gradient_timeout_s) as client:
        response = await client.post(
            f"{settings.gradient_url}/embeddings",
            headers={"authorization": f"Bearer {settings.gradient_api_key}"},
            json={"model": settings.embedding_model, "input": texts},
        )
    if response.status_code != 200:
        raise RuntimeError(f"embeddings {response.status_code}: {response.text[:300]}")
    payload = response.json()
    rows = sorted(payload.get("data", []), key=lambda r: r.get("index", 0))
    return [row["embedding"] for row in rows]
