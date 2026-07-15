import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'map-app.spec.ts',
  timeout: 45_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // #14: the map auto-requests the vendor's location on landing. Default to a
    // granted in-SF fix so the flow is deterministic; specific tests override.
    permissions: ['geolocation'],
    geolocation: { latitude: 37.7869, longitude: -122.3982 },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    env: {
      VITE_FIXTURE_DELAY_MS: '1100',
      VITE_MAPBOX_TOKEN: '',
      VITE_USE_FIXTURES: 'true',
      VITE_RECOMMEND_SPOTS_URL: 'https://rollaway-business.invalid/recommendations',
      VITE_VENDORS_URL: 'https://rollaway-business.invalid/vendors',
      VITE_CLOSURES_URL: 'https://rollaway-business.invalid/closures',
      VITE_PERMIT_CHECKLIST_URL: 'https://rollaway-business.invalid/permits',
      // Blank so the uploaded .txt menu parses in-browser. extractMenu ignores
      // VITE_USE_FIXTURES and calls MENU_EXTRACT_URL whenever one is set, so a
      // developer's .env.development.local would otherwise point these specs at
      // the real extractor and the menu step would never resolve.
      VITE_MENU_EXTRACT_URL: '',
      // Non-empty so #14/#17 Street View + Places autocomplete render; the actual
      // Google calls are intercepted by page.route mocks in the specs.
      VITE_GOOGLE_MAPS_BROWSER_KEY: 'test-browser-key',
      // Keep auth OFF: these specs cover the map, not the sign-in gate. The dev
      // server loads .env.development.local, so a developer with real Supabase
      // credentials would otherwise hit the auth wall here instead of the map.
      // Blanking wins because Vite lets process.env override .env files.
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],
})
