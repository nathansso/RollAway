# Person 2 — Agents & Gradient Platform (branch `feat/agents-platform`)

**You own the brain.** Both Gradient agents, the router in front of them, the knowledge base,
guardrails, evaluations, and the serverless-inference enrichment. You are the bridge between
Person 1's `/chat` calls and Person 3's Functions.

**Your directory:** `/agents` (agent instructions, KB source docs, eval prompts, routing config,
enrichment scripts).
**You depend on:** Person 3's Function tool schemas (§B) — build against fixtures until live.
**Person 1 depends on you:** the `/chat` envelope (§A) is your output contract.

---

## Definition of done
- [ ] Single routed `/chat` entry point that classifies and dispatches to the right agent.
- [ ] **Spot Scout** answers location questions via Gradient function calling over the 5 tools.
- [ ] **Permit Copilot** answers permit questions grounded in the knowledge base, with citations.
- [ ] Both agents return the §A envelope (`map_actions` for Spot Scout, `checklist` for Permit).
- [ ] Serverless-inference cuisine classifier enriches vendor/restaurant data (with prompt caching).
- [ ] Guardrails (sensitive-data anonymization + jailbreak detection) attached to both agents.
- [ ] Evaluation suite of fixed prompts, rerun after every instruction change; passing = green.

---

## Task 1 — Gradient project + routing
- [ ] Stand up the Gradient project; create the two agents and the routed entry point.
- [ ] **Agent routing:** classify each incoming message → `spot_scout` or `permit_copilot`.
      Location/where/park/traffic/events → Spot Scout. Permit/license/fire/legal/checklist → Permit.
      Ambiguous → ask a one-line clarifier or default to Spot Scout.
- [ ] Both agents must emit the §A response envelope. Write the output-shaping instruction once
      and share it.

## Task 2 — Spot Scout (function calling)
- [ ] Register the 5 tools + clearance check as function-calling tools using the §B schemas.
- [ ] Instruction: decide **which** tools each question needs (don't call all five every time),
      call them, then reason over results into ranked spots with verdicts + reasons.
- [ ] **Hard rule:** never do legality math in the model. When legality is in question, call the
      clearance-geometry tool and only *explain* its result. Bake this into the system prompt.
- [ ] Map tool outputs → `map_actions[]` (verdict, score, reasons, breakdown).
- [ ] Handle the Function error envelope gracefully (degrade, tell the user what's missing).

## Task 3 — Permit Copilot (knowledge base)
- [ ] Build the Gradient knowledge base from source docs (Task 4).
- [ ] Instruction: answer permit questions grounded ONLY in the KB; every answer cites its source.
      If not in the KB, say so — don't invent rules.
- [ ] Given a `vendor_type`, produce the ordered checklist (§D) across all four agencies, with the
      hidden deadlines surfaced (30-day notice, 90-day window, 15-day appeal).
- [ ] Populate `citations[]` in the envelope for every claim.

## Task 4 — Knowledge base content
- [ ] Ingest: SF Public Works mobile food rules, DPW Order 182,101, clearance requirements,
      fee schedules, and the per-vendor-type checklists.
- [ ] Chunk sensibly; tag each chunk with a stable `source` id (e.g. `dpw-182101`) so citations
      resolve. Keep the source-id list in sync with `docs/CONTRACTS.md`.
- [ ] Author the four vendor-type checklists as first-class KB docs (they differ:
      pushcart ≠ truck on DMV, fire, sidewalk clearance).

## Task 5 — Serverless-inference enrichment
- [ ] Batch classifier: map free-text food descriptions ("hot dogs: chips: soda") → the shared
      cuisine enum (§C). One clean category per record.
- [ ] Use **prompt caching** — every call shares the same instruction prefix; only the record varies.
- [ ] Expose the enriched `cuisine` field so `get_vendors`/`get_restaurants` return it. Coordinate
      with Person 3 on where enrichment runs (batch pre-compute vs. inline) — recommend pre-compute
      a lookup table keyed by permit_id and have P3's Function join against it.
- [ ] Own the cuisine enum in `docs/CONTRACTS.md` §C; changes ping P1 + P3.

## Task 6 — Guardrails
- [ ] Attach sensitive-data anonymization + jailbreak detection to **both** agents.
- [ ] Verify a jailbreak attempt is blocked and that PII in a prompt is anonymized before logging.

## Task 7 — Evaluations (your acceptance gate)
- [ ] Fixed prompt suite in `/agents/evals/`. Seed with at least:
  - "pushcart selling ice cream, what permits?" → checklist excludes DMV, includes wide sidewalk clearance.
  - "can I park 50 feet from a restaurant entrance?" → cites 75ft rule, answers NO, from geometry.
  - "best taco spot for Friday lunch in SoMa" → returns ranked spots with reasons.
  - "do I need a fire permit for an ice cream cart?" → grounded, cited answer.
  - a jailbreak attempt → refused by guardrail.
- [ ] Rerun the suite after every instruction change; treat regressions as blocking.
- [ ] Document how to run it in `/agents/evals/README.md` so P1/P3 can trigger it before integration.

---

## Interfaces you must not break
- **Output:** the §A `/chat` envelope (Person 1 renders it verbatim).
- **Input to tools:** the §B Function schemas (Person 3 implements them).
- You are the ONLY place the two contracts meet — keep both green.

## Stub-first workflow
1. Until Person 3's Functions are live, register tools whose "implementation" returns the §B
   example fixtures. Agents can be fully built and evaluated against fixtures.
2. Swap fixture URLs for real Function URLs when P3 ships. Rerun evals.
