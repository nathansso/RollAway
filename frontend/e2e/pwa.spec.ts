import { expect, test } from '@playwright/test'

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

test('production PWA shell and fixture data reload offline', async ({
  page,
  context,
}) => {
  const mapboxRequests: string[] = []
  const rollAwayBusinessRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (isLocalBrowserUrl(url)) return
    if (isMapboxUrl(request.url())) mapboxRequests.push(request.url())
    else rollAwayBusinessRequests.push(request.url())
  })

  await page.goto('/app')
  await page.evaluate(() => {
    localStorage.setItem(
      'rollaway.profile.v1',
      JSON.stringify({
        schema_version: 1,
        vendor_type: 'truck',
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
    return navigator.serviceWorker.ready
  })
  await page.reload()
  await page.getByRole('button', { name: 'Find places to roll' }).click()
  await expect(page.getByText('2nd & Howard', { exact: true })).toBeVisible()
  await expect
    .poll(
      async () =>
        (await page
          .getByRole('application', {
            name: 'Interactive map of recommendations, permitted vendors, closures, and your location',
          })
          .isVisible()) ||
        (await page.getByRole('region', { name: 'Schematic map of SoMa' }).isVisible()),
      { timeout: 15_000 },
    )
    .toBe(true)
  expect(rollAwayBusinessRequests).toEqual([])
  if (
    await page
      .getByRole('application', {
        name: 'Interactive map of recommendations, permitted vendors, closures, and your location',
      })
      .isVisible()
  ) {
    expect(mapboxRequests.length).toBeGreaterThan(0)
  }

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText(/Offline\. Fixture recommendations/)).toBeVisible()
  await page.getByRole('button', { name: 'Find places to roll' }).click()
  await expect(page.getByText('2nd & Howard', { exact: true })).toBeVisible()
  // Permit checklist now lives behind the profile, not a trip-page tab.
  await page.getByRole('button', { name: /Edit profile/ }).click()
  await page.getByRole('button', { name: 'Permit checklist' }).click()
  await expect(
    page.getByRole('heading', { name: 'Build your San Francisco permit path' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Build my permit checklist' }).click()
  await expect(page.getByRole('heading', { name: 'Public Works' })).toBeVisible()
  expect(rollAwayBusinessRequests).toEqual([])
})
