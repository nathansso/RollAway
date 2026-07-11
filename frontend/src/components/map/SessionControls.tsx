import { useEffect, useState } from 'react'
import { ChevronIcon, ClockIcon, LocationIcon } from '../common/Icons'
import {
  createCustomWhen,
  createNowWhen,
  isValidCustomWindow,
  toLocalDate,
} from '../../lib/when'
import { useAppStore } from '../../store'
import AddressSearch from './AddressSearch'
import TimeRangeWheel from './TimeRangeWheel'

function formatTime(hhmm: string): { text: string; period: 'AM' | 'PM' } {
  const [h, m] = hhmm.split(':').map(Number)
  const hour = h || 0
  const period = hour < 12 ? 'AM' : 'PM'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return { text: `${h12}:${String(m || 0).padStart(2, '0')}`, period }
}

function dayLabel(date: string): string {
  const now = new Date()
  const today = toLocalDate(now)
  const tomorrow = toLocalDate(new Date(now.getTime() + 24 * 60 * 60 * 1000))
  if (date === today) return 'Today'
  if (date === tomorrow) return 'Tomorrow'
  const parsed = new Date(`${date}T12:00:00`)
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function windowSummary(date: string, from: string, to: string): string {
  const start = formatTime(from)
  const end = formatTime(to)
  const range =
    start.period === end.period
      ? `${start.text}–${end.text} ${end.period}`
      : `${start.text} ${start.period}–${end.text} ${end.period}`
  return `${dayLabel(date)} · ${range}`
}

export default function SessionControls() {
  const when = useAppStore((state) => state.when)
  const setWhen = useAppStore((state) => state.setWhen)
  const locationStatus = useAppStore((state) => state.locationStatus)
  const originLabel = useAppStore((state) => state.originLabel)
  const recommendationStatus = useAppStore((state) => state.recommendationStatus)
  const requestRecommendations = useAppStore((state) => state.requestRecommendations)

  // The wheel drives a local window; "Find spots" commits it and runs the search,
  // so scrubbing the time never re-triggers the full-screen loader on its own.
  const [date, setDate] = useState(when.date)
  const [from, setFrom] = useState(when.time_from)
  const [to, setTo] = useState(when.time_to)
  // #30: time defaults to a compact summary behind a clock; tap to reveal wheel.
  const [timeOpen, setTimeOpen] = useState(false)
  // #30: once a search runs the whole box minimizes to a summary pill.
  const [collapsed, setCollapsed] = useState(recommendationStatus === 'success')
  const valid = isValidCustomWindow(date, from, to)

  useEffect(() => {
    if (recommendationStatus === 'success') {
      setCollapsed(true)
      setTimeOpen(false)
    }
  }, [recommendationStatus])

  const findSpots = () => {
    if (valid) setWhen(createCustomWhen(date, from, to))
    void requestRecommendations()
  }

  const summary = windowSummary(date, from, to)
  const locationText =
    locationStatus === 'address' && originLabel
      ? originLabel
      : locationStatus === 'requesting'
        ? 'Finding you…'
        : locationStatus === 'denied'
          ? 'Using SoMa · location denied'
          : locationStatus === 'unavailable'
            ? 'Using SoMa · unavailable'
            : locationStatus === 'outside_sf'
              ? 'Using SoMa · outside SF'
              : 'Live location'

  // #30: quick presets live inside the expanded time panel, not always-on.
  const nowWhen = createNowWhen()
  const today = toLocalDate(new Date())
  const presets = [
    { key: 'now', label: 'Now', date: nowWhen.date, from: nowWhen.time_from, to: nowWhen.time_to },
    { key: 'lunch', label: 'Lunch', date: today, from: '11:00', to: '14:00' },
    { key: 'dinner', label: 'Dinner', date: today, from: '17:00', to: '21:00' },
  ]

  if (collapsed) {
    return (
      <section aria-label="Recommendation setup" className="map-controls">
        <button
          type="button"
          className="map-controls__pill"
          onClick={() => setCollapsed(false)}
          aria-label="Edit search time and location"
        >
          <ClockIcon className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 truncate text-xs font-bold text-foreground">{summary}</span>
          <span className="text-muted-foreground" aria-hidden="true">·</span>
          <LocationIcon className="h-4 w-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground">
            {locationText}
          </span>
          <span className="shrink-0 text-[11px] font-bold text-primary">Edit</span>
        </button>
      </section>
    )
  }

  return (
    <section aria-label="Recommendation setup" className="map-controls">
      <button
        type="button"
        className="map-controls__time-toggle"
        onClick={() => setTimeOpen((open) => !open)}
        aria-expanded={timeOpen}
        aria-label={`Change time window — ${summary}`}
      >
        <ClockIcon className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-foreground">{summary}</span>
        <ChevronIcon
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${timeOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {timeOpen && (
        <div className="mt-2 rounded-xl border border-border bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => {
                const active =
                  preset.date === date && preset.from === from && preset.to === to
                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => {
                      setDate(preset.date)
                      setFrom(preset.from)
                      setTo(preset.to)
                    }}
                    aria-pressed={active}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${
                      active ? 'bg-primary text-white' : 'bg-muted text-foreground'
                    }`}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>
            <input
              aria-label="Date"
              className="compact-input w-auto"
              type="date"
              min={toLocalDate(new Date())}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="mt-2">
            <TimeRangeWheel
              from={from}
              to={to}
              onChange={(nextFrom, nextTo) => {
                setFrom(nextFrom)
                setTo(nextTo)
              }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            End times before start times are treated as overnight windows.
          </p>
        </div>
      )}

      <div className="mt-2">
        <AddressSearch />
      </div>

      <div className="mt-2">
        <button
          type="button"
          onClick={findSpots}
          disabled={
            !valid || recommendationStatus === 'loading' || locationStatus === 'requesting'
          }
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-md transition hover:bg-primary/90 disabled:opacity-60"
        >
          <ClockIcon className="h-4 w-4" />
          Find spots
        </button>
      </div>
    </section>
  )
}
