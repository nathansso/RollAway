import { expect, test } from '@playwright/test'

const FAKE_PUBLIC_MAPBOX_TOKEN =
  'pk.eyJ1Ijoicm9sbGF3YXktZml4dHVyZSIsImEiOiJmaXh0dXJlIn0.fixture-signature'

const MINIMAL_STYLE = {
  version: 8,
  name: 'Rollaway hermetic Mapbox fixture',
  sources: {
    'fixture-tiles': {
      type: 'vector',
      tiles: [
        `https://api.mapbox.com/tiles/mapbox.fixture/{z}/{x}/{y}.mvt?access_token=${FAKE_PUBLIC_MAPBOX_TOKEN}`,
      ],
      minzoom: 0,
      maxzoom: 22,
    },
  },
  layers: [
    {
      id: 'fixture-background',
      type: 'background',
      paint: { 'background-color': '#e8ece5' },
    },
    {
      id: 'fixture-lines',
      type: 'line',
      source: 'fixture-tiles',
      'source-layer': 'fixture',
      paint: { 'line-color': '#c9d1c7', 'line-width': 1 },
    },
  ],
}

test('fixture mode renders Mapbox with only intercepted fake-token traffic', async ({
  page,
}) => {
  const styleRequests: string[] = []
  const tileRequests: string[] = []
  const businessRequests: string[] = []
  const browserErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      url.protocol !== 'blob:' &&
      url.protocol !== 'data:' &&
      url.hostname !== '127.0.0.1' &&
      url.hostname !== 'localhost' &&
      !url.hostname.endsWith('.mapbox.com')
    ) {
      businessRequests.push(request.url())
    }
  })

  await page.route('https://api.mapbox.com/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/styles/v1/')) {
      styleRequests.push(url.toString())
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MINIMAL_STYLE),
      })
      return
    }
    if (url.pathname.endsWith('.mvt')) {
      tileRequests.push(url.toString())
      await route.fulfill({
        status: 200,
        contentType: 'application/vnd.mapbox-vector-tile',
        body: Buffer.alloc(0),
      })
      return
    }
    await route.fulfill({ status: 204, body: '' })
  })
  await page.route('https://events.mapbox.com/**', (route) =>
    route.fulfill({ status: 204, body: '' }),
  )

  await page.goto('/app')
  await page.evaluate(() => {
    localStorage.setItem(
      'rollaway.profile.v1',
      JSON.stringify({
        schema_version: 1,
        vendor_type: 'truck',
        cuisine: 'mexican',
        menu: {
          raw: 'Tacos $5',
          items: [{ name: 'Tacos', price: 5 }],
          price_tier: '$',
        },
        home_base: { label: 'SoMa', point: null },
        max_travel: { value: 20, unit: 'minutes' },
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
      }),
    )
  })
  // #14 removed the session-setup step this used to click through ("Find places
  // to roll"): a stored profile now boots straight to the map and auto-searches.
  await page.reload()
  // The auto-search replaces that click, so wait for it to land before asserting
  // on the markers it draws.
  await expect(page.getByText('2nd & Howard', { exact: true })).toBeVisible({
    timeout: 25_000,
  })

  const map = page.getByRole('application', {
    name: 'Interactive map of recommendations, permitted vendors, closures, and your location',
  })
  await expect.poll(() => styleRequests.length).toBeGreaterThan(0)
  await expect.poll(() => tileRequests.length).toBeGreaterThan(0)
  await expect(map).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('region', { name: 'Schematic map of SoMa' })).toHaveCount(0)
  await expect(page.locator('.mapboxgl-ctrl-zoom-in')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recenter map on your origin' })).toBeVisible()
  // #31: every candidate in the pool draws a pin — the top 3 dominant, the rest
  // smaller "minor" markers. Counts track the fixture pool (12).
  await expect(page.locator('.rank-marker')).toHaveCount(12)
  await expect(page.locator('.rank-marker--minor')).toHaveCount(9)
  expect(styleRequests.every((url) => url.includes('access_token=pk.'))).toBe(true)
  expect(businessRequests).toEqual([])
  expect(browserErrors).toEqual([])
})
