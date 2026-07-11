# Agent runtime (Gradient serverless inference)

A working implementation of both agents behind a single `POST /chat` endpoint, running on
**DigitalOcean Gradient serverless inference**. This is the path we run **today** because managed
Gradient *Agent* creation is currently gated on the account (see `../RUNBOOK.md` →
"Managed vs runtime"). It uses the exact same repo artifacts as the managed design — the
instructions in `../instructions/`, the KB in `../kb/`, the tool schemas in `../fixtures/`, and
the guardrail config — just orchestrated here and executed via Gradient's model API.

## What it does (per request)

```
POST /chat  { session_id, message, context }
  → anonymize (PII stripped before logging)          ../evals/lib/guardrails.mjs
  → jailbreak? → refuse (valid §A envelope)           ../evals/lib/guardrails.mjs
  → route → spot_scout | permit_copilot               ../evals/lib/route.mjs
  → agent runs on Gradient inference:
      spot_scout    → function-calling over the tool server (../fixtures, then P3's Functions)
      permit_copilot→ grounded in the KB (KB docs in context), cites source ids
  → validate against §A                               ../evals/lib/schema.mjs
  → return the §A envelope
```

Spot Scout's clearance citations are **backfilled from the actual `check_clearance` tool output**
(its `cite` ids), so "every clearance answer carries a citation" holds even if the model forgets.

## Run it

```bash
# 1. tool server (fixtures now; Person 3's Functions later)
cd agents/fixtures && npm install && PORT=8787 node serve.js

# 2. the runtime (no npm install — pure Node http)
cd agents/runtime
GRADIENT_API_KEY=<gradient model key> TOOL_BASE_URL=http://localhost:8787 PORT=8080 node server.mjs

# 3. call it
curl -s localhost:8080/chat -X POST -H 'content-type: application/json' \
  -d '{"session_id":"s1","message":"pushcart selling ice cream, what permits?","context":{"vendor_type":"pushcart_nocook"}}'
# add ?debug=1 to see routing + tool trace in a `meta` block
```

## Env

| Var | Default | Purpose |
|---|---|---|
| `GRADIENT_API_KEY` | — (required) | Gradient serverless-inference key |
| `GRADIENT_INFERENCE_URL` | `https://inference.do-ai.run/v1` | OpenAI-compatible inference base |
| `GRADIENT_MODEL` | `llama3.3-70b-instruct` | model id |
| `TOOL_BASE_URL` | `http://localhost:8787` | tool server (swap for P3's Function base) |
| `PORT` | `8080` | server port |

## Validate live

`node ../evals/run.mjs --live` with `GRADIENT_ENDPOINT_URL=http://localhost:8080` replays the seed
suite against this runtime (it POSTs `/chat` and validates the §A envelope).

## Known limitations (vs managed Gradient Agents)

- **Latency:** Permit Copilot stuffs the relevant KB docs into context (full-context RAG), so a
  checklist answer is ~60–100s on the 70B model. Managed Agents do server-side retrieval and are
  much faster — that's the intended production path once Agent creation is enabled.
- **Model reliability:** occasionally the model omits an envelope field; the runtime backfills
  clearance citations and coerces `map_actions`/`checklist` shape, and the §A validator flags the
  rest (visible via `?debug=1`). A stronger model (e.g. GPT-4o) or the managed RAG runtime
  improves this.
- This runtime is the stopgap; `../scripts/provision-genai.mjs` provisions the managed agents the
  moment the account has Agent creation enabled.
