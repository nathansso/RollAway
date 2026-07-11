import { useMemo, useRef, useState } from 'react'
import { CheckIcon, CloseIcon, FileIcon } from '../common/Icons'
import { buildEasyApplyValues } from './easyApply'
import { useDialogFocus } from '../../lib/useDialogFocus'
import type { PermitChecklistItem, VendorProfile } from '../../types/contract'

const REQUIREMENT_LABELS = {
  auto_filled: 'Auto-filled',
  missing: 'Missing',
  must_verify: 'Must verify',
} as const

export default function EasyApplyModal({
  item,
  profile,
  onClose,
}: {
  item: PermitChecklistItem
  profile: VendorProfile
  onClose: () => void
}) {
  const initialValues = useMemo(() => buildEasyApplyValues(item, profile), [item, profile])
  const [values, setValues] = useState(initialValues)
  const [confirmed, setConfirmed] = useState(false)
  const [ready, setReady] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const complete = item.fields.every((field) => String(values[field.key] ?? '').trim())
  useDialogFocus(ref, onClose)

  return (
    <div className="fixed inset-0 z-[110] flex items-end bg-slate-950/55 sm:items-center sm:p-5">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="easyapply-title"
        className="mx-auto flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-3xl bg-background shadow-2xl outline-none sm:rounded-3xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              EasyApply · Review only
            </p>
            <h2 id="easyapply-title" className="mt-1 font-display text-xl text-foreground">
              {item.title}
            </h2>
          </div>
          <button type="button" className="touch-button" aria-label="Close EasyApply review" onClick={onClose}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          {ready ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-good/15 text-good">
                <CheckIcon className="h-8 w-8" />
              </span>
              <h3 className="mt-4 font-display text-2xl text-foreground">
                Simulated packet ready
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Demo only—nothing was sent to a government agency. Copy these reviewed values into the official form and verify every answer before submission.
              </p>
              <button type="button" className="primary-button mt-5" onClick={onClose}>Return to checklist</button>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-caution/30 bg-caution/10 px-4 py-3 text-sm leading-relaxed text-foreground">
                RollAway prepares a reviewable draft. It does not submit, sign, pay, or make a binding certification.
              </div>
              <div className="mt-4 space-y-4">
                {item.fields.map((field) => (
                  <label key={field.key} className="block text-sm font-semibold text-foreground">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      {field.label}
                      <span className={`field-source field-source--${field.requirement}`}>
                        {REQUIREMENT_LABELS[field.requirement]}
                      </span>
                    </span>
                    {field.key === 'menu' ? (
                      <textarea
                        className="form-input min-h-28 resize-y"
                        value={values[field.key] ?? ''}
                        onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                      />
                    ) : (
                      <input
                        className="form-input"
                        value={values[field.key] ?? ''}
                        onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                        placeholder={field.requirement === 'missing' ? 'Required for this draft' : ''}
                      />
                    )}
                  </label>
                ))}
              </div>
              {!complete && (
                <p role="status" className="mt-3 text-sm font-medium text-destructive">
                  Complete every field, including items marked missing or must verify.
                </p>
              )}
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-white p-4">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 accent-primary"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span className="text-sm leading-relaxed text-foreground">
                  I reviewed these values and understand this creates a simulated-ready demo packet, not a government submission.
                </span>
              </label>
              <button
                type="button"
                disabled={!complete || !confirmed}
                onClick={() => setReady(true)}
                className="primary-button mt-4 w-full disabled:cursor-not-allowed disabled:opacity-45"
              >
                <FileIcon className="h-5 w-5" />
                Prepare simulated packet
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
