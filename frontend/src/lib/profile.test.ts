import { describe, expect, it } from 'vitest'
import {
  derivePriceTier,
  formatUsPhone,
  formatUsPhoneLocal,
  isValidEmailShape,
  isValidUsPhone,
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

describe('formatUsPhoneLocal', () => {
  it('formats progressively as digits are typed', () => {
    expect(formatUsPhoneLocal('')).toBe('')
    expect(formatUsPhoneLocal('415')).toBe('(415')
    expect(formatUsPhoneLocal('415555')).toBe('(415) 555')
    expect(formatUsPhoneLocal('4155550132')).toBe('(415) 555-0132')
  })

  it('ignores non-digits, a leading +1, and extra digits', () => {
    expect(formatUsPhoneLocal('(415) 555-0132')).toBe('(415) 555-0132')
    expect(formatUsPhoneLocal('+1 415 555 0132')).toBe('(415) 555-0132')
    expect(formatUsPhoneLocal('14155550132')).toBe('(415) 555-0132')
    expect(formatUsPhoneLocal('415-555-0132-999')).toBe('(415) 555-0132')
  })

  it('reformats a legacy stored number', () => {
    expect(formatUsPhoneLocal('415-555-0123')).toBe('(415) 555-0123')
  })
})

describe('isValidEmailShape', () => {
  it('accepts any real-looking address regardless of TLD (issue #12)', () => {
    for (const email of [
      'avery@example.com',
      'student@berkeley.edu',
      'first.last@school.edu',
      'name+tag@school.edu',
      'a@b.museum',
      'someone@sub.domain.co.uk',
      '  spaced@example.org  ',
    ]) {
      expect(isValidEmailShape(email)).toBe(true)
    }
  })

  it('still rejects clearly malformed shapes', () => {
    for (const email of ['', 'plainword', 'no@tld', 'a@b.', '@b.com', 'a b@c.com']) {
      expect(isValidEmailShape(email)).toBe(false)
    }
  })
})

describe('formatUsPhone', () => {
  it('prefixes +1 once digits are present and stays blank otherwise', () => {
    expect(formatUsPhone('')).toBe('')
    expect(formatUsPhone('4155550132')).toBe('+1 (415) 555-0132')
    expect(formatUsPhone('+1 (415) 555-0132')).toBe('+1 (415) 555-0132')
  })
})

describe('isValidUsPhone', () => {
  it('accepts a complete 10-digit number in any format', () => {
    for (const p of ['4155550132', '(415) 555-0132', '+1 (415) 555-0132', '415-555-0132']) {
      expect(isValidUsPhone(p)).toBe(true)
    }
  })

  it('rejects incomplete or empty numbers', () => {
    for (const p of ['', '415', '(415) 555', '15550132']) {
      expect(isValidUsPhone(p)).toBe(false)
    }
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

  it('accepts an empty home_base label now that the field is removed (#11)', () => {
    expect(
      validateProfile({ ...validProfile, home_base: { label: '', point: null } }),
    ).toBe(true)
  })

  it('rejects an incomplete phone number (#11 phone validity)', () => {
    expect(
      validateProfile({
        ...validProfile,
        autofill_profile: { ...validProfile.autofill_profile, phone: '415-555' },
      }),
    ).toBe(false)
    expect(
      validateProfile({
        ...validProfile,
        autofill_profile: {
          ...validProfile.autofill_profile,
          phone: '+1 (415) 555-0132',
        },
      }),
    ).toBe(true)
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
