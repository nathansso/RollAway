import { useEffect, useRef, useState } from 'react'
import {
  placeDetails,
  placesAutocomplete,
  placesConfigured,
  type PlaceSuggestion,
  type ResolvedPlace,
} from '../../lib/places'

// #46: reusable Google Places autocomplete for a plain address text field
// (e.g. the onboarding mailing address). Store-agnostic — the parent owns the
// value and decides what to do with the resolved, structured address parts.
// When Places isn't configured it degrades to an ordinary text input.
export default function AddressAutocomplete({
  id,
  value,
  onChange,
  onResolved,
  className,
  placeholder = 'Start typing an address',
  autoComplete = 'off',
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  onResolved: (place: ResolvedPlace) => void
  className?: string
  placeholder?: string
  autoComplete?: string
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [resolving, setResolving] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  // While resolving a chosen suggestion, suppress the autocomplete effect so the
  // programmatic value change doesn't re-open the dropdown.
  const choosingRef = useRef(false)
  const canSearch = placesConfigured()

  useEffect(() => {
    if (!canSearch || choosingRef.current) return
    const trimmed = value.trim()
    if (trimmed.length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const results = await placesAutocomplete(trimmed, controller.signal)
        setSuggestions(results)
        setOpen(results.length > 0)
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([])
          setOpen(false)
        }
      }
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [value, canSearch])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const choose = async (suggestion: PlaceSuggestion) => {
    choosingRef.current = true
    setOpen(false)
    setResolving(true)
    try {
      const resolved = await placeDetails(suggestion.placeId)
      if (resolved) {
        // Prefer the street line for the field; fall back to the suggestion text.
        onChange(resolved.parts.line1 || suggestion.primary)
        onResolved(resolved)
      }
    } catch {
      /* leave the typed value as-is on failure */
    } finally {
      setResolving(false)
      setSuggestions([])
      // Re-enable autocomplete on the next user keystroke.
      setTimeout(() => {
        choosingRef.current = false
      }, 0)
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        id={id}
        type="text"
        autoComplete={autoComplete}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true)
        }}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {resolving && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
          Locating…
        </span>
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
                  <span className="text-xs text-muted-foreground">{suggestion.secondary}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
