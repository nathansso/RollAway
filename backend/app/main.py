"""Rollaway backend — FastAPI service on Railway (docs/MIGRATION-PLAN.md §2b).

Endpoints ported from agents/runtime/server.mjs (POST /chat deliberately
dropped — legacy router path, nothing calls it), plus the Phase 2 gateway
proxies to the DO Functions namespace so the frontend ends Phase 2 with one
backend base URL.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import FastAPI, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import agents, guardrails, menu_extract, menus
from .envelope import validate_envelope
from .settings import get_settings

logger = logging.getLogger("rollaway")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="rollaway-backend", docs_url=None, redoc_url=None)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ROUTES = [
    "GET /",
    "POST /spot_scout (single-turn, no router)",
    "POST /permit_copilot (direct)",
    "POST /menu_extract",
    "POST /menu_overlap",
    "POST /form_fill (doc ingestion)",
    "GET /form_pdf?source= (verified PDF proxy)",
    "POST /api/recommend_spots (gateway -> DO Function)",
    "GET /api/vendors (gateway)",
    "GET /api/closures (gateway)",
]


def _log_request(route: str, message: str | None) -> None:
    """Guardrails logging rule: only anonymized text ever reaches logs."""
    anonymized, redacted = guardrails.anonymize(message or "")
    suffix = f" [redacted: {','.join(sorted(set(redacted)))}]" if redacted else ""
    logger.info("%s: %s%s", route, anonymized[:300], suffix)


async def _read_json(request: Request) -> dict[str, Any] | None:
    try:
        body = await request.json()
    except Exception:
        return None
    return body if isinstance(body, dict) else None


def _with_debug(env: dict[str, Any], debug: bool, **meta: Any) -> Any:
    if not debug:
        return env
    errors = validate_envelope(env)
    return {"envelope": env, "meta": {**meta, "valid": len(errors) == 0, "errors": errors}}


@app.get("/")
async def health() -> dict[str, Any]:
    return {
        "service": "rollaway-backend",
        "model": settings.gradient_model,
        "inference": settings.gradient_url,
        "key_present": settings.have_gradient_key(),
        "supabase": settings.have_supabase(),
        "functions_gateway": bool(settings.functions_base_url),
        "routes": ROUTES,
    }


@app.post("/spot_scout")
async def spot_scout(request: Request, debug: str | None = Query(default=None)) -> Any:
    payload = await _read_json(request)
    if payload is None:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)
    _log_request("spot_scout", payload.get("message"))
    if guardrails.detect_jailbreak(payload.get("message")):
        return _with_debug(guardrails.refusal_envelope("spot_scout"), bool(debug), refused=True)
    try:
        env, trace = await agents.run_spot_scout_single_turn(payload)
        return _with_debug(env, bool(debug), single_turn=True, tool_calls=len(trace))
    except Exception as error:
        logger.exception("spot_scout failed")
        return JSONResponse(
            {"agent": "spot_scout", "reply_markdown": f"error: {error}", "citations": [],
             "map_actions": [], "checklist": None},
            status_code=500,
        )


@app.post("/permit_copilot")
async def permit_copilot(request: Request, debug: str | None = Query(default=None)) -> Any:
    payload = await _read_json(request)
    if payload is None:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)
    message = payload.get("message") or f"permit checklist for {payload.get('vendor_type')}"
    _log_request("permit_copilot", message)
    if guardrails.detect_jailbreak(message):
        return _with_debug(guardrails.refusal_envelope("permit_copilot"), bool(debug), refused=True)
    context = {
        "vendor_type": payload.get("vendor_type"),
        **(payload.get("context") or {}),
        "permit_progress": payload.get("permit_progress"),
    }
    try:
        env, trace = await agents.run_permit_copilot(message, context)
        return _with_debug(env, bool(debug), direct=True, tool_calls=len(trace))
    except Exception as error:
        logger.exception("permit_copilot failed")
        return JSONResponse(
            {"agent": "permit_copilot", "reply_markdown": f"error: {error}", "citations": [],
             "map_actions": [], "checklist": None},
            status_code=500,
        )


@app.post("/menu_extract")
async def menu_extract_route(request: Request) -> Any:
    payload = await _read_json(request)
    if payload is None:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)
    try:
        return await menu_extract.extract_menu(payload)
    except Exception as error:
        # Parity with the Node runtime: extraction errors are ok:false, HTTP 200.
        return {"ok": False, "error": str(error)}


@app.post("/menu_overlap")
async def menu_overlap(request: Request) -> Any:
    payload = await _read_json(request)
    if payload is None:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)
    try:
        return await menus.competition_overlap(
            menu_kb_id=payload.get("menu_kb_id"),
            competitors=payload.get("competitors"),
            menu=payload.get("menu"),
        )
    except Exception as error:
        return JSONResponse({"error": str(error)}, status_code=400)


@app.post("/form_fill")
async def form_fill(request: Request) -> Any:
    payload = await _read_json(request)
    if payload is None:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)
    try:
        schema = await agents.run_form_fill(payload)
    except Exception as error:
        return JSONResponse({"error": {"code": "UPSTREAM_TIMEOUT", "message": str(error)}}, status_code=500)
    return JSONResponse(schema, status_code=400 if schema.get("error") else 200)


@app.get("/form_pdf")
async def form_pdf(source: str | None = Query(default=None)) -> Response:
    pdf_url = agents.resolve_form_pdf_url(source)
    if not pdf_url:
        return JSONResponse(
            {"error": {"code": "BAD_INPUT", "message": f"no verified form PDF for source '{source}'"}},
            status_code=400,
        )
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            upstream = await client.get(pdf_url)
        if upstream.status_code != 200:
            return JSONResponse(
                {"error": {"code": "UPSTREAM_TIMEOUT", "message": f"agency PDF {upstream.status_code}"}},
                status_code=502,
            )
        return Response(
            content=upstream.content,
            media_type="application/pdf",
            headers={
                "access-control-allow-origin": "*",
                "cache-control": "no-store",
                "x-form-source": source or "",
            },
        )
    except Exception as error:
        return JSONResponse({"error": {"code": "UPSTREAM_TIMEOUT", "message": str(error)}}, status_code=502)


# ---------------------------------------------------------------------------
# Gateway routes (Phase 2 = proxy to the DO Functions namespace, Phase 3 =
# absorb — see GitHub issue #36).
# ---------------------------------------------------------------------------

def _gateway_unconfigured() -> JSONResponse:
    return JSONResponse(
        {"error": {"code": "CONFIG", "message": "FUNCTIONS_BASE_URL is not configured on this service"}},
        status_code=503,
    )


async def _proxy_get(function_name: str, request: Request) -> Response:
    if not settings.functions_base_url:
        return _gateway_unconfigured()
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            upstream = await client.get(
                f"{settings.functions_base_url}/{function_name}",
                params=dict(request.query_params),
            )
        return Response(
            content=upstream.content,
            status_code=upstream.status_code,
            media_type=upstream.headers.get("content-type", "application/json"),
        )
    except Exception as error:
        return JSONResponse({"error": {"code": "UPSTREAM_TIMEOUT", "message": str(error)}}, status_code=502)


@app.post("/api/recommend_spots")
async def api_recommend_spots(request: Request) -> Response:
    if not settings.functions_base_url:
        return _gateway_unconfigured()
    payload = await _read_json(request)
    if payload is None:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            upstream = await client.post(
                f"{settings.functions_base_url}/recommend_spots", json=payload
            )
        return Response(
            content=upstream.content,
            status_code=upstream.status_code,
            media_type=upstream.headers.get("content-type", "application/json"),
        )
    except Exception as error:
        return JSONResponse({"error": {"code": "UPSTREAM_TIMEOUT", "message": str(error)}}, status_code=502)


@app.get("/api/vendors")
async def api_vendors(request: Request) -> Response:
    return await _proxy_get("get_vendors", request)


@app.get("/api/closures")
async def api_closures(request: Request) -> Response:
    return await _proxy_get("get_closures", request)
