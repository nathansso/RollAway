import type { ChangeEvent } from 'react'
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
  for (const field of form.fields) put(field.profile_key, fieldValue(field, state))
  for (const [key, value] of Object.entries(state.values)) put(key, value)
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

      <dl className="mt-2 space-y-1.5">
        {form.fields.map((field) => {
          const outstanding = isFieldOutstanding(field, state)
          const required = isFieldRequired(field)
          const labelText = required ? field.label : `${field.label} (optional)`
          if (outstanding) {
            const value = state.values[field.profile_key] ?? ''
            const shared = {
              className: 'form-input mt-1 py-1 text-sm',
              value,
              'aria-label': `${labelText} (add to complete this form)`,
              'aria-required': required,
              placeholder: required ? 'Required for this form' : 'Add if you have it',
              onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                setField(itemId, field.profile_key, event.target.value),
            }
            return (
              <div key={field.profile_key} className="text-sm">
                <label className="block">
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
              </div>
            )
          }
          return (
            <div key={field.profile_key} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">{labelText}</dt>
                <dd className="min-w-0 truncate text-right font-medium text-foreground">
                  {state.values[field.profile_key]?.trim() || field.value}
                </dd>
              </div>
            </div>
          )
        })}
      </dl>

      <FilledPdfView
        source={source}
        values={pdfValues}
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
