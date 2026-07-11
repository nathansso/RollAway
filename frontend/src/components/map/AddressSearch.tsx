import { useEffect, useRef, useState } from 'react'
import { LocationIcon } from '../common/Icons'
import {
  placeDetails,
  placesAutocomplete,
  placesConfigured,
  type PlaceSuggestion,
} from '../../lib/places'
import { useAppStore } from '../../store'

// #14: search + confirm a starting address (Google Places autocomplete). On
// select we resolve coordinates and set the recommendation origin.
export default function AddressSearch() {
  const setStartLocation = useAppStore((state) => state.setStartLocation)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
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
  }, [query])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  if (!placesConfigured()) return null

  const choose = async (suggestion: PlaceSuggestion) => {
    setResolving(true)
    setOpen(false)
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
        Search a starting address
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 shadow-sm focus-within:border-primary">
        <LocationIcon className="h-4 w-4 shrink-0 text-accent" />
        <input
          id="address-search"
          type="text"
          autoComplete="off"
          className="min-h-11 min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
          placeholder={resolving ? 'Locating…' : 'Search a starting address'}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
        />
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
