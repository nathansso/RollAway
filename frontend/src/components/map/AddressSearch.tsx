import { useEffect, useRef, useState } from 'react'
import { LocationIcon } from '../common/Icons'
import {
  placeDetails,
  placesAutocomplete,
  placesConfigured,
  type PlaceSuggestion,
} from '../../lib/places'
import { useAppStore } from '../../store'

// #30: one location bar. The pin means "use my live location" (the default);
// typing searches a different starting address (Google Places autocomplete),
// and confirming a suggestion switches the bar to that resolved address.
export default function AddressSearch() {
  const setStartLocation = useAppStore((state) => state.setStartLocation)
  const requestLocation = useAppStore((state) => state.requestLocation)
  const locationStatus = useAppStore((state) => state.locationStatus)
  const originLabel = useAppStore((state) => state.originLabel)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const canSearch = placesConfigured()

  useEffect(() => {
    if (!canSearch) return
    const trimmed = query.trim()
    if (trimmed.length < 3) {
      setSuggestions([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const results = await placesAutocomplete(trimmed, controller.signal)
        setSuggestions(results)
        setOpen(true)
        setError(null)
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([])
          setError('Address search is unavailable right now.')
        }
      }
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, canSearch])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  // The resolved-origin label shown when the user isn't actively typing.
  const locationLabel =
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
  const usingLive = locationStatus !== 'address'

  const useLive = () => {
    setQuery('')
    setSuggestions([])
    setOpen(false)
    setError(null)
    void requestLocation()
  }

  const choose = async (suggestion: PlaceSuggestion) => {
    setResolving(true)
    setOpen(false)
    setFocused(false)
    try {
      const resolved = await placeDetails(suggestion.placeId)
      if (resolved) {
        setStartLocation(resolved.point, resolved.address || suggestion.primary)
        setQuery('')
        setError(null)
      } else {
        setError('Could not locate that address.')
      }
    } catch {
      setError('Could not locate that address.')
    } finally {
      setResolving(false)
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <label className="sr-only" htmlFor="address-search">
        Starting location — pin uses live location, or type to search an address
      </label>
      <div className="location-bar flex items-center gap-2 rounded-xl border border-border bg-white px-2 shadow-sm focus-within:border-primary">
        <button
          type="button"
          onClick={useLive}
          aria-label="Use my live location"
          aria-pressed={usingLive}
          className={`location-bar__pin ${usingLive ? 'is-live' : ''}`}
        >
          <LocationIcon className="h-4 w-4" />
        </button>
        <div className="relative min-w-0 flex-1">
          <input
            id="address-search"
            type="text"
            autoComplete="off"
            disabled={!canSearch}
            className="min-h-11 w-full min-w-0 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground disabled:cursor-default"
            placeholder="Search a starting address"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => {
              setFocused(true)
              if (suggestions.length > 0) setOpen(true)
            }}
            onBlur={() => setFocused(false)}
          />
          {query === '' && !focused && (
            // Cover the placeholder with the active origin when not typing.
            <span className="location-bar__value pointer-events-none absolute inset-0 flex items-center truncate bg-white pr-2 text-sm font-semibold text-foreground">
              {resolving ? 'Locating…' : locationLabel}
            </span>
          )}
        </div>
        {locationStatus === 'address' && (
          <button
            type="button"
            onClick={useLive}
            aria-label="Reset to live location"
            className="shrink-0 rounded-md px-2 py-1 text-[11px] font-bold text-accent hover:bg-muted"
          >
            Live
          </button>
        )}
      </div>
      {error && (
        <p className="mt-1 text-[11px] font-medium text-destructive" role="status">
          {error}
        </p>
      )}
      {open && suggestions.length > 0 && (
        <ul
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-border bg-white shadow-lg"
          role="listbox"
          aria-label="Address suggestions"
        >
          {suggestions.map((suggestion) => (
            <li key={suggestion.placeId}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted"
                onClick={() => void choose(suggestion)}
              >
                <span className="text-sm font-semibold text-foreground">
                  {suggestion.primary}
                </span>
                {suggestion.secondary && (
                  <span className="text-xs text-muted-foreground">
                    {suggestion.secondary}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
