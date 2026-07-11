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

function trackFixtureNetwork(page: import('@playwright/test').Page) {
  const mapboxRequests: string[] = []
  const rollAwayBusinessRequests: string[] = []

  page.on('request', (request) => {
    const url = new URL(request.url())
    if (isLocalBrowserUrl(url)) return
    if (isMapboxUrl(request.url())) mapboxRequests.push(request.url())
    else rollAwayBusinessRequests.push(request.url())
  })

  return { mapboxRequests, rollAwayBusinessRequests }
}

async function expectMapSurface(page: import('@playwright/test').Page) {
  const mapbox = page.getByRole('application', {
    name: 'Interactive map of recommendations, permitted vendors, closures, and your location',
  })
  const fallback = page.getByRole('region', { name: 'Schematic map of SoMa' })

  await expect
    .poll(async () => (await mapbox.isVisible()) || (await fallback.isVisible()), {
      timeout: 15_000,
    })
    .toBe(true)

  return (await mapbox.isVisible()) ? 'mapbox' : 'fallback'
}

async function expectMinimumTouchTargets(
  locator: import('@playwright/test').Locator,
): Promise<void> {
  for (const control of await locator.all()) {
    const box = await control.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
}

async function completeProfile(page: import('@playwright/test').Page) {
  await expect(
    page.getByRole('heading', { name: 'Tell us about your business' }),
  ).toBeVisible()
  await page.getByLabel('Cuisine').selectOption('mexican')
  await page.getByLabel(/Upload menu/).setInputFiles({
    name: 'menu.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Al pastor taco $5\nVeggie burrito $11\nHorchata $4'),
  })
  await expect(page.getByText(/Extracted \d+ items?/)).toBeVisible()
  await page.getByLabel('Owner / contact name').fill('Avery Rivera')
  await page.getByLabel('Business name').fill('Mission Tacos')
  await page.getByLabel('Email').fill('avery@example.com')
  await page.getByLabel('Phone').fill('415-555-0123')
  await page.getByLabel('Mailing address').fill('123 Mission St')
  await page.getByLabel('ZIP').fill('94103')
  await page.getByRole('button', { name: 'Continue to session setup' }).click()
  await expect(
    page.getByRole('heading', { name: 'Tell us about your business' }),
  ).toBeHidden()
}

async function findPlaces(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Find places to roll' }).click()
  await expect(page.getByText('2nd & Howard', { exact: true })).toBeVisible()
}

// The permit checklist is reached from the profile (not a trip-page tab).
async function openPermits(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Edit profile/ }).click()
  await page.getByRole('button', { name: 'Permit checklist' }).click()
}

async function expectFullScreenLoader(
  page: import('@playwright/test').Page,
  status: string,
) {
  const loader = page.getByRole('status', { name: 'Get your business rolling' })
  await expect(loader).toBeVisible()
  await expect(
    loader.getByRole('heading', { name: 'Get your business rolling' }),
  ).toBeVisible()
  await expect(loader.getByText(status, { exact: true })).toBeVisible()
  await expect(loader).toBeFocused()

  const loaderBox = await loader.boundingBox()
  const truckBox = await loader.locator('.truck-loader svg').boundingBox()
  const viewport = page.viewportSize()
  expect(loaderBox).not.toBeNull()
  expect(truckBox).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(loaderBox!.x).toBeCloseTo(0, 0)
  expect(loaderBox!.y).toBeCloseTo(0, 0)
  expect(loaderBox!.width).toBeCloseTo(viewport!.width, 0)
  expect(loaderBox!.height).toBeCloseTo(viewport!.height, 0)
  expect(truckBox!.x + truckBox!.width / 2).toBeCloseTo(viewport!.width / 2, 0)
  await expect(loader).toHaveCSS('background-color', 'rgb(249, 115, 22)')
}

test('full-screen loader covers recommendation and permit operations', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/app')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await completeProfile(page)
  await page.getByRole('button', { name: 'Find places to roll' }).click()
  await expectFullScreenLoader(page, 'Ranking San Francisco setup spots…')
  await expect(page.locator('.truck-loader__body')).toHaveCSS('animation-name', 'none')
  await expect(page.locator('.truck-loader__wheel').first()).toHaveCSS(
    'animation-name',
    'none',
  )
  await expect(page.locator('.truck-loader__dust')).toHaveCSS('animation-name', 'none')
  await expect(page.getByText('2nd & Howard', { exact: true })).toBeVisible()

  await openPermits(page)
  await Promise.all([
    expectFullScreenLoader(page, 'Building your San Francisco permit path…'),
    page.getByRole('button', { name: 'Build my permit checklist' }).click(),
  ])
  await expect(page.getByRole('heading', { name: 'Public Works' })).toBeVisible()
})

test('permit generation is explicit and shows the personalized checklist', async ({
  page,
}) => {
  await page.goto('/app')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await completeProfile(page)
  await findPlaces(page)
  await openPermits(page)

  await expect(
    page.getByRole('heading', { name: 'Build your San Francisco permit path' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Public Works' })).toHaveCount(0)
  await page.waitForTimeout(1_200)
  await expect(page.getByRole('heading', { name: 'Public Works' })).toHaveCount(0)

  await Promise.all([
    page.locator('.full-screen-loader').waitFor({ state: 'attached' }),
    page.getByRole('button', { name: 'Build my permit checklist' }).click(),
  ])
  await expect(page.getByRole('heading', { name: 'Your permit path' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Public Works' })).toBeVisible()
  await expect(page.getByText('30-day notice', { exact: true })).toBeVisible()
  await expect(page.getByText('90-day tentative approval window')).toBeVisible()
  await expect(page.getByText('15-day appeal', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Open official PDF form for Prepare/ })).toHaveAttribute(
    'href',
    'https://sfpublicworks.org/sites/default/files/Application_for_Mobile_Food_Facility.pdf',
  )
})

test('guided setup stages profile, location, and recommendations', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__geoRequests', { value: 0, writable: true })
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: PositionCallback,
          error: PositionErrorCallback,
        ) => {
          ;(window as typeof window & { __geoRequests: number }).__geoRequests += 1
          error({
            code: 1,
            message: 'Permission denied',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError)
        },
      },
    })
  })
  await page.goto('/app')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await expect(
    page.getByRole('main', { name: 'Tell us about your business' }),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Schematic map of SoMa' })).toHaveCount(
    0,
  )
  expect(
    await page.evaluate(
      () => (window as typeof window & { __geoRequests: number }).__geoRequests,
    ),
  ).toBe(0)

  await completeProfile(page)

  await expect(
    page.getByRole('heading', { name: 'When are you setting up?' }),
  ).toBeVisible()
  await expect(page.getByText(/San Francisco only/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Schematic map of SoMa' })).toHaveCount(
    0,
  )
  expect(
    await page.evaluate(
      () => (window as typeof window & { __geoRequests: number }).__geoRequests,
    ),
  ).toBe(0)

  await page.getByRole('button', { name: 'Custom date and time' }).click()
  await page.getByLabel('Date').fill('2099-08-01')
  await page.getByLabel('From').fill('16:30')
  await page.getByLabel('To').fill('20:15')
  await page.getByRole('button', { name: 'Use this window' }).click()
  await expect(
    page.getByRole('button', { name: 'Custom date and time' }),
  ).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Use my live location' }).click()
  expect(
    await page.evaluate(
      () => (window as typeof window & { __geoRequests: number }).__geoRequests,
    ),
  ).toBe(1)
  await expect(page.getByText('Using SoMa · location denied')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Schematic map of SoMa' })).toHaveCount(
    0,
  )

  await findPlaces(page)
  await expectMapSurface(page)
  await expect(page.getByLabel('Rollaway').first()).toBeVisible()
  await expect(page.getByText('Find your next block.', { exact: true })).toHaveCount(0)
})

test('first launch, map recommendations, details, permits, and EasyApply', async ({
  page,
}) => {
  const { mapboxRequests, rollAwayBusinessRequests } = trackFixtureNetwork(page)
  await page.goto('/app')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await completeProfile(page)
  await findPlaces(page)
  const mapSurface = await expectMapSurface(page)
  expect(rollAwayBusinessRequests).toEqual([])
  if (mapSurface === 'mapbox') expect(mapboxRequests.length).toBeGreaterThan(0)
  await expect(page.getByRole('region', { name: 'Recommendation setup' })).toBeVisible()
  await page.getByRole('button', { name: /Use my location/ }).click()
  await expect(
    page.getByText(/Using SoMa · location denied|Using SoMa · unavailable/),
  ).toBeVisible()

  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Tell us about your business' }),
  ).toBeHidden()
  await expect(
    page.getByRole('heading', { name: 'When are you setting up?' }),
  ).toBeVisible()
  const sessionShell = page
    .locator('main[aria-labelledby="session-title"]')
    .locator('..')
  await page.getByRole('button', { name: 'Back / Edit profile' }).click()
  await expect(sessionShell).toHaveAttribute('inert', '')
  await expect(sessionShell).toHaveAttribute('aria-hidden', 'true')
  const profileDialog = page.getByRole('dialog', { name: 'Update your setup' })
  await expect(profileDialog).toBeVisible()
  const profileOverlay = profileDialog.locator('..')
  await expect(profileOverlay).toHaveAttribute(
    'class',
    /pl-\[max\(1\.25rem,env\(safe-area-inset-left\)\)\]/,
  )
  await expect(profileOverlay).toHaveAttribute(
    'class',
    /pr-\[max\(1\.25rem,env\(safe-area-inset-right\)\)\]/,
  )
  await expect(profileOverlay).toHaveAttribute('class', /sm:pt-5/)
  await expect(profileOverlay).toHaveAttribute('class', /sm:pb-5/)
  await expect(profileOverlay).not.toHaveAttribute('class', /sm:p-5/)
  await expect(page.getByRole('heading', { name: 'Update your setup' })).toBeVisible()
  await page.getByLabel('Business name').fill('Mission Tacos Co.')
  await page.getByRole('button', { name: 'Save profile changes' }).click()

  await findPlaces(page)
  await expect(page.getByText('Folsom & 1st', { exact: true })).toBeVisible()
  await expect(page.getByText('Mission & 5th', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Tomorrow dinner' }).click()
  await expect(page.getByText('2nd & Howard', { exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'Find spots' }).click()
  await expect(page.getByText('2nd & Howard', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: /Open details for suggested spot, 2nd & Howard/ }).click()
  await expect(page.getByRole('dialog', { name: /2nd & Howard/ })).toBeVisible()
  await expect(page.getByText('Estimated foot traffic')).toBeVisible()
  await expect(
    page.getByText(/Bay Wheels activity is an estimate\/proxy/),
  ).toBeVisible()
  await expect(page.getByText('Menu & price competition')).toBeVisible()
  await expect(page.getByText('Parking & setup target')).toBeVisible()
  await expect(page.getByText('Permit placement metrics (excluding hydrants)')).toBeVisible()
  await expect(page.getByText('Local cuisine mix')).toBeVisible()
  await expect(page.getByText('Nearby event opportunity')).toBeVisible()
  await expect(page.getByText("Here's a draft you can send")).toBeVisible()
  await expect(page.getByRole('link', { name: 'Navigate to suggested parking' })).toHaveAttribute('href', /origin=.*destination=/)
  await expect(page.getByText('Legality check')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: /2nd & Howard/ })).toBeHidden()

  await openPermits(page)
  await page.getByRole('button', { name: 'Build my permit checklist' }).click()
  await expect(page.getByRole('heading', { name: 'Your permit path' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Public Works' })).toBeVisible()
  await expect(page.getByText('30-day notice', { exact: true })).toBeVisible()
  await expect(page.getByText('90-day tentative approval window')).toBeVisible()
  await expect(page.getByText('15-day appeal', { exact: true })).toBeVisible()

  const firstChecklist = page.getByRole('checkbox', {
    name: /Mark complete: Prepare the MFF location application/,
  })
  await firstChecklist.click()
  await page.reload()
  await findPlaces(page)
  await openPermits(page)
  await page.getByRole('button', { name: 'Build my permit checklist' }).click()
  await expect(
    page.getByRole('checkbox', {
      name: /Mark incomplete: Prepare the MFF location application/,
    }),
  ).toHaveAttribute('aria-checked', 'true')

  await page
    .getByRole('button', { name: /Review & submit simulated draft for Prepare/ })
    .click()
  await expect(
    page.getByRole('dialog', { name: /Prepare the MFF location application/ }),
  ).toBeVisible()
  await expect(page.getByText('Auto-filled').first()).toBeVisible()
  await expect(page.getByText('Missing', { exact: true })).toBeVisible()
  await expect(page.getByText('Must verify').first()).toBeVisible()
  await page.getByLabel(/Proposed start date/).fill('2026-08-01')
  await page.getByLabel(/Applicant signature/).fill('Avery Rivera')
  await page.getByRole('checkbox').last().check()
  await page.getByRole('button', { name: 'Prepare simulated packet' }).click()
  await expect(
    page.getByRole('heading', { name: 'Simulated packet ready' }),
  ).toBeVisible()

  await expect(
    page.locator('[data-chat], .chat-sheet, [aria-label*="chat" i]'),
  ).toHaveCount(0)
})

test('granted geolocation updates the session state', async ({ browser }) => {
  const context = await browser.newContext({
    ...test.info().project.use,
    permissions: ['geolocation'],
    geolocation: { latitude: 37.7869, longitude: -122.3982 },
  })
  const page = await context.newPage()
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
  })
  await page.reload()
  await page.getByRole('button', { name: 'Use my live location' }).click()
  await expect(page.getByText('Live location', { exact: true })).toBeVisible()
  await context.close()
})

test('outside-SF geolocation uses the SoMa fallback with notice', async ({
  browser,
}) => {
  const context = await browser.newContext({
    ...test.info().project.use,
    permissions: ['geolocation'],
    geolocation: { latitude: 37.8044, longitude: -122.2712 },
  })
  const page = await context.newPage()
  await page.goto('/app')
  await page.evaluate(() => {
    localStorage.setItem(
      'rollaway.profile.v1',
      JSON.stringify({
        schema_version: 1,
        vendor_type: 'truck',
        cuisine: 'american',
        menu: {
          raw: 'Burgers $12',
          items: [{ name: 'Burgers', price: 12 }],
          price_tier: '$$',
        },
        home_base: { label: 'SoMa', point: null },
        max_travel: { value: 20, unit: 'minutes' },
        operating_windows: [{ day: 'fri', time_from: '11:00', time_to: '14:00' }],
        permit_status: 'researching',
        autofill_profile: {
          owner_name: 'Avery Rivera',
          business_name: 'Mission Burgers',
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
  await page.reload()
  await page.getByRole('button', { name: 'Use my live location' }).click()
  await expect(
    page.getByText('Using SoMa · outside San Francisco', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Your location is outside San Francisco. Using the SoMa demo origin.',
      { exact: true },
    ),
  ).toBeVisible()
  await context.close()
})

test('fixture mode keeps the schematic map usable without a Mapbox token', async ({
  page,
}) => {
  const { mapboxRequests, rollAwayBusinessRequests } = trackFixtureNetwork(page)
  await page.goto('/app')
  await page.evaluate(() => {
    localStorage.setItem(
      'rollaway.profile.v1',
      JSON.stringify({
        schema_version: 1,
        vendor_type: 'pushcart_nocook',
        menu: {
          raw: 'Paleta $5',
          items: [{ name: 'Paleta', price: 5 }],
          price_tier: '$',
        },
        home_base: { label: 'SoMa', point: null },
        max_travel: { value: 15, unit: 'minutes' },
        operating_windows: [{ day: 'sat', time_from: '11:00', time_to: '15:00' }],
        permit_status: 'researching',
        autofill_profile: {
          owner_name: 'Avery Rivera',
          business_name: 'Mission Paletas',
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
  await page.reload()
  await page.getByRole('button', { name: 'Find places to roll' }).click()
  await expect(
    page.getByRole('region', { name: 'Schematic map of SoMa' }),
  ).toBeVisible()
  await expect(page.getByText('Map preview')).toBeVisible({ timeout: 15_000 })
  expect(mapboxRequests).toEqual([])
  expect(rollAwayBusinessRequests).toEqual([])
  await expect(page.getByText('2nd & Howard', { exact: true })).toBeVisible()
  await expectMinimumTouchTargets(page.locator('.map-controls button'))
  await page.getByRole('button', { name: 'Custom' }).click()
  await expectMinimumTouchTargets(page.locator('.map-controls .choice-chip'))
  await expectMinimumTouchTargets(page.locator('.map-controls .compact-input'))
  await page.getByRole('button', { name: 'Custom' }).click()
  await expect(
    page.getByRole('button', { name: 'Recenter map on your origin' }),
  ).toHaveCount(0)
  const vendor = page
    .getByRole('button', { name: /Vendor .* Cuisine .* Permit status/i })
    .first()
  await vendor.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('status').filter({ hasText: /Permit status/ }),
  ).toBeVisible()
  const rank = page.getByRole('button', { name: /Suggested spot: 2nd & Howard\. Open details\./ })
  const rankBox = await rank.boundingBox()
  expect(rankBox).not.toBeNull()
  expect(rankBox!.width).toBeGreaterThanOrEqual(44)
  expect(rankBox!.height).toBeGreaterThanOrEqual(44)
  await rank.click()
  await expect(page.getByRole('dialog', { name: /2nd & Howard/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await openPermits(page)
  await expect(
    page.getByRole('heading', { name: 'Build your San Francisco permit path' }),
  ).toBeVisible()
})
