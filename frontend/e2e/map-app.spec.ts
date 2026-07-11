import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const isMapboxUrl = (rawUrl: string) => {
  const hostname = new URL(rawUrl).hostname
  return (
    hostname === 'mapbox.com' ||
    hostname.endsWith('.mapbox.com') ||
    hostname === 'mapbox.cn' ||
    hostname.endsWith('.mapbox.cn')
  )
}

const isLocalBrowserUrl = (url: URL) =>
  url.protocol === 'blob:' ||
  url.protocol === 'data:' ||
  url.hostname === '127.0.0.1' ||
  url.hostname === 'localhost'

// #14/#17 call Google (Places, Street View) from the browser; these are not the
// business API and are mocked in e2e so the flow is deterministic and offline.
const isGoogleUrl = (rawUrl: string) => {
  try {
    return new URL(rawUrl).hostname.endsWith('googleapis.com')
  } catch {
    return false
  }
}

function trackFixtureNetwork(page: Page) {
  const mapboxRequests: string[] = []
  const rollAwayBusinessRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (isLocalBrowserUrl(url)) return
    if (isMapboxUrl(request.url())) mapboxRequests.push(request.url())
    else if (isGoogleUrl(request.url())) {
      // Google Places/Street View — not the business API. Ignore.
    } else rollAwayBusinessRequests.push(request.url())
  })
  return { mapboxRequests, rollAwayBusinessRequests }
}

const STORED_PROFILE = {
  schema_version: 1,
  vendor_type: 'truck',
  cuisine: 'mexican',
  menu: { raw: 'Tacos $5', items: [{ name: 'Tacos', price: 5 }], price_tier: '$' },
  home_base: { label: 'SoMa', point: null },
  max_travel: { value: 15, unit: 'minutes' },
  operating_windows: [{ day: 'fri', time_from: '11:00', time_to: '14:00' }],
  permit_status: 'researching',
  autofill_profile: {
    owner_name: 'Avery Rivera',
    business_name: 'Mission Tacos',
    email: 'avery@example.com',
    phone: '415-555-0123',
    address: '123 Mission St',
    city: 'San Francisco',
    state: 'CA',
    postal_code: '94103',
  },
}

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function mockStreetView(page: Page) {
  await page.route('**/maps.googleapis.com/maps/api/streetview*', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG }),
  )
}

async function mockPlaces(page: Page) {
  await page.route('**/places.googleapis.com/v1/places:autocomplete', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        suggestions: [
          {
            placePrediction: {
              placeId: 'PLACE_FERRY',
              structuredFormat: {
                mainText: { text: 'Ferry Building' },
                secondaryText: { text: '1 Ferry Building, San Francisco, CA' },
              },
              text: { text: 'Ferry Building, San Francisco, CA' },
            },
          },
        ],
      }),
    }),
  )
  await page.route('**/places.googleapis.com/v1/places/PLACE_FERRY', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        location: { latitude: 37.7955, longitude: -122.3937 },
        formattedAddress: '1 Ferry Building, San Francisco, CA 94111, USA',
      }),
    }),
  )
}

async function completeProfile(page: Page) {
  await expect(
    page.getByRole('heading', { name: 'Tell us about your business' }),
  ).toBeVisible()
  await page.getByLabel('Cuisine').selectOption('mexican')
  await page.getByRole('button', { name: 'Use sample menu' }).click()
  await page.getByLabel('Home base or neighborhood').fill('Mission District')
  await page.getByLabel('Owner / contact name').fill('Avery Rivera')
  await page.getByLabel('Business name').fill('Mission Tacos')
  await page.getByLabel('Email').fill('avery@example.com')
  await page.getByLabel('Phone').fill('415-555-0123')
  await page.getByLabel('Mailing address').fill('123 Mission St')
  await page.getByLabel('ZIP').fill('94103')
  await page.getByRole('button', { name: 'Find my spots' }).click()
  // #14: no session page — the profile heading is replaced by the map flow.
  await expect(
    page.getByRole('heading', { name: 'When are you setting up?' }),
  ).toHaveCount(0)
}

async function awaitRecommendations(page: Page) {
  await expect(page.getByText('2nd & Howard', { exact: true })).toBeVisible({
    timeout: 25_000,
  })
}

async function expectFullScreenLoader(page: Page, status: string) {
  const loader = page.getByRole('status', { name: 'Get your business rolling' })
  await expect(loader).toBeVisible()
  await expect(loader.getByText(status, { exact: true })).toBeVisible()
}

test('first launch: profile -> loading -> map -> spot details -> permits -> EasyApply', async ({
  page,
}) => {
  await mockStreetView(page)
  await page.goto('/app')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await completeProfile(page)
  await awaitRecommendations(page)
  // #14: origin defaults to the granted in-SF location.
  await expect(page.getByText('Live location', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Recommendation setup' })).toBeVisible()

  // #17: spot details show the Street View image + address.
  await page
    .getByRole('button', { name: /Open details for suggested spot, 2nd & Howard/ })
    .click()
  const panel = page.getByRole('dialog', { name: /2nd & Howard/ })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('img', { name: 'Street View near 2nd & Howard' })).toBeVisible()
  await expect(panel.getByText('2nd St & Howard St, San Francisco, CA 94105')).toBeVisible()
  await expect(panel.getByText('Estimated foot traffic')).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Navigate to suggested parking' }),
  ).toHaveAttribute('href', /origin=.*destination=/)
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()

  // Permits + EasyApply.
  await page.getByRole('button', { name: 'Permits' }).click()
  await page.getByRole('button', { name: 'Build my permit checklist' }).click()
  await expect(page.getByRole('heading', { name: 'Your permit path' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Public Works' })).toBeVisible()

  await page
    .getByRole('button', { name: /Review & submit simulated draft for Prepare/ })
    .click()
  await expect(
    page.getByRole('dialog', { name: /Prepare the MFF location application/ }),
  ).toBeVisible()
  await page.getByLabel(/Proposed start date/).fill('2026-08-01')
  await page.getByLabel(/Applicant signature/).fill('Avery Rivera')
  await page.getByRole('checkbox').last().check()
  await page.getByRole('button', { name: 'Prepare simulated packet' }).click()
  await expect(page.getByRole('heading', { name: 'Simulated packet ready' })).toBeVisible()
})

test('full-screen loader covers the auto-fired recommendation and permit operations', async ({
  page,
}) => {
  await page.goto('/app')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await completeProfile(page)
  // #14: recommendations auto-fire — the loader appears without a button press.
  await expectFullScreenLoader(page, 'Ranking San Francisco setup spots…')
  await awaitRecommendations(page)

  await page.getByRole('button', { name: 'Permits' }).click()
  await Promise.all([
    expectFullScreenLoader(page, 'Building your San Francisco permit path…'),
    page.getByRole('button', { name: 'Build my permit checklist' }).click(),
  ])
  await expect(page.getByRole('heading', { name: 'Public Works' })).toBeVisible()
})

test('#14 controls: time wheel + address autocomplete on the map', async ({ page }) => {
  await mockPlaces(page)
  await page.addInitScript((profile) => {
    localStorage.setItem('rollaway.profile.v1', JSON.stringify(profile))
  }, STORED_PROFILE)
  await page.goto('/app')
  await awaitRecommendations(page)

  await page.getByRole('button', { name: 'Custom' }).click()
  const startWheel = page.getByRole('listbox', { name: 'Start' })
  await expect(startWheel).toBeVisible()
  await expect(page.getByRole('listbox', { name: 'End' })).toBeVisible()
  await startWheel.getByRole('option', { name: '9:00 AM' }).click()
  await page.getByRole('button', { name: 'Use this window' }).click()
  await expect(page.getByRole('button', { name: 'Custom' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await awaitRecommendations(page)

  const search = page.getByPlaceholder('Search a starting address')
  await search.fill('Ferry Building')
  await page.getByRole('option', { name: /Ferry Building/ }).click()
  await expect(
    page.getByText('1 Ferry Building, San Francisco, CA 94111, USA'),
  ).toBeVisible()
  await awaitRecommendations(page)
})

test('granted in-SF geolocation shows Live location', async ({ page }) => {
  await page.addInitScript((profile) => {
    localStorage.setItem('rollaway.profile.v1', JSON.stringify(profile))
  }, STORED_PROFILE)
  await page.goto('/app')
  await awaitRecommendations(page)
  await expect(page.getByText('Live location', { exact: true })).toBeVisible()
})

test('outside-SF geolocation falls back to the SoMa origin with a notice', async ({
  browser,
}) => {
  const context = await browser.newContext({
    ...test.info().project.use,
    permissions: ['geolocation'],
    geolocation: { latitude: 37.8044, longitude: -122.2712 }, // Oakland
  })
  const page = await context.newPage()
  await page.addInitScript((profile) => {
    localStorage.setItem('rollaway.profile.v1', JSON.stringify(profile))
  }, STORED_PROFILE)
  await page.goto('/app')
  await awaitRecommendations(page)
  await expect(page.getByText('Using SoMa · outside SF', { exact: true })).toBeVisible()
  await context.close()
})

test('denied geolocation falls back to SoMa and still recommends', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: PositionCallback, err: PositionErrorCallback) =>
          err({
            code: 1,
            message: 'denied',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError),
      },
    })
  })
  await page.addInitScript((profile) => {
    localStorage.setItem('rollaway.profile.v1', JSON.stringify(profile))
  }, STORED_PROFILE)
  await page.goto('/app')
  await awaitRecommendations(page)
  await expect(page.getByText('Using SoMa · location denied', { exact: true })).toBeVisible()
})

test('fixture mode keeps the schematic map usable without a Mapbox token', async ({
  page,
}) => {
  const { mapboxRequests, rollAwayBusinessRequests } = trackFixtureNetwork(page)
  await page.addInitScript((profile) => {
    localStorage.setItem('rollaway.profile.v1', JSON.stringify(profile))
  }, STORED_PROFILE)
  await page.goto('/app')
  await awaitRecommendations(page)
  await expect(page.getByRole('region', { name: 'Schematic map of SoMa' })).toBeVisible()
  await expect(page.getByText('Map preview')).toBeVisible({ timeout: 15_000 })
  expect(mapboxRequests).toEqual([])
  expect(rollAwayBusinessRequests).toEqual([])
})
