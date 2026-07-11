import { useState } from 'react'
import { ClockIcon, LocationIcon } from '../common/Icons'
import BrandMark from '../common/BrandMark'
import {
  createCustomWhen,
  createPresetWhen,
  isValidCustomWindow,
  toLocalDate,
} from '../../lib/when'
import { useAppStore } from '../../store'
import type { WhenPreset } from '../../types/contract'

const PRESETS: { value: Exclude<WhenPreset, 'custom'>; label: string }[] = [
  { value: 'today_lunch', label: 'Today lunch' },
  { value: 'tomorrow_dinner', label: 'Tomorrow dinner' },
  { value: 'saturday', label: 'Saturday' },
]

export default function SessionSetup() {
  const when = useAppStore((state) => state.when)
  const setWhen = useAppStore((state) => state.setWhen)
  const locationStatus = useAppStore((state) => state.locationStatus)
  const locationNotice = useAppStore((state) => state.locationNotice)
  const requestLocation = useAppStore((state) => state.requestLocation)
  const recommendationStatus = useAppStore((state) => state.recommendationStatus)
  const recommendationError = useAppStore((state) => state.recommendationError)
  const startRecommendations = useAppStore((state) => state.startRecommendations)
  const openProfileEditor = useAppStore((state) => state.openProfileEditor)
  const [customOpen, setCustomOpen] = useState(when.preset === 'custom')
  const [customDate, setCustomDate] = useState(when.date)
  const [customFrom, setCustomFrom] = useState(when.time_from)
  const [customTo, setCustomTo] = useState(when.time_to)
  const customValid = isValidCustomWindow(customDate, customFrom, customTo)

  const locationLabel =
    locationStatus === 'granted'
      ? 'Live location'
      : locationStatus === 'requesting'
        ? 'Finding live location…'
        : locationStatus === 'denied'
          ? 'Using SoMa · location denied'
          : locationStatus === 'unavailable'
            ? 'Using SoMa · unavailable'
            : locationStatus === 'outside_sf'
              ? 'Using SoMa · outside San Francisco'
              : 'Using SoMa demo origin'

  return (
    <main
      className="onboarding-page pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1.5rem,env(safe-area-inset-top))]"
      aria-labelledby="session-title"
    >
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <BrandMark />
          <button type="button" className="secondary-button" onClick={openProfileEditor}>
            Back / Edit profile
          </button>
        </div>

        <section className="onboarding-card">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            Session setup
          </p>
          <h1 id="session-title" className="mt-2 font-display text-3xl text-foreground sm:text-4xl">
            When are you setting up?
          </h1>
          <p className="mt-2 max-w-xl text-base leading-7 text-muted-foreground">
            Choose this outing’s time and origin. You can change both before finding places.
          </p>

          {recommendationError && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
            >
              {recommendationError}
            </div>
          )}

          <fieldset className="mt-7">
            <legend className="flex items-center gap-2 text-sm font-bold text-foreground">
              <ClockIcon className="h-5 w-5 text-primary" />
              When
            </legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.value}
                  aria-pressed={when.preset === preset.value}
                  onClick={() => {
                    setWhen(createPresetWhen(preset.value))
                    setCustomOpen(false)
                  }}
                  className={`session-choice ${
                    when.preset === preset.value ? 'session-choice--active' : ''
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                aria-expanded={customOpen}
                aria-pressed={when.preset === 'custom'}
                onClick={() => setCustomOpen((open) => !open)}
                className={`session-choice ${
                  when.preset === 'custom' ? 'session-choice--active' : ''
                }`}
              >
                Custom date and time
              </button>
            </div>

            {customOpen && (
              <div className="mt-3 grid gap-3 rounded-2xl border border-border bg-muted p-4 sm:grid-cols-3">
                <label className="text-sm font-semibold text-foreground">
                  Date
                  <input
                    className="form-input"
                    type="date"
                    min={toLocalDate(new Date())}
                    value={customDate}
                    onChange={(event) => setCustomDate(event.target.value)}
                  />
                </label>
                <label className="text-sm font-semibold text-foreground">
                  From
                  <input
                    className="form-input"
                    type="time"
                    value={customFrom}
                    onChange={(event) => setCustomFrom(event.target.value)}
                  />
                </label>
                <label className="text-sm font-semibold text-foreground">
                  To
                  <input
                    className="form-input"
                    type="time"
                    value={customTo}
                    onChange={(event) => setCustomTo(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={!customValid}
                  className="secondary-button sm:col-span-3 disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => {
                    setWhen(createCustomWhen(customDate, customFrom, customTo))
                    setCustomOpen(false)
                  }}
                >
                  Use this window
                </button>
              </div>
            )}
          </fieldset>

          <section className="mt-7 border-t border-border pt-7" aria-labelledby="location-title">
            <div className="flex items-start gap-3">
              <div className="fact-icon" aria-hidden="true">
                <LocationIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="location-title" className="font-display text-xl text-foreground">
                  Start location
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  San Francisco only. Rollaway currently recommends places within the City and
                  County of San Francisco.
                </p>
                <p className="mt-3 text-sm font-bold text-foreground" aria-live="polite">
                  {locationLabel}
                </p>
                {locationNotice && (
                  <p className="mt-1 text-sm text-caution" role="status">
                    {locationNotice}
                  </p>
                )}
                <button
                  type="button"
                  onClick={requestLocation}
                  disabled={locationStatus === 'requesting'}
                  className="secondary-button mt-4 w-full sm:w-auto disabled:cursor-wait disabled:opacity-60"
                >
                  <LocationIcon className="h-4 w-4" />
                  {locationStatus === 'requesting'
                    ? 'Finding live location…'
                    : locationStatus === 'idle'
                      ? 'Use my live location'
                      : 'Try live location again'}
                </button>
              </div>
            </div>
          </section>

          <div className="mt-8 border-t border-border pt-6">
            <button
              type="button"
              className="primary-button w-full"
              disabled={
                recommendationStatus === 'loading' || locationStatus === 'requesting'
              }
              onClick={() => void startRecommendations()}
            >
              Find places to roll
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}
