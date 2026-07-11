import { useEffect, useMemo, useRef, useState } from 'react'
import { CloseIcon } from '../common/Icons'
import BrandMark from '../common/BrandMark'
import { SAMPLE_MENUS, sampleMenuText } from '../../fixtures/sampleMenus'
import { derivePriceTier, parseMenu } from '../../lib/profile'
import { useDialogFocus } from '../../lib/useDialogFocus'
import { useAppStore } from '../../store'
import type { CuisineId } from '../../fixtures/sampleMenus'
import type {
  AutofillProfile,
  DayCode,
  OperatingWindow,
  VendorProfile,
  VendorType,
} from '../../types/contract'

const EMPTY_CONTACT: AutofillProfile = {
  owner_name: '',
  business_name: '',
  email: '',
  phone: '',
  address: '',
  city: 'San Francisco',
  state: 'CA',
  postal_code: '',
}

const DEFAULT_WINDOW: OperatingWindow = {
  day: 'fri',
  time_from: '11:00',
  time_to: '14:00',
}

function emptyProfile(): VendorProfile {
  return {
    schema_version: 1,
    vendor_type: 'truck',
    cuisine: 'american',
    menu: { raw: '', items: [], price_tier: '$' },
    home_base: { label: '', point: null },
    max_travel: { value: 25, unit: 'minutes' },
    operating_windows: [DEFAULT_WINDOW],
    permit_status: 'not_started',
    autofill_profile: EMPTY_CONTACT,
  }
}

const fieldClass =
  'mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3 py-2 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20'

function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  hint?: string
}) {
  return (
    <label className="block text-sm font-semibold text-foreground">
      {label} {required && <span className="text-destructive">*</span>}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-muted-foreground">{hint}</span>}
    </label>
  )
}

export default function ProfileEditor() {
  const open = useAppStore((state) => state.profileEditorOpen)
  const existing = useAppStore((state) => state.profile)
  const close = useAppStore((state) => state.closeProfileEditor)
  const saveProfile = useAppStore((state) => state.saveProfile)
  const [draft, setDraft] = useState<VendorProfile>(() => existing ?? emptyProfile())
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const firstLaunch = existing === null

  useEffect(() => {
    if (!open) return
    setDraft(existing ?? emptyProfile())
    setError('')
  }, [open, existing])

  useDialogFocus(dialogRef, close, Boolean(existing), open)

  const menuItems = useMemo(() => parseMenu(draft.menu.raw), [draft.menu.raw])
  const priceTier = derivePriceTier(menuItems)

  if (!open) return null

  const setContact = (key: keyof AutofillProfile, value: string) =>
    setDraft((current) => ({
      ...current,
      autofill_profile: { ...current.autofill_profile, [key]: value },
    }))

  const setWindow = (index: number, patch: Partial<OperatingWindow>) =>
    setDraft((current) => ({
      ...current,
      operating_windows: current.operating_windows.map((window, windowIndex) =>
        windowIndex === index ? { ...window, ...patch } : window,
      ),
    }))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const profile: VendorProfile = {
      ...draft,
      menu: { raw: draft.menu.raw.trim(), items: menuItems, price_tier: priceTier },
    }
    if (!saveProfile(profile)) {
      setError('Complete every required field and enter a valid email address.')
      dialogRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const uploadMenu = async (file?: File) => {
    if (!file) return
    if (file.size > 500_000) {
      setError('Menu files must be 500 KB or smaller.')
      return
    }
    try {
      const raw = await file.text()
      setDraft((current) => ({ ...current, menu: { ...current.menu, raw } }))
    } catch {
      setError('That file could not be read. Paste the menu text instead.')
    }
  }

  return (
    <div
      className={
        firstLaunch
          ? 'onboarding-page pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]'
          : 'fixed inset-0 z-[100] bg-slate-950/55 pb-0 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-0 backdrop-blur-sm sm:pb-5 sm:pt-5'
      }
    >
      <div
        ref={dialogRef}
        role={firstLaunch ? 'main' : 'dialog'}
        aria-modal={firstLaunch ? undefined : 'true'}
        aria-labelledby="profile-title"
        tabIndex={-1}
        className={
          firstLaunch
            ? 'mx-auto flex min-h-dvh w-full max-w-3xl flex-col bg-background outline-none'
            : 'mx-auto flex h-full w-full max-w-2xl flex-col overflow-hidden bg-background outline-none sm:h-[min(900px,100%)] sm:rounded-3xl sm:shadow-2xl'
        }
      >
        <header className="flex items-start justify-between gap-4 border-b border-border bg-white px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div>
            {existing ? (
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                Vendor profile
              </p>
            ) : (
              <BrandMark compact />
            )}
            <h1 id="profile-title" className="mt-1 font-display text-2xl text-foreground">
              {existing ? 'Update your setup' : 'Tell us about your business'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Stored only on this device. Used to personalize spots and permit forms.
            </p>
          </div>
          {existing && (
            <button type="button" onClick={close} aria-label="Close profile editor" className="touch-button">
              <CloseIcon className="h-5 w-5" />
            </button>
          )}
        </header>

        <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {error && (
            <div role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              {error}
            </div>
          )}

          <section className="form-section">
            <h2 className="section-title">Your operation</h2>
            <Field label="Vendor type" required>
              <select
                className={fieldClass}
                value={draft.vendor_type}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    vendor_type: event.target.value as VendorType,
                  }))
                }
              >
                <option value="truck">Food truck</option>
                <option value="trailer">Trailer</option>
                <option value="pushcart_cooking">Pushcart · cooking</option>
                <option value="pushcart_nocook">Pushcart · no cooking</option>
              </select>
            </Field>
            <Field label="Cuisine" required>
              <select
                className={fieldClass}
                value={draft.cuisine}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    cuisine: event.target.value as CuisineId,
                  }))
                }
              >
                {SAMPLE_MENUS.map((sample) => (
                  <option key={sample.id} value={sample.id}>
                    {sample.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Menu" required hint="Paste text or upload a plain-text-compatible file. Raw text stays on this device.">
              <textarea
                className={`${fieldClass} min-h-32 resize-y`}
                value={draft.menu.raw}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    menu: { ...current.menu, raw: event.target.value },
                  }))
                }
                placeholder={'Al pastor taco $5\nVeggie burrito $11\nHorchata $4'}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    menu: { ...current.menu, raw: sampleMenuText(current.cuisine) },
                  }))
                }
              >
                Use sample menu
              </button>
              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-border bg-white px-4 text-sm font-semibold text-foreground hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
                Upload menu file
                <input
                  className="sr-only"
                  type="file"
                  accept=".txt,.csv,.md,text/plain,text/csv"
                  onChange={(event) => void uploadMenu(event.target.files?.[0])}
                />
              </label>
              <span className="rounded-md bg-muted px-3 py-1.5 text-sm text-foreground">
                Estimated price tier: <strong>{priceTier}</strong>
              </span>
            </div>
            {menuItems.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Parsed {menuItems.length} menu item{menuItems.length === 1 ? '' : 's'} for display and competition matching.
              </p>
            )}
          </section>

          <section className="form-section">
            <h2 className="section-title">Travel & schedule</h2>
            <Field label="Home base or neighborhood" required>
              <input
                className={fieldClass}
                value={draft.home_base.label}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    home_base: { ...current.home_base, label: event.target.value },
                  }))
                }
                placeholder="Mission District"
              />
            </Field>
            <div className="grid grid-cols-[1fr_1.2fr] gap-3">
              <Field label="Maximum travel" required>
                <input
                  className={fieldClass}
                  type="number"
                  min="1"
                  max="120"
                  value={draft.max_travel.value}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      max_travel: { ...current.max_travel, value: Number(event.target.value) },
                    }))
                  }
                />
              </Field>
              <Field label="Travel unit">
                <select
                  className={fieldClass}
                  value={draft.max_travel.unit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      max_travel: {
                        ...current.max_travel,
                        unit: event.target.value as 'minutes' | 'miles',
                      },
                    }))
                  }
                >
                  <option value="minutes">minutes</option>
                  <option value="miles">miles</option>
                </select>
              </Field>
            </div>
            <fieldset>
              <legend className="text-sm font-semibold">Operating windows</legend>
              <p className="mt-1 text-xs text-muted-foreground">
                These align with restaurant competition day, time_from, and time_to.
              </p>
              <div className="mt-2 space-y-2">
                {draft.operating_windows.map((window, index) => (
                  <div key={index} className="grid grid-cols-3 gap-2 rounded-xl bg-muted p-2">
                    <select className={fieldClass} aria-label={`Operating day ${index + 1}`} value={window.day} onChange={(e) => setWindow(index, { day: e.target.value as DayCode })}>
                      {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as DayCode[]).map((day) => <option key={day} value={day}>{day.toUpperCase()}</option>)}
                    </select>
                    <input className={fieldClass} aria-label={`Start time ${index + 1}`} type="time" value={window.time_from} onChange={(e) => setWindow(index, { time_from: e.target.value })} />
                    <input className={fieldClass} aria-label={`End time ${index + 1}`} type="time" value={window.time_to} onChange={(e) => setWindow(index, { time_to: e.target.value })} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <button type="button" className="secondary-button" onClick={() => setDraft((current) => ({ ...current, operating_windows: [...current.operating_windows, DEFAULT_WINDOW] }))}>Add window</button>
                {draft.operating_windows.length > 1 && <button type="button" className="secondary-button" onClick={() => setDraft((current) => ({ ...current, operating_windows: current.operating_windows.slice(0, -1) }))}>Remove last</button>}
              </div>
            </fieldset>
            <Field label="Permit status" required>
              <select className={fieldClass} value={draft.permit_status} onChange={(event) => setDraft((current) => ({ ...current, permit_status: event.target.value as VendorProfile['permit_status'] }))}>
                <option value="not_started">Not started</option>
                <option value="researching">Researching requirements</option>
                <option value="in_progress">Applications in progress</option>
                <option value="permitted">Currently permitted</option>
              </select>
            </Field>
          </section>

          <section className="form-section">
            <h2 className="section-title">EasyApply details</h2>
            <p className="text-sm text-muted-foreground">We use these to pre-fill reviewable drafts. Rollaway never submits a binding application automatically.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Owner / contact name" required><input className={fieldClass} autoComplete="name" value={draft.autofill_profile.owner_name} onChange={(e) => setContact('owner_name', e.target.value)} /></Field>
              <Field label="Business name" required><input className={fieldClass} autoComplete="organization" value={draft.autofill_profile.business_name} onChange={(e) => setContact('business_name', e.target.value)} /></Field>
              <Field label="Email" required><input className={fieldClass} type="email" autoComplete="email" value={draft.autofill_profile.email} onChange={(e) => setContact('email', e.target.value)} /></Field>
              <Field label="Phone" required><input className={fieldClass} type="tel" autoComplete="tel" value={draft.autofill_profile.phone} onChange={(e) => setContact('phone', e.target.value)} /></Field>
            </div>
            <Field label="Mailing address" required><input className={fieldClass} autoComplete="street-address" value={draft.autofill_profile.address} onChange={(e) => setContact('address', e.target.value)} /></Field>
            <div className="grid grid-cols-[1.5fr_.6fr_1fr] gap-2">
              <Field label="City"><input className={fieldClass} autoComplete="address-level2" value={draft.autofill_profile.city} onChange={(e) => setContact('city', e.target.value)} /></Field>
              <Field label="State"><input className={fieldClass} autoComplete="address-level1" value={draft.autofill_profile.state} onChange={(e) => setContact('state', e.target.value)} /></Field>
              <Field label="ZIP"><input className={fieldClass} inputMode="numeric" autoComplete="postal-code" value={draft.autofill_profile.postal_code} onChange={(e) => setContact('postal_code', e.target.value)} /></Field>
            </div>
          </section>

          <div className="sticky bottom-0 -mx-5 mt-6 border-t border-border bg-background/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur">
            <button type="submit" className="primary-button w-full">
              {existing ? 'Save profile changes' : 'Continue to session setup'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
