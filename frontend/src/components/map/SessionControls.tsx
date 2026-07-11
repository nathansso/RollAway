import { useState } from 'react'
import { ClockIcon, LocationIcon } from '../common/Icons'
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

export default function SessionControls() {
  const when = useAppStore((state) => state.when)
  const setWhen = useAppStore((state) => state.setWhen)
  const locationStatus = useAppStore((state) => state.locationStatus)
  const requestLocation = useAppStore((state) => state.requestLocation)
  const recommendationStatus = useAppStore((state) => state.recommendationStatus)
  const requestRecommendations = useAppStore((state) => state.requestRecommendations)
  const [customOpen, setCustomOpen] = useState(false)
  const [customDate, setCustomDate] = useState(when.date)
  const [customFrom, setCustomFrom] = useState(when.time_from)
  const [customTo, setCustomTo] = useState(when.time_to)
  const customValid = isValidCustomWindow(customDate, customFrom, customTo)

  const locationLabel =
    locationStatus === 'granted'
      ? 'Live location'
      : locationStatus === 'requesting'
        ? 'Finding you…'
        : locationStatus === 'denied'
          ? 'Using SoMa · location denied'
          : locationStatus === 'unavailable'
            ? 'Using SoMa · unavailable'
            : 'Use my location'

  return (
    <section aria-label="Recommendation setup" className="map-controls">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.value}
            aria-pressed={when.preset === preset.value}
            onClick={() => {
              setWhen(createPresetWhen(preset.value))
              setCustomOpen(false)
            }}
            className={`choice-chip ${when.preset === preset.value ? 'choice-chip--active' : ''}`}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          aria-expanded={customOpen}
          aria-pressed={when.preset === 'custom'}
          onClick={() => setCustomOpen((open) => !open)}
          className={`choice-chip ${when.preset === 'custom' ? 'choice-chip--active' : ''}`}
        >
          Custom
        </button>
      </div>

      {customOpen && (
        <div className="mt-2 grid grid-cols-3 gap-2 rounded-xl border border-border bg-white p-2 shadow-md">
          <label className="col-span-3 text-xs font-semibold text-foreground sm:col-span-1">
            Date
            <input className="compact-input" type="date" min={toLocalDate(new Date())} value={customDate} onChange={(event) => setCustomDate(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-foreground">
            From
            <input className="compact-input" type="time" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-foreground">
            To
            <input className="compact-input" type="time" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
          </label>
          <button
            type="button"
            disabled={!customValid}
            className="secondary-button col-span-3 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => {
              setWhen(createCustomWhen(customDate, customFrom, customTo))
              setCustomOpen(false)
            }}
          >
            Use this window
          </button>
          <p className="col-span-3 text-[11px] text-muted-foreground">
            End times before start times are treated as overnight windows.
          </p>
        </div>
      )}

      <div className="mt-2 flex items-stretch gap-2">
        <button
          type="button"
          onClick={requestLocation}
          disabled={locationStatus === 'requesting'}
          className="inline-flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-white px-3 text-left text-xs font-semibold text-foreground shadow-sm disabled:opacity-65"
        >
          <LocationIcon className="h-4 w-4 shrink-0 text-accent" />
          <span className="truncate">{locationLabel}</span>
        </button>
        <button
          type="button"
          onClick={() => void requestRecommendations()}
          disabled={
            recommendationStatus === 'loading' || locationStatus === 'requesting'
          }
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-md transition hover:bg-primary/90 disabled:opacity-60"
        >
          <ClockIcon className="h-4 w-4" />
          Find spots
        </button>
      </div>
    </section>
  )
}
