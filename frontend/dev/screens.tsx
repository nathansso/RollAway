/**
 * Dev-only screen harness. NOT part of the production build (nothing in src/
 * imports this). It seeds the Zustand store with fixture data and forces the
 * app into a specific phase so each "page" of the SPA can be reviewed at its
 * own URL:  /dev/screens.html?screen=<id>
 *
 * Visiting /dev/screens.html with no ?screen renders a gallery of every screen.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import App from '../src/App'
import { useAppStore } from '../src/store'
import recommendFixture from '../src/fixtures/recommend_spots.json'
import permitFixture from '../src/fixtures/permit_checklist.json'
import type {
  PermitChecklist,
  RecommendSpotsResponse,
  VendorProfile,
} from '../src/types/contract'

const recommendations = (recommendFixture as unknown as RecommendSpotsResponse)
  .recommendations
const permitChecklist = permitFixture as unknown as PermitChecklist

const sampleProfile: VendorProfile = {
  schema_version: 1,
  vendor_type: 'truck',
  cuisine: 'mexican',
  menu: {
    raw: 'Al pastor taco $5\nVeggie burrito $11\nHorchata $4',
    items: [
      { name: 'Al pastor taco', price: 5 },
      { name: 'Veggie burrito', price: 11 },
      { name: 'Horchata', price: 4 },
    ],
    price_tier: '$',
  },
  home_base: { label: 'Mission District', point: null },
  max_travel: { value: 25, unit: 'minutes' },
  operating_windows: [{ day: 'fri', time_from: '11:00', time_to: '14:00' }],
  permit_status: 'researching',
  autofill_profile: {
    owner_name: 'Alex Vendor',
    business_name: 'Rolling Tacos SF',
    email: 'alex@rollingtacos.example',
    phone: '(415) 555-0142',
    address: '123 Valencia St',
    city: 'San Francisco',
    state: 'CA',
    postal_code: '94103',
  },
}

type ScreenId =
  | 'profile'
  | 'session'
  | 'loading-recs'
  | 'map'
  | 'spot'
  | 'permits-landing'
  | 'permits'
  | 'loading-permits'

interface ScreenDef {
  id: ScreenId
  label: string
  desc: string
  seed: () => void
}

const set = useAppStore.setState

const SCREENS: ScreenDef[] = [
  {
    id: 'profile',
    label: 'Onboarding · Profile',
    desc: 'First-run full-page vendor profile form (blank).',
    seed: () =>
      set({ appPhase: 'profile', profile: null, profileEditorOpen: true }),
  },
  {
    id: 'session',
    label: 'Session setup',
    desc: 'Choose the when/where before finding spots.',
    seed: () =>
      set({
        appPhase: 'session',
        profile: sampleProfile,
        profileEditorOpen: false,
        recommendationStatus: 'idle',
        recommendationError: null,
      }),
  },
  {
    id: 'loading-recs',
    label: 'Loading · Recommendations',
    desc: 'Truck loader shown while spots are ranked.',
    seed: () =>
      set({
        appPhase: 'loading_recommendations',
        profile: sampleProfile,
        activeTab: 'map',
        recommendationStatus: 'loading',
      }),
  },
  {
    id: 'map',
    label: 'Map · Recommendations',
    desc: 'Ranked spots on the map with the recommendation tray.',
    seed: () =>
      set({
        appPhase: 'ready',
        profile: sampleProfile,
        activeTab: 'map',
        recommendations,
        recommendationStatus: 'success',
        selectedSpotId: null,
      }),
  },
  {
    id: 'spot',
    label: 'Spot detail · Good to know',
    desc: 'Spot sheet with event opportunity + outreach draft.',
    seed: () =>
      set({
        appPhase: 'ready',
        profile: sampleProfile,
        activeTab: 'map',
        recommendations,
        recommendationStatus: 'success',
        selectedSpotId: recommendations[0]?.id ?? null,
      }),
  },
  {
    id: 'permits-landing',
    label: 'Permits · Landing',
    desc: 'Empty state before the checklist is built.',
    seed: () =>
      set({
        appPhase: 'ready',
        profile: sampleProfile,
        activeTab: 'permits',
        permitStatus: 'idle',
        permitChecklist: null,
      }),
  },
  {
    id: 'permits',
    label: 'Permits · Checklist',
    desc: 'Full four-agency permit path with progress.',
    seed: () =>
      set({
        appPhase: 'ready',
        profile: sampleProfile,
        activeTab: 'permits',
        permitStatus: 'success',
        permitChecklist,
        completedPermitItems: ['pw-location-application'],
      }),
  },
  {
    id: 'loading-permits',
    label: 'Loading · Permits',
    desc: 'Truck loader shown while the permit path is built.',
    seed: () =>
      set({
        appPhase: 'loading_permits',
        profile: sampleProfile,
        activeTab: 'permits',
        permitStatus: 'loading',
      }),
  },
]

const params = new URLSearchParams(window.location.search)
const requested = params.get('screen') as ScreenId | null
const active = SCREENS.find((screen) => screen.id === requested) ?? null

function Switcher({ activeId }: { activeId: ScreenId }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        zIndex: 2147483647,
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <details>
        <summary
          style={{
            listStyle: 'none',
            cursor: 'pointer',
            userSelect: 'none',
            background: '#0f172a',
            color: 'white',
            borderRadius: 9999,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 700,
            boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
            opacity: 0.85,
          }}
        >
          🖥 Screens ▾
        </summary>
        <nav
          style={{
            marginTop: 6,
            background: 'white',
            color: '#0f172a',
            borderRadius: 12,
            padding: 6,
            width: 220,
            boxShadow: '0 12px 30px rgba(0,0,0,0.28)',
            border: '1px solid #e2e8f0',
          }}
        >
          {SCREENS.map((screen) => (
            <a
              key={screen.id}
              href={`?screen=${screen.id}`}
              style={{
                display: 'block',
                padding: '7px 10px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: screen.id === activeId ? 700 : 500,
                textDecoration: 'none',
                color: screen.id === activeId ? '#c2410c' : '#0f172a',
                background: screen.id === activeId ? '#fff7ed' : 'transparent',
              }}
            >
              {screen.label}
            </a>
          ))}
          <a
            href="screens.html"
            style={{
              display: 'block',
              marginTop: 4,
              padding: '7px 10px',
              borderTop: '1px solid #e2e8f0',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              color: '#64748b',
            }}
          >
            ← All screens (gallery)
          </a>
        </nav>
      </details>
    </div>
  )
}

function Gallery() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        background: '#0f172a',
        color: 'white',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        padding: '40px 24px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <p
          style={{
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            fontSize: 12,
            fontWeight: 700,
            color: '#fb923c',
          }}
        >
          Rollaway · dev screen harness
        </p>
        <h1 style={{ fontSize: 30, margin: '6px 0 4px', fontWeight: 800 }}>
          Review every page
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 15, marginBottom: 28 }}>
          Fixture-seeded. Each card opens one screen at its own URL. Use the
          floating “🖥 Screens” menu (top-right) to jump between them.
        </p>
        <div
          style={{
            display: 'grid',
            gap: 14,
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          }}
        >
          {SCREENS.map((screen) => (
            <a
              key={screen.id}
              href={`?screen=${screen.id}`}
              style={{
                display: 'block',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 14,
                padding: 16,
                textDecoration: 'none',
                color: 'white',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700 }}>{screen.label}</div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
                {screen.desc}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#fb923c',
                  marginTop: 10,
                  fontWeight: 600,
                }}
              >
                ?screen={screen.id} →
              </div>
            </a>
          ))}
        </div>
        <p style={{ color: '#64748b', fontSize: 12, marginTop: 28 }}>
          Tip: on the Permits · Checklist screen, click “Review &amp; submit” on
          any step to see the EasyApply modal.
        </p>
      </div>
    </main>
  )
}

const rootEl = document.getElementById('root')!

if (active) {
  active.seed()
  createRoot(rootEl).render(
    <StrictMode>
      <Switcher activeId={active.id} />
      <App />
    </StrictMode>,
  )
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <Gallery />
    </StrictMode>,
  )
}
