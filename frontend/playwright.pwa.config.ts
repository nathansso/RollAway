import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'pwa.spec.ts',
  timeout: 45_000,
  reporter: [['list']],
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:4174',
    serviceWorkers: 'allow',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    env: {
      VITE_FIXTURE_DELAY_MS: '0',
      VITE_MAPBOX_TOKEN: '',
      VITE_USE_FIXTURES: 'true',
      VITE_RECOMMEND_SPOTS_URL: 'https://rollaway-business.invalid/recommendations',
      VITE_VENDORS_URL: 'https://rollaway-business.invalid/vendors',
      VITE_CLOSURES_URL: 'https://rollaway-business.invalid/closures',
      VITE_PERMIT_CHECKLIST_URL: 'https://rollaway-business.invalid/permits',
    },
    reuseExistingServer: false,
  },
})
