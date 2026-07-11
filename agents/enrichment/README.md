# Cuisine Enrichment (serverless inference)

Maps each SF permit's free-text `fooditems` (e.g. `"hot dogs: chips: soda"`) to **exactly one**
value from the §C cuisine enum, and emits a **pre-computed lookup table keyed by `permit_id`**.
Person 3's `get_vendors` joins on it so "another taco truck nearby?" is answerable.

## §C cuisine enum (Person 2 owns it)

`tacos, burritos, burgers, hot_dogs, sandwiches, coffee, ice_cream, bbq, asian, halal, pizza,
seafood, desserts, drinks, other`

Changing this enum pings **Person 1** (renders it) and **Person 3** (returns it). It lives in
`docs/CONTRACTS.md §C` and is duplicated as `CUISINES` in `classify.mjs` (keep in sync).

## Re-run (the one command)

```bash
cd agents/enrichment

# 1. Pull all permits once (real SF Mobile Food Facility dataset):
curl "https://data.sfgov.org/resource/rqzj-sfat.json?\$limit=5000" > permits.json

# 2a. Live (Gradient serverless inference):
GRADIENT_API_KEY=<your-key> node classify.mjs
#     optional env: GRADIENT_INFERENCE_URL (default https://inference.do-ai.run/v1),
#                   GRADIENT_MODEL (default llama3.3-70b-instruct)

# 2b. No key? deterministic mock (fully runnable, produces a real sample):
node classify.mjs --mock
```

Output: `cuisine_lookup.json` → `{ "<permit_id>": "tacos", ... }`.

## Prompt caching

Every inference call sends the **identical system prefix** (`CACHEABLE_PREFIX` in `classify.mjs`
— the enum + rules); only the one record varies in the user message. That fixed prefix is what
Gradient's prompt cache hits, so a 5,000-record batch pays for the prefix roughly once instead of
5,000 times. Keep the prefix byte-identical across calls (don't interpolate the record into it).

## Why pre-compute (not inline in the Function)

Recommended to Person 3: **pre-compute this table and join on `permit_id`**, rather than
classifying inline inside `get_vendors`:
- cheaper (classify each permit once, not per request),
- stable (no per-request LLM latency or nondeterminism in a hot path),
- the permit dataset churns slowly, so re-running is manual and rare.

`get_vendors` returns `cuisine` by looking up `permit_id` in `cuisine_lookup.json`.

## Live endpoint / model

The exact serverless-inference URL and model name come from the Gradient console and are set via
env (`GRADIENT_INFERENCE_URL`, `GRADIENT_MODEL`) — the defaults are placeholders until confirmed
against the project's console (see `agents/DECISIONS.md` D8 and `agents/RUNBOOK.md`). The pipeline
runs today in `--mock` with no credentials.
