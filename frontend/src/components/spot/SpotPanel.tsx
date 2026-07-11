import { useRef } from 'react'
import {
  AlertIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  ClosureIcon,
  FoodIcon,
  FootTrafficIcon,
  RouteIcon,
  ShieldIcon,
} from '../common/Icons'
import { useAppStore } from '../../store'
import { useDialogFocus } from '../../lib/useDialogFocus'
import type { RecommendationSpot } from '../../types/contract'

function FactRow({
  icon,
  title,
  value,
  detail,
  tone = 'neutral',
}: {
  icon: React.ReactNode
  title: string
  value: string
  detail: string
  tone?: 'neutral' | 'good' | 'caution' | 'avoid'
}) {
  return (
    <li className="flex gap-3 border-b border-border py-4 last:border-0">
      <span className={`fact-icon fact-icon--${tone}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <span className={`status-text status-text--${tone}`}>{value}</span>
        </div>
        <p className="mt-1 text-sm leading-snug text-muted-foreground">{detail}</p>
      </div>
    </li>
  )
}

function Details({ spot }: { spot: RecommendationSpot }) {
  const legalTone =
    spot.legality.status === 'pass'
      ? 'good'
      : spot.legality.status === 'fail'
        ? 'avoid'
        : 'caution'
  const competitionTone =
    spot.competition.saturation === 'low'
      ? 'good'
      : spot.competition.saturation === 'high'
        ? 'avoid'
        : 'caution'

  return (
    <ul className="mt-3 rounded-2xl border border-border bg-white px-4">
      <FactRow
        icon={<FootTrafficIcon className="h-5 w-5" />}
        title="Estimated foot traffic"
        value={`${spot.foot_traffic.level} · ${spot.foot_traffic.time_context}`}
        detail={`${spot.foot_traffic.detail} Bay Wheels activity is an estimate/proxy, not a pedestrian count.`}
      />
      <FactRow
        icon={<FoodIcon className="h-5 w-5" />}
        title="Menu & price competition"
        value={`${spot.competition.overlap_count} overlap${spot.competition.overlap_count === 1 ? '' : 's'} · ${spot.competition.price_tier}`}
        detail={spot.competition.detail}
        tone={competitionTone}
      />
      <FactRow
        icon={<ShieldIcon className="h-5 w-5" />}
        title="Legality check"
        value={spot.legality.status === 'pass' ? 'Pass' : spot.legality.status === 'fail' ? 'Fail' : 'Verify'}
        detail={`${spot.legality.rule}. ${spot.legality.detail}`}
        tone={legalTone}
      />
      <FactRow
        icon={<ClosureIcon className="h-5 w-5" />}
        title="Active closures"
        value={spot.closure.active ? 'Conflict found' : 'None at point'}
        detail={spot.closure.detail}
        tone={spot.closure.active ? 'avoid' : 'good'}
      />
      <FactRow
        icon={<RouteIcon className="h-5 w-5" />}
        title="Estimated city travel"
        value={`${spot.travel_minutes} min · ${spot.travel_distance_miles.toFixed(1)} mi`}
        detail="Straight-line distance with a conservative city travel-time estimate from your selected or fallback origin."
      />
    </ul>
  )
}

export default function SpotPanel() {
  const selectedId = useAppStore((state) => state.selectedSpotId)
  const spots = useAppStore((state) => state.recommendations)
  const selectSpot = useAppStore((state) => state.selectSpot)
  const panelRef = useRef<HTMLElement>(null)
  const spot = spots.find((candidate) => candidate.id === selectedId)
  useDialogFocus(panelRef, () => selectSpot(null), true, Boolean(spot))

  if (!spot) return null
  const verdictLabel =
    spot.verdict === 'good' ? 'Good fit' : spot.verdict === 'caution' ? 'Use caution' : 'Avoid'

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 cursor-default bg-slate-950/30"
        aria-label="Close spot details"
        onClick={() => selectSpot(null)}
      />
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="spot-title"
        className="spot-sheet"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-md bg-slate-300" aria-hidden="true" />
        <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              Good to know
            </p>
            <h2 id="spot-title" className="mt-1 font-display text-2xl text-foreground">
              {spot.block_label}
            </h2>
            <div className="mt-2 flex items-center gap-2">
              <span className={`verdict-badge verdict-badge--${spot.verdict}`}>
                {spot.verdict === 'good' ? <CheckIcon className="h-4 w-4" /> : <AlertIcon className="h-4 w-4" />}
                {verdictLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs font-semibold">
                <ClockIcon className="h-3.5 w-3.5" />
                {Math.round(spot.score * 100)}/100
              </span>
            </div>
          </div>
          <button type="button" className="touch-button" aria-label="Close Good to Know details" onClick={() => selectSpot(null)}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <p className="rounded-xl border border-border bg-white px-4 py-3 text-sm font-medium leading-snug text-foreground">
            {spot.why_one_line}
          </p>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${spot.point.lat},${spot.point.lng}&travelmode=driving`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-primary"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="3 11 22 2 13 21 11 13 3 11" />
            </svg>
            Navigate to this spot
          </a>
          <Details spot={spot} />
          <div className="mt-3 rounded-xl border border-border bg-white p-3 text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Sources:</strong> placement rule{' '}
            <span className="font-mono">{spot.legality.cite}</span>
            {spot.closure.source && (
              <>
                {' '}· closure <span className="font-mono">{spot.closure.source}</span>
              </>
            )}
            . Guidance only—verify curb conditions and final eligibility with the SF Permit Center.
          </div>
        </div>
      </section>
    </>
  )
}
