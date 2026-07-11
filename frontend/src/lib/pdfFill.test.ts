import { describe, expect, it } from 'vitest'
import { fillableTextFieldCount, formPdfProxyUrl } from './pdfFill'
import { PDF_FIELD_MAPS, hasPdfFieldMap } from './pdfFieldMaps'

const KNOWN_KEYS = new Set([
  'business_name',
  'owner_name',
  'email',
  'phone',
  'address',
  'city',
  'state',
  'postal_code',
  'vendor_type',
  'pinned_point',
  'vehicle_plate',
  'menu',
])

describe('pdf field maps', () => {
  it('covers exactly the three verified forms', () => {
    expect(Object.keys(PDF_FIELD_MAPS).sort()).toEqual(['sfdph-mff', 'sffd-permit', 'sfpw-mff'])
    expect(hasPdfFieldMap('sfpw-mff')).toBe(true)
    expect(hasPdfFieldMap('ttx-cert')).toBe(false)
    expect(hasPdfFieldMap(null)).toBe(false)
  })

  it('maps only known profile keys and unique PDF field names', () => {
    for (const [source, map] of Object.entries(PDF_FIELD_MAPS)) {
      const pdfFields = Object.keys(map.text)
      expect(new Set(pdfFields).size, `${source} has duplicate PDF field names`).toBe(pdfFields.length)
      for (const key of Object.values(map.text)) {
        expect(KNOWN_KEYS.has(key), `${source} maps unknown profile key ${key}`).toBe(true)
      }
    }
  })

  it('only sfpw-mff offers a vendor-type checkbox', () => {
    expect(PDF_FIELD_MAPS['sfpw-mff'].vendorTypeCheckbox).toBeTruthy()
    expect(PDF_FIELD_MAPS['sfdph-mff'].vendorTypeCheckbox).toBeUndefined()
  })
})

describe('fillableTextFieldCount', () => {
  it('counts mapped fields that have a non-blank value', () => {
    const values = { business_name: 'El Sabor', owner_name: 'Ana Ruiz', email: '', phone: '   ' }
    // sfpw-mff maps business_name, owner_name, phone, email, ... -> only 2 have real values
    expect(fillableTextFieldCount('sfpw-mff', values)).toBe(2)
  })

  it('is 0 for an unmapped source', () => {
    expect(fillableTextFieldCount('ttx-cert', { business_name: 'x' })).toBe(0)
  })
})

describe('formPdfProxyUrl', () => {
  it('builds the proxy url with an encoded source', () => {
    expect(formPdfProxyUrl('sfpw-mff')).toMatch(/\/form_pdf\?source=sfpw-mff$/)
  })
})
