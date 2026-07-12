# Rollaway backend (FastAPI)

The Phase 2 rewrite of `agents/runtime/` (docs/MIGRATION-PLAN.md §2b): a plain
FastAPI + httpx service that runs the two agents on DigitalOcean Gradient
serverless inference. No LangChain — the architecture is single-turn and
deterministic. `POST /chat` (legacy router) is deliberately dropped.

## Routes

| Route | Purpose |
|---|---|
| `GET /` | health + route listing |
| `POST /spot_scout` | single-turn Spot Scout: pre-gathered signals in, §A envelope out; score/verdict are deterministic code, the model only writes `why_one_line` prose |
| `POST /permit_copilot` | authored-checklist fast path + grounded fallback; §E citation ids preserved; pgvector retrieval when Supabase is configured |
| `POST /menu_extract` | text/url/image menu extraction; prices verified against source text; uploads persisted to Supabase Storage when configured |
| `POST /menu_overlap` | deterministic items+prices competition overlap (never a cuisine label) |
| `POST /form_fill` | doc ingestion: grounded fillable form schema pre-filled from the profile |
| `GET /form_pdf?source=` | verified, allowlisted agency-PDF proxy |
| `POST /api/recommend_spots`, `GET /api/vendors`, `GET /api/closures` | Phase 2 gateway proxies to the DO Functions namespace (Phase 3 absorbs them — issue #36) |

## Env

All optional — with nothing set the service boots and every LLM path degrades
to its deterministic template (same behavior as the Node runtime):

- `GRADIENT_API_KEY`, `GRADIENT_INFERENCE_URL`, `GRADIENT_MODEL` (default
  `anthropic-claude-haiku-4.5`), `GRADIENT_TIMEOUT_MS`
- `EMBEDDING_MODEL` (default `bge-m3`, 1024 dims — must match
  `supabase/migrations/0001_kb.sql`)
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — pgvector KB retrieval, menu
  storage/persistence; unset ⇒ local `agents/kb` keyword retrieval + local
  menu manifests
- `FUNCTIONS_BASE_URL` — DO Functions namespace for the `/api/*` gateway;
  unset ⇒ those routes return 503 CONFIG
- `CORS_ORIGIN` — comma-separated allowed origins (default `*`)
- `AGENTS_DIR` — where `kb/`, `instructions/`, `menu_rag/` live (defaults to
  the repo's `agents/`; the Dockerfile copies them to `/srv/agents`)

## Run locally

```sh
cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt
GRADIENT_API_KEY=... .venv/Scripts/python -m uvicorn app.main:app --port 8011
```

## Verification gate (blocking, per MIGRATION-PLAN)

```sh
cd backend && .venv/Scripts/python -m pytest          # unit port of the Node eval cases
cd agents && node evals/run.mjs                        # offline structural gate
GRADIENT_ENDPOINT_URL=http://127.0.0.1:8011 node evals/run.mjs --live   # contract test
```

The live runner auto-detects this backend (no `POST /chat` in the health
route list) and replays every seed against the direct endpoints.

## KB ingestion

```sh
GRADIENT_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
  python backend/scripts/ingest_kb.py        # --dry-run to preview
```

Documents are keyed by the frozen §E source ids so citations are unchanged.
