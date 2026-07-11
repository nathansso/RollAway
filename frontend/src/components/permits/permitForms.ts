import type { FilledForm, FilledFormField } from '../../types/contract'

// Local/demo per-form workflow state for a `filled_form` paperwork record.
// Keyed by checklist item id, persisted in localStorage (no server). Values the
// user types for the form's remaining ("unknown") fields live here; we never
// mutate the autofilled record or claim a value the vendor did not supply.
export type FormSubmission = 'unknown' | 'submitted' | 'not_submitted'

export interface PermitFormState {
  values: Record<string, string>
  exported: boolean
  submission: FormSubmission
  submittedAt: number | null
}

export const EMPTY_FORM_STATE: PermitFormState = {
  values: {},
  exported: false,
  submission: 'unknown',
  submittedAt: null,
}

// Estimated renewal cadence for the demo countdown. SF mobile-food permits are
// broadly annual, but exact terms vary — the UI labels this an ESTIMATE to
// verify with the agency, consistent with the guide-not-legal-advice posture.
export const RENEWAL_DAYS = 365
const DAY_MS = 24 * 60 * 60 * 1000

export type FormStatus =
  | 'in_progress' // some fields still blank, or the vendor said "not submitted yet"
  | 'ready_to_export' // every field complete, not yet exported
  | 'awaiting_submit' // complete + exported, we still need the yes/no answer
  | 'submitted'

// The effective value of a field: a non-blank value the vendor typed for a
// remaining field wins; otherwise the autofilled value (only when status filled).
export function fieldValue(field: FilledFormField, state: PermitFormState): string {
  const entered = state.values[field.profile_key]
  if (typeof entered === 'string' && entered.trim()) return entered.trim()
  if (field.status === 'filled' && field.value) return field.value
  return ''
}

// A field the vendor still has to complete: unknown/blank and not yet typed in.
export function isFieldOutstanding(
  field: FilledFormField,
  state: PermitFormState,
): boolean {
  return fieldValue(field, state) === ''
}

// A field the form requires. Absent `required` means required (back-compat with pre-pipeline
// records); only an explicit `required: false` marks a field optional.
export function isFieldRequired(field: FilledFormField): boolean {
  return field.required !== false
}

// Completion gates on REQUIRED fields only: optional blanks never block export/submission.
export function allFieldsComplete(form: FilledForm, state: PermitFormState): boolean {
  return form.fields.every(
    (field) => !isFieldRequired(field) || !isFieldOutstanding(field, state),
  )
}

export function formStatus(form: FilledForm, state: PermitFormState): FormStatus {
  if (!allFieldsComplete(form, state)) return 'in_progress'
  if (!state.exported) return 'ready_to_export'
  if (state.submission === 'submitted') return 'submitted'
  if (state.submission === 'not_submitted') return 'in_progress'
  return 'awaiting_submit'
}

export interface ExportRow {
  label: string
  value: string
  provided: boolean
  required: boolean
}

// Rows for the exportable partially-filled representation. Blank fields are kept
// and clearly marked as outstanding — we never invent a value for the vendor.
export function filledFormExportRows(
  form: FilledForm,
  state: PermitFormState,
): ExportRow[] {
  return form.fields.map((field) => {
    const value = fieldValue(field, state)
    return { label: field.label, value, provided: value !== '', required: isFieldRequired(field) }
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// A safe, stable filename for the downloaded artifact.
export function filledFormFilename(form: FilledForm): string {
  const slug = form.form.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'permit-form'}-rollaway.html`
}

// The generated filled-out form as a self-contained HTML document (the downloadable/viewable
// artifact). Autofilled + user-supplied values are shown; any still-unknown field is clearly
// marked "— to complete —" rather than guessed, and optional fields are labelled.
export function buildFilledFormHtml(form: FilledForm, state: PermitFormState): string {
  const rows = filledFormExportRows(form, state)
    .map(
      (row) =>
        `<tr><th scope="row">${escapeHtml(row.label)}${
          row.required ? '' : ' <span class="opt">(optional)</span>'
        }</th><td class="${row.provided ? 'filled' : 'todo'}">${
          row.provided ? escapeHtml(row.value) : '— to complete —'
        }</td></tr>`,
    )
    .join('')
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${escapeHtml(form.form)} — Rollaway record</title><style>` +
    'body{font:15px/1.5 system-ui,-apple-system,sans-serif;color:#111;margin:2rem auto;max-width:44rem;padding:0 1rem}' +
    'h1{font-size:1.4rem;margin:0 0 .25rem}.agency{color:#555;margin:0 0 1.25rem}' +
    'table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.55rem .5rem;border-bottom:1px solid #ddd;vertical-align:top}' +
    'th{width:46%;color:#333;font-weight:600}td.todo{color:#a15c00;font-style:italic}.opt{color:#888;font-weight:400}' +
    '.note{margin-top:1.5rem;padding:.85rem 1rem;background:#fff7ed;border:1px solid #fed7aa;border-radius:.6rem;font-size:.85rem;color:#7c2d12}a{color:#1d4ed8}' +
    '</style></head><body>' +
    `<h1>${escapeHtml(form.form)}</h1><p class="agency">${escapeHtml(form.agency)}</p>` +
    `<p><a href="${escapeHtml(form.form_url)}" rel="noopener noreferrer">Official form (${escapeHtml(form.form_url)})</a></p>` +
    `<table><tbody>${rows}</tbody></table>` +
    '<p class="note"><strong>Guidance, not legal advice.</strong> This is a personal record pre-filled from your ' +
    'profile. Copy these values onto the official agency form and verify every answer before submitting. ' +
    'Rollaway does not file it for you.</p></body></html>'
  )
}

export function renewalAt(state: PermitFormState): number | null {
  if (state.submission !== 'submitted' || state.submittedAt === null) return null
  return state.submittedAt + RENEWAL_DAYS * DAY_MS
}

// Whole days until renewal (negative once overdue); null unless submitted.
export function daysUntilRenewal(
  state: PermitFormState,
  now: number = Date.now(),
): number | null {
  const at = renewalAt(state)
  if (at === null) return null
  return Math.ceil((at - now) / DAY_MS)
}
