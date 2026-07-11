# Rollaway 🌮🚚

### Get your business rolling.

Rollaway is an AI copilot that helps mobile food vendors in San Francisco survive and grow — answering the two questions that decide whether they make it: **where should I set up to find customers**, and **how do I get legal without losing months**.

Built for the DigitalOcean Hackathon on the **Gradient AI Platform**.

---

## The three pillars

1. **Find the best spot** — score a location on hard constraints (closures, claimed spots, clearance rules) + demand signals (foot-traffic proxy, restaurant saturation).
2. **Get permits in order** — a personalized, ordered checklist across all four SF agencies, grounded in city rules with citations.
3. **Work events (growth)** — live event + closure listings so vendors position for crowds.

## Architecture (one-paragraph version)

The frontend never touches an external API directly. Everything routes through **Gradient**. Two Gradient agents sit behind a single routed entry point: **Spot Scout** (location, via Gradient function calling → DigitalOcean Functions) and **Permit Copilot** (permits, grounded in a Gradient knowledge base). Five **DigitalOcean Functions** are the agents' hands. The **legality math never runs inside the LLM** — clearance geometry is real code in a Function. Guardrails + evaluations wrap both agents.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full diagram and data flow.

---

## Team split (3 people, by layer)

| Branch | Owner | Scope | Task doc |
|---|---|---|---|
| `feat/frontend` | **Person 1 — Frontend** | PWA, Mapbox map, chat UI, spot-detail + permit-checklist panels, App Platform deploy | `PERSON1_FRONTEND_TASKS.md` |
| `feat/agents-platform` | **Person 2 — Agents & Platform** | Both Gradient agents, agent routing, knowledge base, guardrails, evaluations, serverless-inference enrichment | `PERSON2_AGENTS_TASKS.md` |
| `feat/functions-data` | **Person 3 — Functions & Data** | The 5 DigitalOcean Functions, all external data integrations, clearance geometry | `PERSON3_FUNCTIONS_TASKS.md` |

**The contract that lets all three work in parallel** lives in [`docs/CONTRACTS.md`](docs/CONTRACTS.md) — the frozen JSON schemas for every Function, the agent request/response shape, and the frontend↔agent API. Agree on that file first; then each person can build against a stub of the others.

### Integration order
1. **Day 1 (all):** Lock `docs/CONTRACTS.md` together. P1 stubs the agent API with canned JSON; P2 stubs Functions with fixtures; P3 builds Functions against the real SF APIs.
2. **Mid:** P3's Functions replace P2's stubs. P2's agents replace P1's canned JSON.
3. **End:** Wire the deployed agent endpoint into the deployed frontend; run P2's evaluation suite as the acceptance gate.

## Repo layout (target)

```
/frontend        # Person 1 — Vite/React PWA + Mapbox
/functions       # Person 3 — DigitalOcean Functions (one dir per tool)
/agents          # Person 2 — agent instructions, KB source docs, eval prompts, routing config
/docs            # shared contracts + architecture (on main)
```
