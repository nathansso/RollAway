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
