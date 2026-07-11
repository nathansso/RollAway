# Rollaway — Permit Path Page: Tech Stack

A comprehensive map of every part of the serverless permit path page and what it's built on,
grounded in the actual code.

## 1. Hosting / delivery model

- The page ships as a **static PWA** — a Vite build (`tsc -b && vite build`) producing static
  JS/CSS/HTML, installable and offline-capable via **`vite-plugin-pwa` + Workbox**
  (`registerType: autoUpdate`, precache glob, `navigateFallback: index.html`, web-app manifest). No
  app server for the frontend itself ("serverless" hosting on any static/CDN host).
- Its **dynamic behavior** calls serverless endpoints: the **agents runtime** on **DigitalOcean
  Gradient serverless inference** (`/permit_copilot`, `/form_fill`, `/form_pdf`).

## 2. Foundation (whole app, incl. this page)

| Concern | Tech |
|---|---|
| Language | **TypeScript ~6.0** (strict), ES modules |
| UI framework | **React 19.2** (function components + hooks) |
| Build/dev | **Vite 8** + `@vitejs/plugin-react`; `tsc -b` typecheck; manual chunking (mapbox split out) |
| Styling | **Tailwind CSS v4** via `@tailwindcss/vite` (utility classes + theme tokens: `primary`, `caution`, `good`, `muted`, `border`, `foreground`) |
| State | **Zustand 5** — single `useAppStore`; persisted slices in **localStorage** |
| Lint/format | **oxlint**, **Prettier** |
| Tests | **Vitest 4** + **jsdom** + Testing Library; **Playwright** for e2e/PWA |

## 3. The page, part by part

### a. Shell & navigation
- `App.tsx` — phase routing (`appPhase`: profile → session → ready), renders `PermitChecklist` when
  the Permits tab is active.
- `components/shell/BottomNav.tsx` — Map/Permits tab bar (Zustand `activeTab`).
- `components/common/Icons.tsx` — inline SVG icons; `OfflineGate`, `AppHeader`.

### b. Checklist data + state
- `store.ts` (Zustand) — `startPermitChecklist()` fetches the checklist, then attaches pre-filled
  forms.
- `lib/apiClient.ts` — **fixtures mode** (`fixtures/permit_checklist.json`) or **live** POST to
  `VITE_PERMIT_CHECKLIST_URL` (the runtime's `/permit_copilot`). Fixture/live toggle via
  `VITE_USE_FIXTURES`.
- `types/contract.ts` — the frozen `§A/§D` shapes: `PermitChecklist`, `PermitChecklistItem`,
  `FilledForm`, `FilledFormField`.
- `lib/formCatalog.ts` — mirrors `kb/FORMS.md` + `kb/FORM_FIELDS.md`; `attachFilledForms()` pre-fills
  every included form from the vendor profile (deduped per form).
- `lib/storage.ts`, `lib/profile.ts` — localStorage for profile, permit progress, and per-form
  workflow state.

### c. Checklist UI
- `components/permits/PermitChecklist.tsx` — agency sections, steps, deadline chips (30/90/15-day
  clocks), progress bar, complete toggle, source citations, guide-not-legal disclaimer.
- `EasyApplyModal.tsx` + `easyApply.ts` + `useDialogFocus.ts` — the "review & submit" simulated
  packet (focus-trapped dialog).

### d. Per-form fill workflow
- `components/permits/FilledFormWorkflow.tsx` — the status machine
  (**in progress → ready → awaiting submission → submitted**), typed inputs for remaining fields
  (by `type`: text/email/tel/date/number/select/textarea), required-vs-optional gating,
  "Have you submitted this?" prompt, **renewal countdown**, disclaimer.
- `permitForms.ts` — pure, unit-tested logic: status machine, `allFieldsComplete` (required-only),
  `daysUntilRenewal`, export-rows/HTML builder; state persisted per-form in Zustand/localStorage.

### e. The auto-filled official PDF (headline feature)

| Step | Tech |
|---|---|
| Fetch the real agency PDF (agency hosts have **no CORS**) | Runtime **`GET /form_pdf?source=`** proxy — zero-dep Node `fetch`, allowlist-checked |
| Fill the AcroForm from the profile, **keep fields editable** (no flatten) | **`pdf-lib` 1.17** (`lib/pdfFill.ts`) — `setText` + `updateFieldAppearances()` |
| Map profile → real PDF field names | `lib/pdfFieldMaps.ts` (enumerated from the actual PDFs) |
| Render inline on the page (no iframe → **no auto-download**) | **`pdfjs-dist` 6.1** (`FilledPdfView.tsx`) rasterizes each page to `<canvas>`; worker wired via Vite `?url` |
| Download | click-only `<a download>` from a `Blob` URL |

### f. Doc-ingestion schema (what a form needs)
- Runtime **`POST /form_fill`** — grounded fillable schema (`fields` + `type`/`required`,
  `required_open`/`optional_open`) from `kb/FORMS.md` + `kb/FORM_FIELDS.md`, with an optional
  natural-language summary from Gradient inference (deterministic fallback with no key).

## 4. Serverless backend (the "serverless" in serverless permit path)

- `agents/runtime/server.mjs` — **Node built-in `http` server, zero dependencies**; routes
  `/permit_copilot`, `/form_fill`, `/form_pdf`, plus `/spot_scout`, `/menu_overlap`, `/chat`.
- `agents/runtime/gradient.mjs` — thin client for **DigitalOcean Gradient serverless inference**
  (OpenAI-compatible `/chat/completions`, default model **`anthropic-claude-haiku-4.5`**,
  abort/timeout, degrades to deterministic templates without a key). This is the "build-your-own
  runtime on serverless inference" path (managed Gradient Agents are the production target, currently
  gated per `RUNBOOK §0b`).
- `agents/runtime/forms.mjs` — form parsing, grounded assembly, HTTPS **domain allowlist**
  (`sfpublicworks.org`, `sf.gov`, `sf-fire.org`, …).
- `agents/kb/` — authored knowledge base: `FORMS.md` (verified PDF URLs), `FORM_FIELDS.md` (field
  catalog with type/required), vendor-type checklists, `SOURCES.md`.
- `docs/CONTRACTS.md` — the frozen `§A` envelope + `§D` `filled_form` contract both sides share.

> Adjacent but not the permit page: `functions/` is the map-side data layer — **DigitalOcean
> Functions**, `nodejs:18`, `web: true`, deployed via `doctl serverless deploy`, e.g. `get_vendors`,
> `get_restaurants`. The permit path relies on the agents runtime, not these.

## 5. External services touched by the page

- **DigitalOcean Gradient** — serverless LLM inference for the grounded summaries.
- **SF agency PDF hosts** (`sfpublicworks.org`, `sf.gov`, `sf-fire.org`) — fetched live through the
  allowlisted proxy.
- (Mapbox GL is used by the map tab, not the permit page.)

## 6. Tests guarding this page

- **Vitest units:** `permitForms.test.ts`, `pdfFill.test.ts`, `formCatalog.test.ts`, `store.test.ts`,
  `apiClient.test.ts`.
- **Agents eval gate:** `node agents/evals/run.mjs --offline` (validates the `§A/§D` contract, form
  schemas, and grounding).

---

**In one line:** a **React 19 + TypeScript + Vite + Tailwind v4 PWA** with **Zustand** state, where
the permit page pulls a grounded checklist from a **zero-dependency Node runtime on DigitalOcean
Gradient serverless inference** (`/permit_copilot`, `/form_fill`), proxies the real agency PDF
through **`/form_pdf`**, fills it editable with **`pdf-lib`**, and renders it inline with
**`pdfjs-dist`** canvas — no flattening, no auto-download.
