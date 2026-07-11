import { expect, test } from '@playwright/test'

test('production PWA shell and fixture data reload offline', async ({ page, context }) => {
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
    return navigator.serviceWorker.ready
  })
  await page.reload()
  await expect(page.getByRole('region', { name: 'Schematic map of SoMa' })).toBeVisible()

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText(/Offline\. Fixture recommendations/)).toBeVisible()
  await page.getByRole('button', { name: 'Find spots' }).click()
  await expect(page.getByText('2nd & Howard', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Permits' }).click()
  await expect(page.getByRole('heading', { name: 'Public Works' })).toBeVisible()
})
