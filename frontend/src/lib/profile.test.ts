import { describe, expect, it } from 'vitest'
import {
  derivePriceTier,
  parseMenu,
  parseStoredProfile,
  validateProfile,
} from './profile'

describe('parseMenu', () => {
  it('extracts item names and common dollar prices', () => {
    expect(parseMenu('Taco al pastor $4.50\nHorchata - 3\nChips ........ $2.00')).toEqual([
      { name: 'Taco al pastor', price: 4.5 },
      { name: 'Horchata', price: 3 },
      { name: 'Chips', price: 2 },
    ])
  })

  it('keeps useful item names when no price is present', () => {
    expect(parseMenu('Seasonal fruit cup\nCoffee')).toEqual([
      { name: 'Seasonal fruit cup', price: null },
      { name: 'Coffee', price: null },
    ])
  })
})

describe('derivePriceTier', () => {
  it('derives a coarse tier from the median known item price', () => {
    expect(derivePriceTier([{ name: 'A', price: 4 }, { name: 'B', price: 7 }])).toBe('$')
    expect(derivePriceTier([{ name: 'A', price: 9 }, { name: 'B', price: 14 }])).toBe('$$')
    expect(derivePriceTier([{ name: 'A', price: 17 }, { name: 'B', price: 24 }])).toBe('$$$')
  })

  it('defaults to one dollar when prices cannot be parsed', () => {
    expect(derivePriceTier([{ name: 'Market price', price: null }])).toBe('$')
  })
})

describe('profile persistence boundary', () => {
  const validProfile = {
    schema_version: 1,
    vendor_type: 'pushcart_nocook',
    cuisine: 'mexican',
    menu: {
      raw: 'Paleta $5',
      items: [{ name: 'Paleta', price: 5 }],
      price_tier: '$',
    },
    home_base: { label: 'Mission District', point: null },
    max_travel: { value: 25, unit: 'minutes' },
    operating_windows: [{ day: 'fri', time_from: '11:00', time_to: '14:00' }],
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
  }

  it('accepts the canonical pushcart_nocook profile', () => {
    expect(validateProfile(validProfile)).toBe(true)
    expect(parseStoredProfile(JSON.stringify(validProfile))).toEqual(validProfile)
  })

  it('migrates a persisted v1 profile without cuisine to American', () => {
    const { cuisine: _cuisine, ...persistedV1Profile } = validProfile

    expect(parseStoredProfile(JSON.stringify(persistedV1Profile))).toEqual({
      ...persistedV1Profile,
      cuisine: 'american',
    })
  })

  it('rejects corrupt, incomplete, and misspelled vendor profiles', () => {
    expect(parseStoredProfile('{broken')).toBeNull()
    expect(parseStoredProfile(JSON.stringify({ ...validProfile, vendor_type: 'pushcart_no_cook' }))).toBeNull()
    expect(parseStoredProfile(JSON.stringify({ ...validProfile, cuisine: 'unknown' }))).toBeNull()
    expect(parseStoredProfile(JSON.stringify({ ...validProfile, menu: { raw: '' } }))).toBeNull()
  })
})
