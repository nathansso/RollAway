import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { fillFormPdf, fillableTextFieldCount, formPdfProxyUrl } from './pdfFill'
import { PDF_FIELD_MAPS, hasPdfFieldMap } from './pdfFieldMaps'

// A minimal AcroForm PDF whose text field is named exactly like a real sfpw-mff field, so we can
// exercise fillFormPdf and then inspect the OUTPUT with pdf-lib's field API.
async function blankFormPdf(fieldName: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([600, 400])
  doc.getForm().createTextField(fieldName).addToPage(page, { x: 50, y: 300, width: 220, height: 20 })
  return doc.save()
}

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

describe('fillFormPdf keeps fields live (not flattened)', () => {
  it('sets the value AND leaves the AcroForm field editable in the output', async () => {
    const blank = await blankFormPdf('Business DBA Name')
    const filled = await fillFormPdf('sfpw-mff', { business_name: 'El Sabor Taqueria' }, blank)

    const out = await PDFDocument.load(filled)
    const form = out.getForm()
    // Not flattened: the form still has fields (flattening removes them entirely).
    expect(form.getFields().length).toBe(1)
    const field = form.getTextField('Business DBA Name')
    // The autofilled value is the field's current value...
    expect(field.getText()).toBe('El Sabor Taqueria')
    // ...and the field is still a live, editable text box (read-only flag not set).
    expect(field.isReadOnly()).toBe(false)
    // It can be edited further, exactly as a user would in a PDF reader.
    field.setText('Corrected Name')
    expect(field.getText()).toBe('Corrected Name')
  })
})
