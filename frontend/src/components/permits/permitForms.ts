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

export function allFieldsComplete(form: FilledForm, state: PermitFormState): boolean {
  return form.fields.every((field) => !isFieldOutstanding(field, state))
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
}

// Rows for the exportable partially-filled representation. Blank fields are kept
// and clearly marked as outstanding — we never invent a value for the vendor.
export function filledFormExportRows(
  form: FilledForm,
  state: PermitFormState,
): ExportRow[] {
  return form.fields.map((field) => {
    const value = fieldValue(field, state)
    return { label: field.label, value, provided: value !== '' }
  })
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
