# Guided SF Map Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a staged San Francisco-only vendor onboarding flow that transitions through session setup and a full-screen branded loader into an interactive Mapbox recommendation map, with explicit permit generation on its own page.

**Architecture:** Add a small phase state machine to the existing Zustand store while preserving profile, recommendation, and permit domains. Keep Mapbox, fixture adaptation, SF geographic rules, sample menus, and full-screen loading in focused modules so each can be tested independently.

**Tech Stack:** React 19, TypeScript, Zustand, Mapbox GL JS, Tailwind CSS, Vitest, Playwright, Vite PWA

## Global Constraints

- Product scope is the City and County of San Francisco only.
- Brand copy is exactly `Rollaway`; the loading slogan is exactly `Get your business rolling`
- Mapbox is enabled whenever `VITE_MAPBOX_TOKEN` exists, including fixture mode.
- Fixture mode may contact Mapbox for tiles but must make zero Rollaway business-API requests.
- Keep all credentials out of tracked files; use only gitignored `frontend/.env.local`.
- Preserve the schematic map when Mapbox or its tiles are unavailable.
- All fixed screens respect safe areas and all controls have at least 44-pixel touch targets.
- Continuous truck, wheel, and dust movement stops under `prefers-reduced-motion`.
- Do not stage or modify `agents/evals/package-lock.json`.
- Do not commit implementation checkpoints unless the user explicitly asks.

---

### Task 1: SF Scope and Sample Menu Dataset

**Files:**
- Create: `frontend/src/fixtures/sampleMenus.ts`
- Create: `frontend/src/lib/sfBounds.ts`
- Create: `frontend/src/lib/sfBounds.test.ts`
- Create: `frontend/src/fixtures/sampleMenus.test.ts`
- Modify: `frontend/src/types/contract.ts`

**Interfaces:**
- Produces: `CuisineId`, `CuisineSample`, `SAMPLE_MENUS`, `sampleMenuText(cuisine: CuisineId): string`
- Produces: `SF_BOUNDS`, `isWithinSanFrancisco(point: LatLng): boolean`
- Extends: `VendorProfile` with `cuisine: CuisineId`

- [ ] **Step 1: Write failing dataset and boundary tests**

```ts
import { describe, expect, it } from 'vitest'
import { SAMPLE_MENUS, sampleMenuText } from './sampleMenus'

describe('sample menus', () => {
  it('provides editable priced items for every cuisine', () => {
    expect(SAMPLE_MENUS.length).toBeGreaterThanOrEqual(6)
    for (const cuisine of SAMPLE_MENUS) {
      expect(cuisine.items.length).toBeGreaterThanOrEqual(3)
      expect(sampleMenuText(cuisine.id)).toMatch(/\$\d/)
    }
  })
})
```

```ts
import { describe, expect, it } from 'vitest'
import { isWithinSanFrancisco } from './sfBounds'

describe('San Francisco bounds', () => {
  it('accepts SoMa and rejects Oakland and San Jose', () => {
    expect(isWithinSanFrancisco({ lat: 37.7793, lng: -122.4013 })).toBe(true)
    expect(isWithinSanFrancisco({ lat: 37.8044, lng: -122.2712 })).toBe(false)
    expect(isWithinSanFrancisco({ lat: 37.3382, lng: -121.8863 })).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd frontend && npm test -- src/fixtures/sampleMenus.test.ts src/lib/sfBounds.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement typed sample data and bounds**

Create cuisine IDs for `mexican`, `filipino`, `chinese`, `indian`, `mediterranean`, `american`, and `coffee_dessert`. Each fixture contains a user-facing label and 3–5 realistic menu lines with prices. Implement:

```ts
export const SAMPLE_MENUS = [
  {
    id: 'mexican',
    label: 'Mexican',
    items: ['Al pastor taco $5', 'Veggie burrito $11', 'Horchata $4'],
  },
  // Define all remaining cuisines with the same exact shape.
] as const

export type CuisineId = (typeof SAMPLE_MENUS)[number]['id']

export function sampleMenuText(cuisine: CuisineId): string {
  return SAMPLE_MENUS.find((sample) => sample.id === cuisine)?.items.join('\n') ?? ''
}
```

Use an SF bounding box that includes the city but excludes neighboring jurisdictions:

```ts
export const SF_BOUNDS = {
  southwest: { lat: 37.7034, lng: -122.527 },
  northeast: { lat: 37.833, lng: -122.3482 },
} as const

export function isWithinSanFrancisco(point: LatLng): boolean {
  return (
    point.lat >= SF_BOUNDS.southwest.lat &&
    point.lat <= SF_BOUNDS.northeast.lat &&
    point.lng >= SF_BOUNDS.southwest.lng &&
    point.lng <= SF_BOUNDS.northeast.lng
  )
}
```

Add `cuisine: CuisineId` to `VendorProfile`. In `parseStoredProfile`, migrate valid v1 profiles without cuisine to `american`, then validate the resulting schema.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `cd frontend && npm test -- src/fixtures/sampleMenus.test.ts src/lib/sfBounds.test.ts src/lib/profile.test.ts`

Expected: PASS.

---

### Task 2: Guided App Phase State Machine

**Files:**
- Create: `frontend/src/store.test.ts`
- Modify: `frontend/src/store.ts`
- Modify: `frontend/src/types/contract.ts`

**Interfaces:**
- Produces: `AppPhase = 'profile' | 'session' | 'loading_recommendations' | 'ready' | 'loading_permits'`
- Produces store actions: `continueToSession()`, `startRecommendations()`, `startPermitChecklist()`
- Extends location status with `outside_sf`

- [ ] **Step 1: Write failing phase transition tests**

Mock `apiClient` and local storage, then assert:

```ts
expect(useAppStore.getState().appPhase).toBe('profile')
useAppStore.getState().saveProfile(validProfile)
expect(useAppStore.getState().appPhase).toBe('session')

await useAppStore.getState().startRecommendations()
expect(useAppStore.getState().appPhase).toBe('ready')

useAppStore.getState().setActiveTab('permits')
await useAppStore.getState().startPermitChecklist()
expect(useAppStore.getState().appPhase).toBe('ready')
expect(useAppStore.getState().permitStatus).toBe('success')
```

Also test that a stored valid profile initializes at `session`, profile editing from `ready` returns to `ready`, and stale requests cannot advance the phase.

- [ ] **Step 2: Run the store test and verify RED**

Run: `cd frontend && npm test -- src/store.test.ts`

Expected: FAIL because phase actions do not exist.

- [ ] **Step 3: Implement the state machine**

Initialize phase from persisted profile:

```ts
const initialPhase: AppPhase = initialProfile ? 'session' : 'profile'
```

`saveProfile` records whether this is first launch. A first profile advances to `session`; edits retain the prior phase. `startRecommendations`:

1. validates profile and session,
2. sets `loading_recommendations`,
3. awaits `apiClient.recommendSpots`,
4. ignores stale request IDs,
5. sets recommendations and `ready`,
6. returns to `session` with a visible error on failure.

`startPermitChecklist` similarly sets `loading_permits`, loads once on explicit action, and returns to `ready` on success or failure.

For geolocation, map outside-SF coordinates to:

```ts
{
  locationStatus: 'outside_sf',
  location: SOMA_FALLBACK,
  locationNotice: 'Your location is outside San Francisco. Using the SoMa demo origin.'
}
```

- [ ] **Step 4: Run phase tests and verify GREEN**

Run: `cd frontend && npm test -- src/store.test.ts`

Expected: PASS.

---

### Task 3: Full-Page Profile and Session Screens

**Files:**
- Create: `frontend/src/components/onboarding/SessionSetup.tsx`
- Modify: `frontend/src/components/onboarding/ProfileEditor.tsx`
- Modify: `frontend/src/components/shell/AppHeader.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/e2e/map-app.spec.ts`

**Interfaces:**
- Consumes: `SAMPLE_MENUS`, phase actions, `requestLocation`, `SessionWhen`
- Produces: first-launch profile screen and dedicated per-session setup screen

- [ ] **Step 1: Update E2E expectations for staged navigation**

Add assertions that clean launch shows only `Tell us about your business`, profile completion reveals `When are you setting up?`, location is requested only after a button press, and the map is absent until `Find places to roll` completes.

- [ ] **Step 2: Run E2E and verify RED**

Run: `cd frontend && npm run test:e2e -- --grep "guided setup"`

Expected: FAIL because the map shell is currently rendered behind onboarding.

- [ ] **Step 3: Convert onboarding to a full page**

Use `role="main"` for first launch rather than modal semantics. Keep dialog behavior only when editing an existing profile from the ready shell. Add a cuisine `<select>` before Menu and a secondary `Use sample menu` button:

```tsx
<select
  value={draft.cuisine}
  onChange={(event) =>
    setDraft((current) => ({ ...current, cuisine: event.target.value as CuisineId }))
  }
>
  {SAMPLE_MENUS.map((sample) => (
    <option key={sample.id} value={sample.id}>{sample.label}</option>
  ))}
</select>
<button
  type="button"
  className="secondary-button"
  onClick={() =>
    setDraft((current) => ({
      ...current,
      menu: { ...current.menu, raw: sampleMenuText(current.cuisine) },
    }))
  }
>
  Use sample menu
</button>
```

Change first-launch CTA to `Continue to session setup`.

- [ ] **Step 4: Build `SessionSetup`**

Render presets, valid custom date/time inputs, explicit `Use my live location`, SF-only explanation, current location/fallback status, Back/Edit Profile, and one primary `Find places to roll` action wired to `startRecommendations`.

- [ ] **Step 5: Route phases in `App` and simplify branding**

`profile` renders only `ProfileEditor`; `session` renders only `SessionSetup`; loading phases render only the loader; `ready` renders Map/Permits navigation. Remove `Find your next block.` from `AppHeader` so the badge contains exactly `Rollaway`.

- [ ] **Step 6: Run E2E and verify GREEN**

Run: `cd frontend && npm run test:e2e -- --grep "guided setup"`

Expected: PASS.

---

### Task 4: Full-Screen Orange Loading Experience

**Files:**
- Create: `frontend/src/components/common/FullScreenLoader.tsx`
- Modify: `frontend/src/components/common/TruckLoader.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/e2e/map-app.spec.ts`

**Interfaces:**
- Produces: `FullScreenLoader({ operation }: { operation: 'recommendations' | 'permits' })`

- [ ] **Step 1: Add failing browser assertions**

Assert the loading element covers the viewport, has the orange background, centers the truck, and displays exact slogan `Get your business rolling.` for both recommendation and permit generation.

- [ ] **Step 2: Run E2E and verify RED**

Run: `cd frontend && npm run test:e2e -- --grep "full-screen loader"`

Expected: FAIL because loaders are currently inline cards.

- [ ] **Step 3: Implement the loader**

Render:

```tsx
<main
  className="full-screen-loader"
  role="status"
  aria-live="polite"
  aria-labelledby="loading-title"
>
  <TruckLoader label="" presentation="hero" />
  <h1 id="loading-title">Get your business rolling.</h1>
  <p>
    {operation === 'recommendations'
      ? 'Ranking San Francisco setup spots…'
      : 'Building your San Francisco permit path…'}
  </p>
</main>
```

Style `.full-screen-loader` with `position: fixed`, `inset: 0`, `min-height: 100dvh`, safe-area padding, `background: var(--color-secondary)`, high-contrast foreground, and centered content. Keep all truck motion transform-based. Under reduced motion, disable body, wheel, and dust animation.

- [ ] **Step 4: Run E2E and reduced-motion checks**

Run: `cd frontend && npm run test:e2e -- --grep "full-screen loader"`

Expected: PASS.

---

### Task 5: Interactive Mapbox Results and Travel Estimates

**Files:**
- Modify: `frontend/src/components/map/MapView.tsx`
- Modify: `frontend/src/components/map/RecommendationTray.tsx`
- Modify: `frontend/src/lib/apiClient.ts`
- Modify: `frontend/src/lib/apiClient.test.ts`
- Modify: `frontend/src/types/contract.ts`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Adds `travel_distance_miles: number` to `RecommendationSpot`
- Produces `estimateTravel(point: LatLng, origin: LatLng): { minutes: number; miles: number }`

- [ ] **Step 1: Write failing travel-estimate tests**

```ts
const response = await apiClient.recommendSpots(request, { delayMs: 0 })
expect(response.recommendations[0].travel_minutes).toBeGreaterThanOrEqual(3)
expect(response.recommendations[0].travel_distance_miles).toBeGreaterThanOrEqual(0)
```

Validate that malformed negative or non-finite distance values are rejected.

- [ ] **Step 2: Run API tests and verify RED**

Run: `cd frontend && npm test -- src/lib/apiClient.test.ts`

Expected: FAIL because distance is absent.

- [ ] **Step 3: Enable Mapbox independently of fixture mode**

Replace:

```ts
const MAP_ENABLED = !apiClient.useFixtures && Boolean(MAPBOX_TOKEN)
```

with:

```ts
const MAP_ENABLED = Boolean(MAPBOX_TOKEN)
```

Set Mapbox `maxBounds` from `SF_BOUNDS`, preserve navigation controls, and call `fitBounds` when recommendation coordinates change. Include origin in the fitted bounds only when it is within SF.

- [ ] **Step 4: Add stable distance estimates**

Calculate straight-line miles with haversine distance and derive conservative city travel minutes. Populate both normalized fixture and legacy/native adapters. Show:

```tsx
<span>{spot.travel_minutes} min</span>
<span>{spot.travel_distance_miles.toFixed(1)} mi</span>
```

Do not label this as turn-by-turn routing; details should say `Estimated city travel`.

- [ ] **Step 5: Improve map interaction**

Ranked markers and vendor markers must remain clickable, map cards select corresponding markers, selection pans to the point, and the geolocation/recenter control returns to the current origin. Keep closure geometry date-filtered and maintain the data-driven fallback.

- [ ] **Step 6: Run tests and build**

Run: `cd frontend && npm test -- src/lib/apiClient.test.ts && npm run build`

Expected: PASS.

---

### Task 6: Explicit Permit Generation Page

**Files:**
- Modify: `frontend/src/components/permits/PermitChecklist.tsx`
- Modify: `frontend/src/store.ts`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/e2e/map-app.spec.ts`

**Interfaces:**
- Consumes: `startPermitChecklist`
- Produces: idle permit landing state with `Build my permit checklist`

- [ ] **Step 1: Add failing permit flow E2E**

Navigate to Permits, assert no automatic request occurs, click `Build my permit checklist`, assert the full-screen orange loader, then assert the personalized checklist and deadlines.

- [ ] **Step 2: Run test and verify RED**

Run: `cd frontend && npm run test:e2e -- --grep "permit generation"`

Expected: FAIL because checklist loading currently starts in an effect.

- [ ] **Step 3: Replace automatic loading with the explicit CTA**

Remove the `useEffect` that invokes `load()`. For idle state, render an SF-specific explanation, permit icon, and:

```tsx
<button
  type="button"
  className="primary-button"
  onClick={() => void startPermitChecklist()}
>
  Build my permit checklist
</button>
```

Use the app-level `loading_permits` phase while loading. On error, restore the permit page with the same CTA labeled `Try building again`.

- [ ] **Step 4: Run permit flow E2E and verify GREEN**

Run: `cd frontend && npm run test:e2e -- --grep "permit generation"`

Expected: PASS.

---

### Task 7: Local Mapbox Configuration, Documentation, and Full Verification

**Files:**
- Modify: `frontend/.env.example`
- Modify: `frontend/README.md`
- Modify: `frontend/DEPLOY.md`
- Modify: `frontend/e2e/map-app.spec.ts`
- Modify: `frontend/e2e/pwa.spec.ts`
- Local only, never stage: `frontend/.env.local`

**Interfaces:**
- Documents Mapbox network behavior and SF-only product scope.

- [ ] **Step 1: Configure local Mapbox without tracking credentials**

Create `frontend/.env.local` containing only:

```dotenv
VITE_MAPBOX_TOKEN=<public Mapbox token supplied by the project owner>
```

Verify `git check-ignore frontend/.env.local` succeeds. Do not place any other supplied credentials in frontend files.

- [ ] **Step 2: Update environment and deployment docs**

Document that fixture mode disables Rollaway APIs but allows Mapbox tile requests when a token exists. Document SF-only bounds, first-launch/profile/session phases, the explicit permit generation action, and the token URL-restriction recommendation.

- [ ] **Step 3: Update network tests**

Classify Mapbox hosts separately from Rollaway business endpoints. Assert zero requests to configured Rollaway endpoints in fixture mode while allowing Mapbox styles, tiles, fonts, sprites, and telemetry. Keep a no-token test that verifies the fallback.

- [ ] **Step 4: Run complete verification**

Run:

```bash
cd frontend
npm ci
npm run lint
npm run build
npm test
npm run test:e2e
npm run test:pwa
```

Expected:

- lint exits without warnings;
- TypeScript and Vite production build pass;
- all unit tests pass;
- guided profile → session → loader → Mapbox flow passes;
- explicit permit loader/checklist flow passes;
- production PWA reloads offline into a useful fallback.

- [ ] **Step 5: Review repository state**

Run: `git status --short`

Expected: only intended frontend/docs changes plus the pre-existing unrelated `agents/evals/package-lock.json`; `frontend/.env.local` must not appear.
