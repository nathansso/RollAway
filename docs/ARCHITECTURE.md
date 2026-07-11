# Rollaway — Architecture & Data Flow

Everything runs on DigitalOcean, with the **Gradient AI Platform** as the spine. The frontend never calls an external API directly.

## System diagram

```
  ┌──────────────────────────────────────────────────────────┐
  │  FRONTEND  (Person 1)                                      │
  │  Vite + React PWA · Mapbox map · chat UI · detail panels   │
  │  DigitalOcean App Platform (deploy from GitHub)            │
  └───────────────────────────┬──────────────────────────────┘
                              │  POST /chat  (one routed entry point)
                              ▼
  ┌──────────────────────────────────────────────────────────┐
  │  GRADIENT PLATFORM  (Person 2)                             │
  │                                                            │
  │   Agent Routing ──► Spot Scout   (function calling)        │
  │                └──► Permit Copilot (knowledge base + cite) │
  │                                                            │
  │   Guardrails: sensitive-data anonymization + jailbreak     │
  │   Evaluations: fixed prompt suite, rerun on every change   │
  │   Serverless Inference: cuisine classification enrichment  │
  └───────────────┬──────────────────────────┬───────────────┘
                  │ function calling         │ retrieval
                  ▼                          ▼
  ┌──────────────────────────────┐   ┌────────────────────────┐
  │ DO FUNCTIONS (Person 3)      │   │ KNOWLEDGE BASE (P2)     │
  │  get_vendors                 │   │  DPW Order 182,101      │
  │  get_closures                │   │  clearance rules        │
  │  get_foot_traffic            │   │  fee schedules          │
  │  get_restaurants             │   │  vendor-type checklists │
  │  get_events                  │   └────────────────────────┘
  │  + clearance geometry (code) │
  └──────────────┬───────────────┘
                 ▼
   SF Open Data · Bay Wheels · Google Places · SFMTA · Ticketmaster
```

## Request lifecycle (Pillar 1 example)

Vendor asks: *"I sell tacos from a truck, where should I set up Friday lunch near SoMa?"*

1. Frontend `POST /chat` → routed entry point.
2. Router classifies as a **location** question → **Spot Scout**.
3. Spot Scout decides which tools it needs and calls them (function calling):
   `get_vendors(near=SoMa, day=Fri, time=midday)`, `get_closures(...)`,
   `get_foot_traffic(...)`, `get_restaurants(...)`.
4. If a "can I park here?" sub-question arises, the agent calls the **clearance-geometry** check — real code, not LLM math.
5. Agent reasons over the tool results and returns structured answer + prose.
6. Frontend renders spots on the map + a detail panel with the constraint/demand breakdown.

## Design invariants (do not violate)

- **Legality math is code, never the LLM.** Clearance distances run as geometry in a Function.
- **Frontend → Gradient only.** No external API keys in the browser.
- **Every permit answer carries a citation** back to a source doc.
- **Honesty in copy:** foot traffic is a *proxy*; the checker is a *guide*, not legal clearance.

## Data sources (owner: Person 3 unless noted)

| Source | ID / feed | Used by |
|---|---|---|
| SF Mobile Food Facility Permit | `rqzj-sfat` | get_vendors |
| SF Mobile Food Schedule | `jjew-r69b` | get_vendors |
| SF Temporary Street Closures | `8x25-yybr` | get_closures |
| SFMTA event closure list | weekly file | get_closures |
| Bay Wheels (Lyft) | live GBFS + trip CSVs | get_foot_traffic |
| Google Places | Places API | get_restaurants |
| Ticketmaster Discovery | Discovery API | get_events |
| SF Public Works rules, DPW Order 182,101 | PDFs → KB | Permit Copilot (P2) |
