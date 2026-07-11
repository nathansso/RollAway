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
      VITE_RECOMMEND_SPOTS_URL: 'https://rollaway-business.invalid/recommendations',
      VITE_VENDORS_URL: 'https://rollaway-business.invalid/vendors',
      VITE_CLOSURES_URL: 'https://rollaway-business.invalid/closures',
      VITE_PERMIT_CHECKLIST_URL: 'https://rollaway-business.invalid/permits',
    },
    reuseExistingServer: false,
  },
})
