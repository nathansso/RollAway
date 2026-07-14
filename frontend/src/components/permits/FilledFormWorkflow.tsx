import { useState, type ChangeEvent } from 'react'
import { ChevronIcon } from '../common/Icons'
import { useAppStore } from '../../store'
import type { FilledForm, FilledFormFieldType, VendorProfile } from '../../types/contract'
import {
  EMPTY_FORM_STATE,
  RENEWAL_DAYS,
  allFieldsComplete,
  daysUntilRenewal,
  fieldValue,
  formStatus,
  isFieldOutstanding,
  isFieldRequired,
} from './permitForms'
import type { PermitFormState } from './permitForms'
import FilledPdfView from './FilledPdfView'
import { vendorProfileValues } from '../../lib/formCatalog'
import { PDF_FIELD_MAPS } from '../../lib/pdfFieldMaps'

// #48.2: manual entries typed directly into unmapped PDF fields are stored in
// the same per-form values map under this prefix + the raw AcroForm field name,
// so they persist in localStorage without a new store slice.
const PDF_RAW_PREFIX = 'pdf:'

// HTML input `type` for a field type. select/textarea are handled separately; text is the default.
const INPUT_TYPE: Partial<Record<FilledFormFieldType, string>> = {
  email: 'email',
  tel: 'tel',
  date: 'date',
  number: 'number',
}

// Flat `profile_key -> value` map used to fill the real PDF: vendor profile as the base, overlaid
// by the card's resolved field values (so the PDF matches the card), then the user's typed entries.
// Only non-empty strings survive — we never place a value we do not have.
function buildPdfValues(
  form: FilledForm,
  profile: VendorProfile | null,
  state: PermitFormState,
): Record<string, string> {
  const out: Record<string, string> = { ...vendorProfileValues(profile) }
  const put = (key: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) out[key] = value.trim()
  }
  // Overlay the card's resolved field values, then the user's typed entries (both win over profile).
  for (const field of form.fields) put(field.profile_key, fieldValue(field, state))
  for (const [key, value] of Object.entries(state.values)) {
    if (key.startsWith(PDF_RAW_PREFIX)) continue // raw PDF-field entries fill by name, not profile_key
    put(key, value)
  }
  return out
}

// Manual entries the user typed into raw PDF fields, keyed by AcroForm field name.
function buildRawValues(state: PermitFormState): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(state.values)) {
    if (key.startsWith(PDF_RAW_PREFIX) && typeof value === 'string' && value.trim()) {
      out[key.slice(PDF_RAW_PREFIX.length)] = value.trim()
    }
  }
  return out
}

export default function FilledFormWorkflow({
  itemId,
  source,
  form,
}: {
  itemId: string
  source: string
  form: FilledForm
}) {
  const state = useAppStore((s) => s.permitForms[itemId]) ?? EMPTY_FORM_STATE
  const profile = useAppStore((s) => s.profile)
  const setField = useAppStore((s) => s.setPermitFormField)
  const exportForm = useAppStore((s) => s.exportPermitForm)
  const setSubmission = useAppStore((s) => s.setPermitFormSubmission)

  const status = formStatus(form, state)
  const complete = allFieldsComplete(form, state)
  const days = daysUntilRenewal(state)
  const pdfValues = buildPdfValues(form, profile, state)
  const rawValues = buildRawValues(state)

  // #48.2: resolve/commit values for click-to-type PDF fields. A field mapped to
  // a profile_key routes through the normal field state; an unmapped field the
  // user fills manually is stored by its raw AcroForm name under PDF_RAW_PREFIX.
  const fieldMap = PDF_FIELD_MAPS[source]
  const pdfFieldValue = (pdfFieldName: string): string => {
    const profileKey = fieldMap?.text[pdfFieldName]
    if (profileKey) return pdfValues[profileKey] ?? ''
    return state.values[PDF_RAW_PREFIX + pdfFieldName] ?? ''
  }
  const onPdfFieldInput = (pdfFieldName: string, value: string) => {
    const profileKey = fieldMap?.text[pdfFieldName]
    setField(itemId, profileKey ?? PDF_RAW_PREFIX + pdfFieldName, value)
  }

  // #48.1: the whole field set lives in one expandable, fully-editable section
  // (previously only still-blank fields were editable; filled ones were text).
  // Default open while there's work to do so nothing required is hidden.
  const [fieldsOpen, setFieldsOpen] = useState(!complete)
  const outstandingRequired = form.fields.filter(
    (field) => isFieldRequired(field) && isFieldOutstanding(field, state),
  ).length

  const statusBadge = {
    in_progress: { text: 'In progress', className: 'bg-caution/15 text-caution' },
    ready_to_export: { text: 'Ready to download', className: 'bg-primary/10 text-primary' },
    awaiting_submit: { text: 'Awaiting submission', className: 'bg-primary/10 text-primary' },
    submitted: { text: 'Submitted', className: 'bg-good/15 text-good' },
  }[status]

  return (
    <section
      aria-label={`Paperwork workflow for ${form.form}`}
      className="mt-3 rounded-xl border border-border bg-muted/40 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
            Your saved paperwork
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{form.form}</p>
          <p className="text-xs text-muted-foreground">{form.agency}</p>
        </div>
        <a
          href={form.form_url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-semibold text-primary underline"
        >
          View form
          <span className="sr-only"> for {form.form}</span>
        </a>
      </div>

      <span
        className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge.className}`}
      >
        {statusBadge.text}
      </span>

      <div className="mt-2">
        <button
          type="button"
          onClick={() => setFieldsOpen((open) => !open)}
          aria-expanded={fieldsOpen}
          aria-controls={`form-fields-${itemId}`}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2 text-left"
        >
          <span className="text-sm font-semibold text-foreground">
            Form fields
            <span className="ml-1 font-normal text-muted-foreground">({form.fields.length})</span>
          </span>
          <span className="flex items-center gap-2">
            <span
              className={`text-xs font-semibold ${
                outstandingRequired ? 'text-caution' : 'text-good'
              }`}
            >
              {outstandingRequired
                ? `${outstandingRequired} still needed`
                : `All ${form.fields.length} filled`}
            </span>
            <ChevronIcon
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                fieldsOpen ? 'rotate-90' : ''
              }`}
            />
          </span>
        </button>

        {fieldsOpen && (
          <div id={`form-fields-${itemId}`} className="mt-2 space-y-2.5">
            {form.fields.map((field) => {
              const required = isFieldRequired(field)
              const outstanding = isFieldOutstanding(field, state)
              const labelText = required ? field.label : `${field.label} (optional)`
              // Every field is editable here — filled ones show the autofilled
              // value (user edits win via state.values), blank ones start empty.
              const value = fieldValue(field, state)
              const shared = {
                className: 'form-input mt-1 py-1 text-sm',
                value,
                'aria-required': required,
                placeholder: outstanding
                  ? required
                    ? 'Required for this form'
                    : 'Add if you have it'
                  : undefined,
                onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  setField(itemId, field.profile_key, event.target.value),
              }
              return (
                <label key={field.profile_key} className="block text-sm">
                  <span className="text-muted-foreground">
                    {labelText}
                    {required && <span className="text-caution"> *</span>}
                  </span>
                  {field.type === 'textarea' ? (
                    <textarea {...shared} className="form-input mt-1 min-h-16 resize-y py-1 text-sm" />
                  ) : (
                    <input {...shared} type={(field.type && INPUT_TYPE[field.type]) || 'text'} />
                  )}
                </label>
              )
            })}
          </div>
        )}
      </div>

      <FilledPdfView
        source={source}
        values={pdfValues}
        rawValues={rawValues}
        pdfFieldValue={pdfFieldValue}
        onPdfFieldInput={onPdfFieldInput}
        formName={form.form}
        formUrl={form.form_url}
        canDownload={complete}
        onDownload={() => exportForm(itemId)}
      />

      {status === 'awaiting_submit' && (
        <div role="group" aria-label="Have you submitted this form?" className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-sm font-semibold text-foreground">Have you submitted this form?</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="primary-button px-4 py-1.5 text-sm"
              onClick={() => setSubmission(itemId, true)}
            >
              Yes, submitted
            </button>
            <button
              type="button"
              className="easyapply-button"
              onClick={() => setSubmission(itemId, false)}
            >
              Not yet
            </button>
          </div>
        </div>
      )}

      {status === 'submitted' && days !== null && (
        <p className="mt-3 text-xs font-medium text-foreground">
          {days > 0
            ? `Estimated renewal in ${days} day${days === 1 ? '' : 's'}`
            : 'Estimated renewal is due'}
          <span className="font-normal text-muted-foreground">
            {' '}
            (~{RENEWAL_DAYS}-day cycle — verify the exact term with the agency).
          </span>
        </p>
      )}

      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Pre-filled from your profile for your records. Review on the official form before submitting;
        this does not file it.
      </p>
    </section>
  )
}
