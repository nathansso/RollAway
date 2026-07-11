import { describe, expect, it } from 'vitest'
import type { FilledForm } from '../../types/contract'
import {
  EMPTY_FORM_STATE,
  RENEWAL_DAYS,
  allFieldsComplete,
  buildFilledFormHtml,
  daysUntilRenewal,
  fieldValue,
  filledFormExportRows,
  filledFormFilename,
  formStatus,
  isFieldOutstanding,
  isFieldRequired,
  type PermitFormState,
} from './permitForms'

const DAY_MS = 24 * 60 * 60 * 1000

const form: FilledForm = {
  agency: 'San Francisco Public Works',
  form: 'Application for Mobile Food Facility',
  form_url: 'https://sfpublicworks.org/form.pdf',
  fields: [
    { label: 'Business name', profile_key: 'business_name', value: 'El Sabor', status: 'filled' },
    { label: 'Contact email', profile_key: 'email', value: null, status: 'unknown' },
  ],
}

const withState = (patch: Partial<PermitFormState> = {}): PermitFormState => ({
  ...EMPTY_FORM_STATE,
  ...patch,
})

describe('permitForms field logic', () => {
  it('uses the autofilled value for filled fields and blank for unknown', () => {
    expect(fieldValue(form.fields[0], EMPTY_FORM_STATE)).toBe('El Sabor')
    expect(fieldValue(form.fields[1], EMPTY_FORM_STATE)).toBe('')
    expect(isFieldOutstanding(form.fields[1], EMPTY_FORM_STATE)).toBe(true)
  })

  it('lets a typed value complete an outstanding field and override a filled one', () => {
    const state = withState({ values: { email: '  hi@x.com  ', business_name: 'Renamed' } })
    expect(fieldValue(form.fields[1], state)).toBe('hi@x.com')
    expect(isFieldOutstanding(form.fields[1], state)).toBe(false)
    expect(fieldValue(form.fields[0], state)).toBe('Renamed')
  })

  it('treats a whitespace-only entry as still outstanding', () => {
    const state = withState({ values: { email: '   ' } })
    expect(isFieldOutstanding(form.fields[1], state)).toBe(true)
    expect(allFieldsComplete(form, state)).toBe(false)
  })
})

describe('permitForms status machine', () => {
  it('is in_progress until every field is complete', () => {
    expect(formStatus(form, EMPTY_FORM_STATE)).toBe('in_progress')
  })

  it('is ready_to_export when complete but not exported', () => {
    const state = withState({ values: { email: 'a@b.com' } })
    expect(allFieldsComplete(form, state)).toBe(true)
    expect(formStatus(form, state)).toBe('ready_to_export')
  })

  it('awaits the submission answer once complete and exported', () => {
    const state = withState({ values: { email: 'a@b.com' }, exported: true })
    expect(formStatus(form, state)).toBe('awaiting_submit')
  })

  it('is submitted after a yes, and back to in_progress after a no', () => {
    const yes = withState({ values: { email: 'a@b.com' }, exported: true, submission: 'submitted', submittedAt: Date.now() })
    expect(formStatus(form, yes)).toBe('submitted')
    const no = withState({ values: { email: 'a@b.com' }, exported: true, submission: 'not_submitted' })
    expect(formStatus(form, no)).toBe('in_progress')
  })
})

describe('permitForms export + renewal', () => {
  it('keeps outstanding fields in export rows, marked not provided', () => {
    const rows = filledFormExportRows(form, EMPTY_FORM_STATE)
    expect(rows).toEqual([
      { label: 'Business name', value: 'El Sabor', provided: true, required: true },
      { label: 'Contact email', value: '', provided: false, required: true },
    ])
  })

  it('reports renewal countdown only once submitted', () => {
    expect(daysUntilRenewal(EMPTY_FORM_STATE)).toBeNull()
    const submittedAt = Date.now() - 10 * DAY_MS
    const state = withState({ submission: 'submitted', submittedAt })
    expect(daysUntilRenewal(state)).toBe(RENEWAL_DAYS - 10)
  })

  it('returns a non-positive countdown once the renewal date has passed', () => {
    const submittedAt = Date.now() - (RENEWAL_DAYS + 5) * DAY_MS
    const state = withState({ submission: 'submitted', submittedAt })
    expect(daysUntilRenewal(state)).toBeLessThanOrEqual(0)
  })
})

// A form with a genuinely OPTIONAL field, matching the ingested schema (type + required).
const typedForm: FilledForm = {
  agency: 'San Francisco Public Works',
  form: 'Application for Mobile Food Facility',
  form_url: 'https://sfpublicworks.org/form.pdf',
  fields: [
    { label: 'Business name', profile_key: 'business_name', type: 'text', required: true, value: 'El Sabor', status: 'filled' },
    { label: 'Contact email', profile_key: 'email', type: 'email', required: false, value: null, status: 'unknown' },
  ],
}

describe('permitForms required/optional (form-fill pipeline)', () => {
  it('treats absent required as required (back-compat) and required:false as optional', () => {
    expect(isFieldRequired({ label: 'x', profile_key: 'x', value: null, status: 'unknown' })).toBe(true)
    expect(isFieldRequired(typedForm.fields[0])).toBe(true)
    expect(isFieldRequired(typedForm.fields[1])).toBe(false)
  })

  it('completes when required fields are filled even if an optional one is blank', () => {
    // business_name is autofilled (filled), email is optional + blank -> still complete
    expect(allFieldsComplete(typedForm, EMPTY_FORM_STATE)).toBe(true)
    expect(formStatus(typedForm, EMPTY_FORM_STATE)).toBe('ready_to_export')
  })

  it('stays in progress while a REQUIRED field is blank', () => {
    const reqBlank: FilledForm = {
      ...typedForm,
      fields: [{ label: 'Business name', profile_key: 'business_name', type: 'text', required: true, value: null, status: 'unknown' }],
    }
    expect(allFieldsComplete(reqBlank, EMPTY_FORM_STATE)).toBe(false)
    expect(formStatus(reqBlank, EMPTY_FORM_STATE)).toBe('in_progress')
  })

  it('marks required vs optional in the export rows', () => {
    const rows = filledFormExportRows(typedForm, EMPTY_FORM_STATE)
    expect(rows.map((r) => r.required)).toEqual([true, false])
  })
})

describe('buildFilledFormHtml download artifact', () => {
  it('renders filled values, marks unknowns and optional fields, keeps the disclaimer', () => {
    const html = buildFilledFormHtml(typedForm, withState({ values: { email: 'ana@example.com' } }))
    expect(html).toContain('Application for Mobile Food Facility')
    expect(html).toContain('El Sabor') // autofilled
    expect(html).toContain('ana@example.com') // user-supplied
    expect(html).toContain('(optional)') // optional field labelled
    expect(html).toContain('Guidance, not legal advice.')
    expect(html).toContain('https://sfpublicworks.org/form.pdf')
  })

  it('marks a still-unknown field rather than guessing, and escapes HTML', () => {
    const html = buildFilledFormHtml(typedForm, EMPTY_FORM_STATE)
    expect(html).toContain('— to complete —') // email left blank, marked
    const injected = buildFilledFormHtml(typedForm, withState({ values: { email: '<script>x</script>' } }))
    expect(injected).not.toContain('<script>x</script>')
    expect(injected).toContain('&lt;script&gt;')
  })

  it('builds a safe download filename', () => {
    expect(filledFormFilename(typedForm)).toBe('application-for-mobile-food-facility-rollaway.html')
  })
})
