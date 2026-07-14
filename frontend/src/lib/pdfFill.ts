import { PDFDocument } from 'pdf-lib'
import { PDF_FIELD_MAPS } from './pdfFieldMaps'
import { endpointUrl } from './config'
import type { VendorType } from '../types/contract'

export function formPdfProxyUrl(source: string): string {
  const base = endpointUrl('FORM_PDF_URL') || 'http://localhost:8091/form_pdf'
  return `${base}?source=${encodeURIComponent(source)}`
}

// Fetch the verified agency PDF through our same-origin-friendly runtime proxy (the agency hosts
// send no CORS headers, so the browser can't fetch them directly).
export async function fetchFormPdf(source: string): Promise<Uint8Array> {
  const res = await fetch(formPdfProxyUrl(source))
  if (!res.ok) throw new Error(`form PDF proxy returned ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

// How many of a form's mapped text fields we can actually fill from the supplied values — pure, so
// the mapping can be unit-tested without a real PDF. Blank/whitespace values do not count.
export function fillableTextFieldCount(
  source: string,
  values: Record<string, string>,
): number {
  const map = PDF_FIELD_MAPS[source]
  if (!map) return 0
  return Object.values(map.text).filter((key) => (values[key] ?? '').trim() !== '').length
}

// Fill the AcroForm text fields (and the vendor-type checkbox) from the supplied values, keeping
// every field LIVE and editable in the output PDF — we do NOT flatten. The autofilled value becomes
// the field's current value, but the box stays editable so the user can correct it in any PDF
// reader before submitting. Unmapped or blank fields are left untouched — never guessed. (Flattening
// to lock the form is deliberately deferred to a future explicit "lock/submit" step.)
export async function fillFormPdf(
  source: string,
  values: Record<string, string>,
  bytes: Uint8Array,
  // #48.2: values the user typed directly into PDF fields we don't autofill,
  // keyed by the raw AcroForm field name. Applied after the mapped fills so a
  // manual entry always wins, and persisted into the downloaded PDF.
  rawValues: Record<string, string> = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const form = doc.getForm()
  const map = PDF_FIELD_MAPS[source]
  if (map) {
    for (const [pdfField, key] of Object.entries(map.text)) {
      const value = (values[key] ?? '').trim()
      if (!value) continue
      try {
        form.getTextField(pdfField).setText(value)
      } catch {
        /* field missing/renamed in a newer PDF revision — skip, never crash the fill */
      }
    }
    const checkbox = map.vendorTypeCheckbox?.[values.vendor_type as VendorType]
    if (checkbox) {
      try {
        form.getCheckBox(checkbox).check()
      } catch {
        /* ignore */
      }
    }
  }
  // Manual entries on any (mapped or unmapped) field, by raw AcroForm name.
  for (const [pdfField, raw] of Object.entries(rawValues)) {
    const value = (raw ?? '').trim()
    if (!value) continue
    try {
      form.getTextField(pdfField).setText(value)
    } catch {
      /* not a fillable text field on this PDF — skip */
    }
  }
  // Regenerate appearance streams so the filled values render in every viewer, WITHOUT flattening —
  // the fields stay editable.
  try {
    form.updateFieldAppearances()
  } catch {
    /* ignore — values are still set as field /V even if appearances can't be regenerated */
  }
  return doc.save()
}
