import type {
  FilledForm,
  FilledFormFieldType,
  PermitChecklist,
  VendorProfile,
} from '../types/contract'

// Frontend copy of the verified, fillable forms — mirrors agents/kb/FORMS.md (agency/form/URL) and
// agents/kb/FORM_FIELDS.md (per-field label/type/required). The agents KB is the source of truth;
// this powers the demo's fixtures-mode autofill so EVERY included form gets a fillable card + the
// auto-filled editable PDF, not just Public Works. Only agency-hosted, allowlisted PDFs appear here
// (SOURCE-NEEDED forms like ttx-cert / ca-dmv are intentionally absent — no fillable form exists).
interface CatalogField {
  label: string
  profile_key: string
  type: FilledFormFieldType
  required: boolean
}

interface CatalogEntry {
  agency: string
  form: string
  form_url: string
  fields: CatalogField[]
}

export const FORM_CATALOG: Record<string, CatalogEntry> = {
  'sfpw-mff': {
    agency: 'San Francisco Public Works',
    form: 'Application for Mobile Food Facility',
    form_url:
      'https://sfpublicworks.org/sites/default/files/Application_for_Mobile_Food_Facility.pdf',
    fields: [
      { label: 'Business name', profile_key: 'business_name', type: 'text', required: true },
      { label: 'Applicant / owner name', profile_key: 'owner_name', type: 'text', required: true },
      { label: 'Mobile food facility type', profile_key: 'vendor_type', type: 'select', required: true },
      { label: 'Proposed location (lat, lng)', profile_key: 'pinned_point', type: 'text', required: true },
      { label: 'Contact phone', profile_key: 'phone', type: 'tel', required: true },
      { label: 'Contact email', profile_key: 'email', type: 'email', required: false },
    ],
  },
  'sfdph-mff': {
    agency: 'San Francisco Department of Public Health',
    form: 'Mobile Food Facility Unified Application',
    form_url: 'https://www.sf.gov/sites/default/files/2024-06/MFF%20Unified%20Application.pdf',
    fields: [
      { label: 'Business name', profile_key: 'business_name', type: 'text', required: true },
      { label: 'Owner / operator name', profile_key: 'owner_name', type: 'text', required: true },
      { label: 'Facility type', profile_key: 'vendor_type', type: 'select', required: true },
      { label: 'Contact phone', profile_key: 'phone', type: 'tel', required: true },
      { label: 'Contact email', profile_key: 'email', type: 'email', required: false },
    ],
  },
  'sffd-permit': {
    agency: 'San Francisco Fire Department',
    form: 'Operational Permit Application',
    form_url: 'https://sf-fire.org/media/3681/download?inline',
    fields: [
      { label: 'Business name', profile_key: 'business_name', type: 'text', required: true },
      { label: 'Applicant name', profile_key: 'owner_name', type: 'text', required: true },
      { label: 'Contact phone', profile_key: 'phone', type: 'tel', required: true },
    ],
  },
}

// Flat `profile_key -> value` view of the vendor profile (only non-empty strings). Used to pre-fill
// forms and the PDF. Values are copied only from supplied data — never invented.
export function vendorProfileValues(profile: VendorProfile | null): Record<string, string> {
  const out: Record<string, string> = {}
  const put = (key: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) out[key] = value.trim()
  }
  if (profile) {
    const ap = profile.autofill_profile ?? {}
    put('business_name', ap.business_name)
    put('owner_name', ap.owner_name)
    put('email', ap.email)
    put('phone', ap.phone)
    put('address', ap.address)
    put('city', ap.city)
    put('state', ap.state)
    put('postal_code', ap.postal_code)
    put('vendor_type', profile.vendor_type)
    put('menu', profile.menu?.raw)
    const point = profile.home_base?.point
    if (point) put('pinned_point', `${point.lat}, ${point.lng}`)
  }
  return out
}

// Build a form's `filled_form` record from a catalog entry, pre-filled from the profile values.
// Missing values are `value: null, status: "unknown"` — never guessed. Returns null off-catalog.
export function buildFilledForm(
  source: string,
  values: Record<string, string>,
): FilledForm | null {
  const entry = FORM_CATALOG[source]
  if (!entry) return null
  return {
    agency: entry.agency,
    form: entry.form,
    form_url: entry.form_url,
    fields: entry.fields.map((field) => {
      const value = values[field.profile_key]
      return {
        label: field.label,
        profile_key: field.profile_key,
        type: field.type,
        required: field.required,
        value: value ?? null,
        status: value ? 'filled' : 'unknown',
      }
    }),
  }
}

// Attach a profile-pre-filled `filled_form` to every checklist step that references a verified,
// fillable form (a real form_url + a catalog cite). Deduped per form so the same PDF isn't shown on
// two steps. Steps without a real form (SOURCE-NEEDED / rule-only) are left untouched.
export function attachFilledForms(
  checklist: PermitChecklist,
  profile: VendorProfile | null,
): PermitChecklist {
  const values = vendorProfileValues(profile)
  const seen = new Set<string>()
  return {
    ...checklist,
    sections: checklist.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        if (!item.form_url || !FORM_CATALOG[item.cite] || seen.has(item.cite)) return item
        seen.add(item.cite)
        return { ...item, filled_form: buildFilledForm(item.cite, values) }
      }),
    })),
  }
}
