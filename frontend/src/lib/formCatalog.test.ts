import { describe, expect, it } from 'vitest'
import { PDF_FIELD_MAPS } from './pdfFieldMaps'
import {
  FORM_CATALOG,
  attachFilledForms,
  buildFilledForm,
  vendorProfileValues,
} from './formCatalog'
import type { PermitChecklist, VendorProfile } from '../types/contract'

const profile: VendorProfile = {
  schema_version: 1,
  vendor_type: 'truck',
  cuisine: 'mexican',
  menu: { raw: 'Tacos $5', items: [{ name: 'Tacos', price: 5 }], price_tier: '$' },
  home_base: { label: 'SoMa', point: null },
  max_travel: { value: 25, unit: 'minutes' },
  operating_windows: [{ day: 'fri', time_from: '11:00', time_to: '14:00' }],
  permit_status: 'researching',
  autofill_profile: {
    owner_name: 'Ana Ruiz',
    business_name: 'El Sabor Taqueria',
    email: 'ana@example.com',
    phone: '415-555-0100',
    address: '1 Mission St',
    city: 'San Francisco',
    state: 'CA',
    postal_code: '94103',
  },
}

describe('form catalog', () => {
  it('covers exactly the three verified fillable forms, in sync with the PDF maps', () => {
    expect(Object.keys(FORM_CATALOG).sort()).toEqual(['sfdph-mff', 'sffd-permit', 'sfpw-mff'])
    expect(Object.keys(FORM_CATALOG).sort()).toEqual(Object.keys(PDF_FIELD_MAPS).sort())
    for (const entry of Object.values(FORM_CATALOG)) {
      expect(entry.form_url).toMatch(/^https:\/\//)
      expect(entry.fields.length).toBeGreaterThan(0)
    }
  })

  it('pre-fills supplied values and marks the rest unknown, never guessing', () => {
    const ff = buildFilledForm('sfpw-mff', vendorProfileValues(profile))
    expect(ff).not.toBeNull()
    const f = (k: string) => ff!.fields.find((x) => x.profile_key === k)
    expect(f('business_name')).toMatchObject({ value: 'El Sabor Taqueria', status: 'filled', required: true, type: 'text' })
    expect(f('email')).toMatchObject({ value: 'ana@example.com', status: 'filled', required: false, type: 'email' })
    // no pinned point in the profile -> unknown, not invented
    expect(f('pinned_point')).toMatchObject({ value: null, status: 'unknown' })
  })

  it('returns null for a form with no verified fillable PDF', () => {
    expect(buildFilledForm('ttx-cert', vendorProfileValues(profile))).toBeNull()
  })
})

function checklist(): PermitChecklist {
  return {
    vendor_type: 'truck',
    generated_at: '2026-07-11T00:00:00.000Z',
    sections: [
      {
        agency: 'Public Works',
        items: [
          { id: 'pw', order: 1, title: 'MFF', detail: '', deadline_days: 30, deadline_label: null, cite: 'sfpw-mff', form_url: FORM_CATALOG['sfpw-mff'].form_url, easy_apply: false, fields: [] },
          { id: 'notice', order: 2, title: 'Notice', detail: '', deadline_days: null, deadline_label: null, cite: 'dpw-182101', form_url: null, easy_apply: false, fields: [] },
        ],
      },
      {
        agency: 'Public Health',
        items: [
          { id: 'health', order: 1, title: 'Health', detail: '', deadline_days: 90, deadline_label: null, cite: 'sfdph-mff', form_url: FORM_CATALOG['sfdph-mff'].form_url, easy_apply: false, fields: [] },
          { id: 'food', order: 2, title: 'Food safety', detail: '', deadline_days: 90, deadline_label: null, cite: 'sfdph-mff', form_url: FORM_CATALOG['sfdph-mff'].form_url, easy_apply: false, fields: [] },
        ],
      },
      {
        agency: 'Fire',
        items: [
          { id: 'fire', order: 1, title: 'Fire', detail: '', deadline_days: null, deadline_label: null, cite: 'sffd-permit', form_url: FORM_CATALOG['sffd-permit'].form_url, easy_apply: false, fields: [] },
        ],
      },
    ],
  }
}

describe('attachFilledForms', () => {
  it('attaches a pre-filled form to every included form, deduped per source', () => {
    const out = attachFilledForms(checklist(), profile)
    const items = out.sections.flatMap((s) => s.items)
    const withForm = items.filter((i) => i.filled_form)
    // one per distinct verified form (sfpw, sfdph, sffd) — the duplicate sfdph step is skipped
    expect(withForm.map((i) => i.id).sort()).toEqual(['fire', 'health', 'pw'])
    expect(items.find((i) => i.id === 'food')?.filled_form).toBeUndefined()
    // rule-only step (no form_url) never gets one
    expect(items.find((i) => i.id === 'notice')?.filled_form).toBeUndefined()
    // the Fire form is pre-filled from the profile
    const fire = items.find((i) => i.id === 'fire')!.filled_form!
    expect(fire.form).toBe('Operational Permit Application')
    expect(fire.fields.find((f) => f.profile_key === 'business_name')?.value).toBe('El Sabor Taqueria')
  })
})
