import TruckLoader from '../common/TruckLoader'
import { AlertIcon, CheckIcon, ClockIcon } from '../common/Icons'
import { useAppStore } from '../../store'
import type { KeyboardEvent } from 'react'

const VERDICT_LABEL = {
  good: 'Good fit',
  caution: 'Check details',
  avoid: 'Avoid',
} as const

function moveCardFocus(event: KeyboardEvent<HTMLButtonElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const cards = Array.from(
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      '.recommendation-card',
    ) ?? [],
  )
  const currentIndex = cards.indexOf(event.currentTarget)
  if (currentIndex < 0 || cards.length === 0) return
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? cards.length - 1
        : event.key === 'ArrowRight'
          ? Math.min(cards.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1)
  event.preventDefault()
  cards[nextIndex].focus()
  cards[nextIndex].scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' })
}

export default function RecommendationTray() {
  const status = useAppStore((state) => state.recommendationStatus)
  const error = useAppStore((state) => state.recommendationError)
  const spots = useAppStore((state) => state.recommendations)
  const selectSpot = useAppStore((state) => state.selectSpot)
  const request = useAppStore((state) => state.requestRecommendations)

  if (status === 'idle') {
    return (
      <div className="recommendation-empty">
        <p className="font-semibold text-foreground">Ready when you are</p>
        <p className="text-xs text-muted-foreground">
          Choose a time, confirm location, then find ranked setup spots.
        </p>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="recommendation-loading">
        <TruckLoader compact label="Ranking legal, low-competition spots…" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="recommendation-empty" role="alert">
        <p className="font-semibold text-destructive">{error}</p>
        <button type="button" className="secondary-button mt-2" onClick={() => void request()}>
          Try again
        </button>
      </div>
    )
  }

  if (spots.length === 0) {
    return (
      <div className="recommendation-empty">
        <p className="font-semibold">No ranked spots for this window</p>
        <p className="text-xs text-muted-foreground">Try a nearby time or broader travel limit.</p>
      </div>
    )
  }

  return (
    <div className="recommendation-tray" aria-label="Ranked recommendations">
      {spots.map((spot) => (
        <button
          type="button"
          key={spot.id}
          onClick={() => selectSpot(spot.id)}
          onKeyDown={moveCardFocus}
          className="recommendation-card"
          aria-label={`Open details for suggested spot, ${spot.block_label}`}
        >
          <span className={`recommendation-card__rank recommendation-card__rank--${spot.verdict}`}>
            <svg width="16" height="16" viewBox="0 0 12 12" aria-hidden="true">
              <circle cx="6" cy="6" r="3.5" fill="currentColor" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-bold text-foreground">
              {spot.block_label}
            </span>
            <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">
              {spot.why_one_line}
            </span>
            <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-foreground">
              <span className="inline-flex items-center gap-1">
                {spot.verdict === 'good' ? <CheckIcon className="h-3.5 w-3.5" /> : <AlertIcon className="h-3.5 w-3.5" />}
                {VERDICT_LABEL[spot.verdict]}
              </span>
              <span className="inline-flex items-center gap-1">
                <ClockIcon className="h-3.5 w-3.5" />
                {spot.travel_minutes} min
              </span>
              <span>{spot.travel_distance_miles.toFixed(1)} mi</span>
              <span className="basis-full text-muted-foreground">Estimated city travel</span>
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
