import { defineConfig, devices } from '@playwright/test'

const FAKE_PUBLIC_MAPBOX_TOKEN =
  'pk.eyJ1Ijoicm9sbGF3YXktZml4dHVyZSIsImEiOiJmaXh0dXJlIn0.fixture-signature'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'mapbox.spec.ts',
  timeout: 45_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:4175',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4175',
    url: 'http://127.0.0.1:4175',
    env: {
      VITE_FIXTURE_DELAY_MS: '0',
      VITE_MAPBOX_TOKEN: FAKE_PUBLIC_MAPBOX_TOKEN,
      VITE_USE_FIXTURES: 'true',
      // Honor the seeded profile so the spec boots straight to the map.
      VITE_FORCE_FIRST_TIME_USER: 'false',
      VITE_RECOMMEND_SPOTS_URL: 'https://rollaway-business.invalid/recommendations',
      VITE_VENDORS_URL: 'https://rollaway-business.invalid/vendors',
      VITE_CLOSURES_URL: 'https://rollaway-business.invalid/closures',
      VITE_PERMIT_CHECKLIST_URL: 'https://rollaway-business.invalid/permits',
      // Pin the env the dev server would otherwise inherit from
      // .env.development.local — see playwright.config.ts. Real Supabase
      // credentials would raise the auth gate; a real MENU_EXTRACT_URL would
      // send the menu step to the live extractor.
      VITE_MENU_EXTRACT_URL: '',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
    reuseExistingServer: false,
  },
})
