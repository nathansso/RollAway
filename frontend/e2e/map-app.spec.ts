import { expect, test } from '@playwright/test'

async function completeOnboarding(page: import('@playwright/test').Page) {
  await expect(page.getByRole('heading', { name: 'Tell us about your business' })).toBeVisible()
  await page
    .getByRole('textbox', { name: /Menu \*/ })
    .fill('Al pastor taco $5\nVeggie burrito $11\nHorchata $4')
  await page.getByLabel('Home base or neighborhood').fill('Mission District')
  await page.getByLabel('Owner / contact name').fill('Avery Rivera')
  await page.getByLabel('Business name').fill('Mission Tacos')
  await page.getByLabel('Email').fill('avery@example.com')
  await page.getByLabel('Phone').fill('415-555-0123')
  await page.getByLabel('Mailing address').fill('123 Mission St')
  await page.getByLabel('ZIP').fill('94103')
  await page.getByRole('button', { name: 'Save profile & open map' }).click()
  await expect(page.getByRole('heading', { name: 'Tell us about your business' })).toBeHidden()
}

test('first launch, map recommendations, details, permits, and EasyApply', async ({
  page,
}) => {
  const externalRequests: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4173')) externalRequests.push(request.url())
  })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await completeOnboarding(page)
  await expect(page.getByRole('region', { name: 'Schematic map of SoMa' })).toBeVisible()
  expect(externalRequests).toEqual([])
  await expect(page.getByRole('region', { name: 'Recommendation setup' })).toBeVisible()
  await page.getByRole('button', { name: /Use my location/ }).click()
  await expect(page.getByText(/Using SoMa · location denied|Using SoMa · unavailable/)).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tell us about your business' })).toBeHidden()
  await page.getByRole('button', { name: /Edit profile for Mission Tacos/ }).click()
  await expect(page.getByRole('heading', { name: 'Update your setup' })).toBeVisible()
  await page.getByLabel('Business name').fill('Mission Tacos Co.')
  await page.getByRole('button', { name: 'Save profile changes' }).click()

  await page.getByRole('button', { name: 'Find spots' }).click()
  await expect(page.getByRole('status', { name: /Ranking legal/ })).toBeVisible()
  await expect(page.getByText('2nd & Howard', { exact: true })).toBeVisible()
  await expect(page.getByText('Folsom & 1st', { exact: true })).toBeVisible()
  await expect(page.getByText('Mission & 5th', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Tomorrow dinner' }).click()
  await expect(page.getByText('2nd & Howard', { exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'Find spots' }).click()
  await expect(page.getByText('2nd & Howard', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: /Open details for rank 1/ }).click()
  await expect(page.getByRole('dialog', { name: /2nd & Howard/ })).toBeVisible()
  await expect(page.getByText('Estimated foot traffic')).toBeVisible()
  await expect(page.getByText(/Bay Wheels activity is an estimate\/proxy/)).toBeVisible()
  await expect(page.getByText('Menu & price competition')).toBeVisible()
  await expect(page.getByText('Legality check')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: /2nd & Howard/ })).toBeHidden()

  await page.getByRole('button', { name: 'Permits' }).click()
  await expect(page.getByRole('heading', { name: 'Your permit path' })).toBeVisible()
  await expect(page.getByRole('status', { name: /Building your personalized/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Public Works' })).toBeVisible()
  await expect(page.getByText('30-day notice', { exact: true })).toBeVisible()
  await expect(page.getByText('90-day tentative approval window')).toBeVisible()
  await expect(page.getByText('15-day appeal', { exact: true })).toBeVisible()

  const firstChecklist = page.getByRole('checkbox', {
    name: /Mark complete: Prepare the MFF location application/,
  })
  await firstChecklist.click()
  await page.reload()
  await page.getByRole('button', { name: 'Permits' }).click()
  await expect(
    page.getByRole('checkbox', {
      name: /Mark incomplete: Prepare the MFF location application/,
    }),
  ).toHaveAttribute('aria-checked', 'true')

  await page.getByRole('button', { name: /Review & submit simulated draft for Prepare/ }).click()
  await expect(page.getByRole('dialog', { name: /Prepare the MFF location application/ })).toBeVisible()
  await expect(page.getByText('Auto-filled').first()).toBeVisible()
  await expect(page.getByText('Missing', { exact: true })).toBeVisible()
  await expect(page.getByText('Must verify').first()).toBeVisible()
  await page.getByLabel(/Proposed start date/).fill('2026-08-01')
  await page.getByLabel(/Applicant signature/).fill('Avery Rivera')
  await page.getByRole('checkbox').last().check()
  await page.getByRole('button', { name: 'Prepare simulated packet' }).click()
  await expect(page.getByRole('heading', { name: 'Simulated packet ready' })).toBeVisible()

  await expect(page.locator('[data-chat], .chat-sheet, [aria-label*="chat" i]')).toHaveCount(0)
})

test('granted geolocation updates the session state', async ({ browser }) => {
  const context = await browser.newContext({
    ...test.info().project.use,
    permissions: ['geolocation'],
    geolocation: { latitude: 37.7869, longitude: -122.3982 },
  })
  const page = await context.newPage()
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'rollaway.profile.v1',
      JSON.stringify({
        schema_version: 1,
        vendor_type: 'truck',
        menu: { raw: 'Tacos $5', items: [{ name: 'Tacos', price: 5 }], price_tier: '$' },
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
  await page.getByRole('button', { name: /Use my location/ }).click()
  await expect(page.getByText('Live location')).toBeVisible()
  await context.close()
})

test('fixture mode keeps the schematic map usable without tile requests', async ({ page }) => {
  await page.route(/https:\/\/(api|events)\.mapbox\.com\/.*/, (route) => route.abort())
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'rollaway.profile.v1',
      JSON.stringify({
        schema_version: 1,
        vendor_type: 'pushcart_nocook',
        menu: { raw: 'Paleta $5', items: [{ name: 'Paleta', price: 5 }], price_tier: '$' },
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
  await expect(page.getByText('Map preview')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Find spots' }).click()
  await expect(page.getByText('2nd & Howard', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Recommendation 1: 2nd & Howard/ }).click()
  await expect(page.getByRole('dialog', { name: /2nd & Howard/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Permits' }).click()
  await expect(page.getByRole('heading', { name: 'Your permit path' })).toBeVisible()
})
