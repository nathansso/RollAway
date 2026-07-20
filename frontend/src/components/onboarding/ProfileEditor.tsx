import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronIcon, CloseIcon, FileIcon, PermitIcon } from '../common/Icons'
import BrandMark from '../common/BrandMark'
import { SAMPLE_MENUS } from '../../fixtures/sampleMenus'
import { derivePriceTier, formatUsPhone, formatUsPhoneLocal, parseMenu } from '../../lib/profile'
import { inferCuisine } from '../../lib/cuisine'
import { apiClient, ApiClientError } from '../../lib/apiClient'
import { extractPdfText, renderPdfFirstPageToPng } from '../../lib/pdfText'
import AddressAutocomplete from '../common/AddressAutocomplete'
import type { AddressParts } from '../../lib/places'
import { useDialogFocus } from '../../lib/useDialogFocus'
import { useAppStore } from '../../store'
import type { CuisineId } from '../../fixtures/sampleMenus'
import type {
  AutofillProfile,
  OperatingWindow,
  VendorProfile,
  VendorType,
} from '../../types/contract'

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

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
  const setActiveTab = useAppStore((state) => state.setActiveTab)
  const appPhase = useAppStore((state) => state.appPhase)
  // Wave 2 (#39/#50): prefill from the auth identity (email) and, on first
  // sign-in, from any pre-auth localStorage profile the user can import.
  const authEmail = useAppStore((state) => state.authEmail)
  const authImportProfile = useAppStore((state) => state.authImportProfile)
  const dismissProfileImport = useAppStore((state) => state.dismissProfileImport)
  const authStatus = useAppStore((state) => state.authStatus)
  const authSignOut = useAppStore((state) => state.authSignOut)
  const seedDraft = (): VendorProfile => {
    if (existing) return existing
    const base = authImportProfile ?? emptyProfile()
    if (authEmail && !base.autofill_profile.email) {
      return { ...base, autofill_profile: { ...base.autofill_profile, email: authEmail } }
    }
    return base
  }
  const [draft, setDraft] = useState<VendorProfile>(seedDraft)
  const [error, setError] = useState('')
  const [menuStatus, setMenuStatus] = useState<'idle' | 'extracting' | 'success' | 'error'>('idle')
  const [menuNotice, setMenuNotice] = useState('')
  const [menuViewOpen, setMenuViewOpen] = useState(false)
  const [menuUrl, setMenuUrl] = useState('')
  // #44: the menu decides the cuisine tag — but only until the vendor overrules
  // it. Once they pick one by hand, a later upload must not silently undo that.
  const [cuisineChosenByHand, setCuisineChosenByHand] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const firstLaunch = existing === null

  // Keep the caret at the end of the phone field while typing so the live
  // reformat (which inserts "(", ")", "-") never scrambles left-to-right entry.
  useEffect(() => {
    const el = phoneRef.current
    if (el && document.activeElement === el) {
      const end = el.value.length
      el.setSelectionRange(end, end)
    }
  }, [draft.autofill_profile.phone])

  useEffect(() => {
    if (!open) return
    setDraft(seedDraft())
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing, authEmail, authImportProfile])

  useDialogFocus(dialogRef, close, Boolean(existing), open)

  const menuItems = useMemo(() => parseMenu(draft.menu.raw), [draft.menu.raw])
  const priceTier = derivePriceTier(menuItems)

  if (!open) return null

  const setContact = (key: keyof AutofillProfile, value: string) =>
    setDraft((current) => ({
      ...current,
      autofill_profile: { ...current.autofill_profile, [key]: value },
    }))

  // #46: fill mailing address + city/state/ZIP together from a chosen Google
  // Places result. Only overwrite a component when Places actually returned one.
  const setAddressParts = (parts: AddressParts) =>
    setDraft((current) => ({
      ...current,
      autofill_profile: {
        ...current.autofill_profile,
        address: parts.line1 || current.autofill_profile.address,
        city: parts.city || current.autofill_profile.city,
        state: parts.state || current.autofill_profile.state,
        postal_code: parts.postal_code || current.autofill_profile.postal_code,
      },
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

  const applyExtraction = async (payload: Parameters<typeof apiClient.extractMenu>[0]) => {
    setMenuStatus('extracting')
    setMenuNotice('Reading your menu…')
    try {
      const { items, plain_text } = await apiClient.extractMenu({
        ...payload,
        vendor_type: draft.vendor_type,
      })
      if (!items.length || !plain_text.trim()) {
        setMenuStatus('error')
        setMenuNotice('No menu items found. Try a clearer photo, a text file, or a menu link.')
        return
      }
      // #44: tag the cuisine from what the menu actually says.
      const detected = cuisineChosenByHand ? null : inferCuisine(plain_text, items)
      setDraft((current) => ({
        ...current,
        cuisine: detected ?? current.cuisine,
        menu: { raw: plain_text, items, price_tier: derivePriceTier(items) },
      }))
      setMenuStatus('success')
      const extracted = `Extracted ${items.length} item${items.length === 1 ? '' : 's'}.`
      const detectedLabel = detected
        ? SAMPLE_MENUS.find((sample) => sample.id === detected)?.label
        : null
      // Say so when we change the tag: a silent edit to a field they already
      // walked past is worse than no detection at all.
      setMenuNotice(
        detectedLabel
          ? `${extracted} Looks like ${detectedLabel} — change the cuisine above if that's off.`
          : extracted,
      )
      setMenuViewOpen(true)
    } catch (extractionError) {
      setMenuStatus('error')
      setMenuNotice(
        extractionError instanceof ApiClientError
          ? extractionError.message
          : 'Menu extraction failed. Try another source.',
      )
    }
  }

  const extractFromFile = async (file?: File) => {
    if (!file) return
    if (file.size > 8_000_000) {
      setMenuStatus('error')
      setMenuNotice('Menu files must be 8 MB or smaller.')
      return
    }
    const isText = file.type.startsWith('text/') || /\.(txt|csv|md)$/i.test(file.name)
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    if (isText) {
      const text = await file.text().catch(() => '')
      await applyExtraction({ input_type: 'text', text })
    } else if (isPdf) {
      // #47: a raw application/pdf data URL is not a valid vision input and 400s.
      // Pull the PDF's text in-browser and send that; for scanned/image-only
      // PDFs (no embedded text) fall back to rasterizing page 1 to a PNG.
      const text = await extractPdfText(file).catch(() => '')
      if (text.trim().length >= 8) {
        await applyExtraction({ input_type: 'text', text })
      } else {
        const image_data_url = await renderPdfFirstPageToPng(file).catch(() => '')
        if (!image_data_url) {
          setMenuStatus('error')
          setMenuNotice('That PDF could not be read. Try an image or paste the menu text.')
          return
        }
        await applyExtraction({ input_type: 'image', image_data_url })
      }
    } else {
      const image_data_url = await fileToDataUrl(file).catch(() => '')
      if (!image_data_url) {
        setMenuStatus('error')
        setMenuNotice('That file could not be read.')
        return
      }
      await applyExtraction({ input_type: 'image', image_data_url })
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
          <div className="flex items-center gap-2">
            {authStatus === 'signed_in' && (
              <button
                type="button"
                onClick={() => void authSignOut()}
                className="text-xs font-semibold text-muted-foreground underline"
              >
                Sign out
              </button>
            )}
            {existing && (
              <button type="button" onClick={close} aria-label="Close profile editor" className="touch-button">
                <CloseIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </header>

        <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {!existing && authImportProfile && (
            <div className="mb-5 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
              <p className="font-semibold text-foreground">Prefilled from your saved profile</p>
              <p className="mt-0.5 text-muted-foreground">
                We found a profile saved on this device and filled it in — edit anything below.
              </p>
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-primary underline"
                onClick={() => {
                  const fresh = emptyProfile()
                  if (authEmail) fresh.autofill_profile.email = authEmail
                  setDraft(fresh)
                  dismissProfileImport()
                }}
              >
                Start fresh instead
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              {error}
            </div>
          )}

          {existing && appPhase === 'ready' && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('permits')
                close()
              }}
              className="secondary-button mb-5 w-full"
            >
              <PermitIcon className="h-5 w-5 text-primary" />
              Permit checklist
              <ChevronIcon className="h-4 w-4" />
            </button>
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
                onChange={(event) => {
                  setCuisineChosenByHand(true)
                  setDraft((current) => ({
                    ...current,
                    cuisine: event.target.value as CuisineId,
                  }))
                }}
              >
                {SAMPLE_MENUS.map((sample) => (
                  <option key={sample.id} value={sample.id}>
                    {sample.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Menu"
              required
              hint="Upload a photo, PDF, or text file of your menu — or paste a link. Rollaway reads it into items and prices with Gradient AI."
            >
              <div className="mt-1 grid gap-2">
                <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-semibold text-foreground transition hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
                  <FileIcon className="h-4 w-4 text-primary" />
                  Upload menu (image, PDF, or text)
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/*,application/pdf,.txt,.csv,.md,text/plain,text/csv"
                    onChange={(event) => void extractFromFile(event.target.files?.[0])}
                  />
                </label>
                <div className="flex gap-2">
                  <input
                    aria-label="Menu website link"
                    className={fieldClass}
                    type="url"
                    inputMode="url"
                    placeholder="…or paste a menu link (https://)"
                    value={menuUrl}
                    onChange={(event) => setMenuUrl(event.target.value)}
                  />
                  <button
                    type="button"
                    className="secondary-button shrink-0"
                    disabled={!menuUrl.trim() || menuStatus === 'extracting'}
                    onClick={() =>
                      void applyExtraction({ input_type: 'url', url: menuUrl.trim() })
                    }
                  >
                    Extract
                  </button>
                </div>
              </div>
            </Field>

            {menuStatus !== 'idle' && (
              <p
                role="status"
                aria-live="polite"
                className={`text-sm font-semibold ${
                  menuStatus === 'success'
                    ? 'text-good'
                    : menuStatus === 'error'
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                }`}
              >
                {menuNotice}
              </p>
            )}

            {draft.menu.raw.trim() && (
              <div className="rounded-md border border-border bg-white">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm font-semibold text-foreground"
                  aria-expanded={menuViewOpen}
                  onClick={() => setMenuViewOpen((open) => !open)}
                >
                  <span>
                    View extracted menu ({menuItems.length} item{menuItems.length === 1 ? '' : 's'})
                  </span>
                  <ChevronIcon
                    className={`h-4 w-4 transition ${menuViewOpen ? 'rotate-90' : ''}`}
                  />
                </button>
                {menuViewOpen && (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-border px-4 py-3 font-mono text-xs text-muted-foreground">
                    {draft.menu.raw}
                  </pre>
                )}
              </div>
            )}

            <span className="w-fit rounded-md bg-muted px-3 py-1.5 text-sm text-foreground">
              Estimated price tier: <strong>{priceTier}</strong>
            </span>
          </section>

          <section className="form-section">
            <h2 className="section-title">Travel & schedule</h2>
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
            {/* #45: permit-status is no longer asked during onboarding. The field
                stays on the profile (defaulted to 'not_started') for the permit
                checklist/markers; the checklist tracks real status downstream. */}
          </section>

          <section className="form-section">
            <h2 className="section-title">User info</h2>
            <p className="text-sm text-muted-foreground">We use these to pre-fill reviewable drafts. Rollaway never submits a binding application automatically.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Owner / contact name" required><input className={fieldClass} autoComplete="name" value={draft.autofill_profile.owner_name} onChange={(e) => setContact('owner_name', e.target.value)} /></Field>
              <Field label="Business name" required><input className={fieldClass} autoComplete="organization" value={draft.autofill_profile.business_name} onChange={(e) => setContact('business_name', e.target.value)} /></Field>
              <Field label="Email" required><input className={fieldClass} type="text" inputMode="email" autoComplete="email" value={draft.autofill_profile.email} onChange={(e) => setContact('email', e.target.value)} /></Field>
              <Field label="Phone" required>
                <div className="mt-1 flex min-h-11 items-center rounded-md border border-border bg-white pl-3 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <span className="select-none pr-1 text-base font-semibold text-muted-foreground" aria-hidden="true">
                    +1
                  </span>
                  <input
                    ref={phoneRef}
                    className="min-h-11 w-full border-0 bg-transparent px-1 text-base text-foreground outline-none"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="(415) 555-0132"
                    value={formatUsPhoneLocal(draft.autofill_profile.phone.replace(/^\+1\s*/, ''))}
                    onChange={(e) => setContact('phone', formatUsPhone(e.target.value))}
                  />
                </div>
              </Field>
            </div>
            <Field label="Mailing address" required>
              <AddressAutocomplete
                className={fieldClass}
                autoComplete="street-address"
                value={draft.autofill_profile.address}
                onChange={(value) => setContact('address', value)}
                onResolved={(place) => setAddressParts(place.parts)}
              />
            </Field>
            <div className="grid grid-cols-[1.5fr_.6fr_1fr] gap-2">
              <Field label="City"><input className={fieldClass} autoComplete="address-level2" value={draft.autofill_profile.city} onChange={(e) => setContact('city', e.target.value)} /></Field>
              <Field label="State"><input className={fieldClass} autoComplete="address-level1" value={draft.autofill_profile.state} onChange={(e) => setContact('state', e.target.value)} /></Field>
              <Field label="ZIP"><input className={fieldClass} inputMode="numeric" autoComplete="postal-code" value={draft.autofill_profile.postal_code} onChange={(e) => setContact('postal_code', e.target.value)} /></Field>
            </div>
          </section>

          <div className="sticky bottom-0 -mx-5 mt-6 border-t border-border bg-background/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur">
            <button type="submit" className="primary-button w-full">
              {existing ? 'Save profile changes' : 'Find my spots'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
