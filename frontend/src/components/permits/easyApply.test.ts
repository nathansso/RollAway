import { describe, expect, it } from 'vitest'
import type { PermitChecklistItem, VendorProfile } from '../../types/contract'
import { buildEasyApplyValues } from './easyApply'

const profile: VendorProfile = {
  schema_version: 1,
  vendor_type: 'truck',
  menu: { raw: 'Tacos $5', items: [{ name: 'Tacos', price: 5 }], price_tier: '$' },
  home_base: { label: 'Mission District', point: null },
  max_travel: { value: 20, unit: 'minutes' },
  operating_windows: [{ day: 'fri', time_from: '11:00', time_to: '14:00' }],
  permit_status: 'researching',
  autofill_profile: {
    owner_name: 'Avery Rivera',
    business_name: 'Mission Tacos',
    email: 'a@example.com',
    phone: '415-555-0100',
    address: '1 Mission St',
    city: 'San Francisco',
    state: 'CA',
    postal_code: '94103',
  },
}

const item: PermitChecklistItem = {
  id: 'application',
  order: 1,
  title: 'Application',
  detail: '',
  deadline_days: null,
  deadline_label: null,
  cite: 'sfpw-mff',
  easy_apply: true,
  fields: [
    { key: 'owner_name', label: 'Owner', requirement: 'auto_filled' },
    { key: 'vendor_type', label: 'Type', requirement: 'auto_filled' },
    { key: 'menu', label: 'Menu', requirement: 'must_verify' },
    { key: 'location', label: 'Location', requirement: 'must_verify' },
    { key: 'signature', label: 'Signature', requirement: 'must_verify' },
  ],
}

describe('EasyApply prefill', () => {
  it('prefills profile, vendor, menu, and location fields without fabricating signatures', () => {
    expect(buildEasyApplyValues(item, profile)).toEqual({
      owner_name: 'Avery Rivera',
      vendor_type: 'truck',
      menu: 'Tacos $5',
      location: 'Mission District',
      signature: '',
    })
  })
})
