import { useState } from 'react'
import { ClockIcon, LocationIcon } from '../common/Icons'
import { createCustomWhen, isValidCustomWindow, toLocalDate } from '../../lib/when'
import { useAppStore } from '../../store'
import AddressSearch from './AddressSearch'
import TimeRangeWheel from './TimeRangeWheel'

export default function SessionControls() {
  const when = useAppStore((state) => state.when)
  const setWhen = useAppStore((state) => state.setWhen)
  const locationStatus = useAppStore((state) => state.locationStatus)
  const originLabel = useAppStore((state) => state.originLabel)
  const requestLocation = useAppStore((state) => state.requestLocation)
  const recommendationStatus = useAppStore((state) => state.recommendationStatus)
  const requestRecommendations = useAppStore((state) => state.requestRecommendations)

  // The wheel drives a local window; "Find spots" commits it and runs the search,
  // so scrubbing the time never re-triggers the full-screen loader on its own.
  const [date, setDate] = useState(when.date)
  const [from, setFrom] = useState(when.time_from)
  const [to, setTo] = useState(when.time_to)
  const valid = isValidCustomWindow(date, from, to)

  const findSpots = () => {
    if (valid) setWhen(createCustomWhen(date, from, to))
    void requestRecommendations()
  }

  const locationLabel =
    locationStatus === 'address' && originLabel
      ? originLabel
      : locationStatus === 'granted'
        ? 'Live location'
        : locationStatus === 'requesting'
          ? 'Finding you…'
          : locationStatus === 'denied'
            ? 'Using SoMa · location denied'
            : locationStatus === 'unavailable'
              ? 'Using SoMa · unavailable'
              : locationStatus === 'outside_sf'
                ? 'Using SoMa · outside SF'
                : 'Use my location'

  return (
    <section aria-label="Recommendation setup" className="map-controls">
      <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <ClockIcon className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-xs font-bold text-foreground">Setting up</span>
          <input
            aria-label="Date"
            className="compact-input ml-auto w-auto"
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

      <div className="mt-2">
        <AddressSearch />
      </div>

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
          onClick={findSpots}
          disabled={
            !valid || recommendationStatus === 'loading' || locationStatus === 'requesting'
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
