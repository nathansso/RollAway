# Evals — the acceptance gate

A fixed prompt suite (`seeds.json`) plus a runner with two modes. **Offline must be GREEN before
any integration merge.** Rerun after **every** instruction change; treat regressions as blocking.

## Run it (the one command P1/P3 use)

```bash
cd agents/evals
node run.mjs --offline      # structural gate — no credentials, must be GREEN
node run.mjs --live         # replays the seeds against the deployed endpoint (needs creds)
```

No `npm install` — pure Node (v20+), no dependencies.

## What `--offline` proves (all against the repo, no live model)

| Check | Guards |
|---|---|
| instructions are versioned | every prompt file has a `version:` header |
| envelope examples conform to §A | both filled examples in `output_envelope.md` validate |
| examples split map_actions vs checklist | Spot Scout fills `map_actions`; Permit fills `checklist` |
| kb checklists conform to §D | all four vendor-type checklists validate |
| router routes every seed correctly | `lib/route.mjs` (mirror of `router.md`) picks the right agent |
| all cited source ids resolve | every `source`/`cite` exists in `kb/SOURCES.md` |
| SOURCES ⇄ CONTRACTS §E in sync | the id lists match |
| fixtures tool schemas match §B | input params ⊇ §B, output keys == §B, item fields == §B |
| clearance fixture 50<75 fails | seed #2: the NO comes from geometry, cite `dpw-182101` |
| pushcart_nocook excludes DMV / has sidewalk clearance | seed #1 |
| truck includes DMV + Fire | the pushcart≠truck contrast |
| fire-permit seed grounded | seed #4: no-cook cart has no Fire step + KB says so |
| guardrail refuses jailbreak, allows benign | seed #5 |
| guardrail anonymizes PII before logging | PII seed: EMAIL/PHONE redacted |
| spot_scout bakes in honesty + no-math rules | proxy / guide / "never do legality math" |

## Seeds (`seeds.json`)

The five required Task-7 seeds plus three coverage seeds. Each seed carries an explicit
`asserts` block and a `note` explaining the expected behavior, so a human can read the intent.

## `--live`

Set `GRADIENT_ENDPOINT_URL` and `GRADIENT_AGENT_KEY` (from the deploy in `RUNBOOK.md`). It POSTs
each seed to `${GRADIENT_ENDPOINT_URL}/chat`, validates the response envelope against §A, and
checks the routed agent. Until those env vars exist it prints `SKIPPED` and exits 0 (not a
failure) — the offline gate is what blocks merges today.

## When you change something

1. Edit the instruction / KB / schema.
2. Bump the `version:` header + changelog in the changed instruction file.
3. `node run.mjs --offline` → must be GREEN.
4. If you changed the router keyword lists, also update `lib/route.mjs`.
5. If you changed the cuisine enum or a tool schema, ping P1 + P3 (contract change).
