import { useAppStore } from '../../store'
import type { FilledForm } from '../../types/contract'
import {
  EMPTY_FORM_STATE,
  RENEWAL_DAYS,
  allFieldsComplete,
  daysUntilRenewal,
  filledFormExportRows,
  formStatus,
  isFieldOutstanding,
} from './permitForms'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Open a printable/exportable representation of the partially-filled form in a
// new window. Outstanding fields are kept and marked — never invented. Returns
// false when the window can't be opened (popup blocked / non-browser env).
function openExportDocument(form: FilledForm, rows: ReturnType<typeof filledFormExportRows>): boolean {
  if (typeof window === 'undefined' || typeof window.open !== 'function') return false
  const win = window.open('', '_blank', 'noopener,noreferrer')
  if (!win) return false
  const rowHtml = rows
    .map(
      (row) =>
        `<tr><th scope="row">${escapeHtml(row.label)}</th><td class="${
          row.provided ? 'filled' : 'todo'
        }">${row.provided ? escapeHtml(row.value) : '— to complete —'}</td></tr>`,
    )
    .join('')
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
      form.form,
    )} — Rollaway record</title><style>` +
      'body{font:15px/1.5 system-ui,sans-serif;color:#111;margin:2rem;max-width:44rem}' +
      'h1{font-size:1.4rem;margin:0 0 .25rem}.agency{color:#555;margin:0 0 1.25rem}' +
      'table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.55rem .5rem;border-bottom:1px solid #ddd;vertical-align:top}' +
      'th{width:44%;color:#333;font-weight:600}td.todo{color:#a15c00;font-style:italic}' +
      '.note{margin-top:1.5rem;padding:.85rem 1rem;background:#fff7ed;border:1px solid #fed7aa;border-radius:.6rem;font-size:.85rem;color:#7c2d12}' +
      'a{color:#1d4ed8}</style></head><body>' +
      `<h1>${escapeHtml(form.form)}</h1><p class="agency">${escapeHtml(form.agency)}</p>` +
      `<p><a href="${escapeHtml(form.form_url)}">Official form (${escapeHtml(form.form_url)})</a></p>` +
      `<table><tbody>${rowHtml}</tbody></table>` +
      '<p class="note"><strong>Guidance, not legal advice.</strong> This is a personal record pre-filled from your profile. ' +
      'Copy these values onto the official agency form and verify every answer before submitting. Rollaway does not file it for you.</p>' +
      '</body></html>',
  )
  win.document.close()
  win.focus()
  if (typeof win.print === 'function') win.print()
  return true
}

export default function FilledFormWorkflow({
  itemId,
  form,
}: {
  itemId: string
  form: FilledForm
}) {
  const state = useAppStore((s) => s.permitForms[itemId]) ?? EMPTY_FORM_STATE
  const setField = useAppStore((s) => s.setPermitFormField)
  const exportForm = useAppStore((s) => s.exportPermitForm)
  const setSubmission = useAppStore((s) => s.setPermitFormSubmission)

  const status = formStatus(form, state)
  const complete = allFieldsComplete(form, state)
  const days = daysUntilRenewal(state)

  const handleExport = () => {
    openExportDocument(form, filledFormExportRows(form, state))
    exportForm(itemId)
  }

  const statusBadge = {
    in_progress: { text: 'In progress', className: 'bg-caution/15 text-caution' },
    ready_to_export: { text: 'Ready to export', className: 'bg-primary/10 text-primary' },
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
          return (
            <div key={field.profile_key} className="text-sm">
              {outstanding ? (
                <label className="block">
                  <span className="text-muted-foreground">{field.label}</span>
                  <input
                    className="form-input mt-1 py-1 text-sm"
                    value={state.values[field.profile_key] ?? ''}
                    onChange={(event) => setField(itemId, field.profile_key, event.target.value)}
                    placeholder="Add for your record"
                    aria-label={`${field.label} (add to complete this form)`}
                  />
                </label>
              ) : (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-muted-foreground">{field.label}</dt>
                  <dd className="min-w-0 truncate text-right font-medium text-foreground">
                    {state.values[field.profile_key]?.trim() || field.value}
                  </dd>
                </div>
              )}
            </div>
          )
        })}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="easyapply-button"
          disabled={!complete}
          onClick={handleExport}
        >
          {state.exported ? 'Re-export filled form' : 'Export filled form'}
          <span className="sr-only"> for {form.form}</span>
        </button>
        {!complete && (
          <span className="text-xs text-muted-foreground">
            Fill every field to export.
          </span>
        )}
      </div>

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
