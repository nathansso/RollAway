import { useRef, useState } from 'react'
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
import { buildNavigationUrl } from '../../lib/navigation'
import { buildStreetViewUrl } from '../../lib/streetView'
import { footTrafficSummary } from '../../lib/recommendations'
import type { RecommendationSpot } from '../../types/contract'

// #17: Street View image for the spot. Hides itself if there's no browser key
// or Google returns no panorama (return_error_code -> 404 -> onError).
function StreetViewImage({ spot }: { spot: RecommendationSpot }) {
  const [failed, setFailed] = useState(false)
  const src = spot.image_url ?? buildStreetViewUrl(spot.point, { width: 640, height: 320 })
  if (!src || failed) return null
  return (
    <img
      src={src}
      alt={`Street View near ${spot.block_label}`}
      loading="lazy"
      onError={() => setFailed(true)}
      className="mt-3 h-40 w-full rounded-xl border border-border object-cover"
    />
  )
}

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
  const area = spot.area_insights
  const permitChecks = area ? area.parking.permit_checks : []
  const permitPasses = permitChecks.filter((check) => check.pass).length
  const cuisineSummary = area?.local_cuisine.nearby
    .slice(0, 3)
    .map((row) => `${row.cuisine.replace(/_/g, ' ')} (${row.count})`)
    .join(', ')

  return (
    <ul className="mt-3 rounded-2xl border border-border bg-white px-4">
      <FactRow
        icon={<FootTrafficIcon className="h-5 w-5" />}
        title="Anticipated foot traffic"
        value={`${spot.foot_traffic.level} · ${spot.foot_traffic.time_context}`}
        detail={footTrafficSummary(spot.foot_traffic.level, spot.foot_traffic.time_context)}
      />
      <FactRow
        icon={<FoodIcon className="h-5 w-5" />}
        title="Menu & price competition"
        value={`${spot.competition.overlap_count} overlap${spot.competition.overlap_count === 1 ? '' : 's'} · ${spot.competition.price_tier}`}
        detail={spot.competition.detail}
        tone={competitionTone}
      />
      {area && (
        <>
          <FactRow
            icon={<ShieldIcon className="h-5 w-5" />}
            title="Parking & setup target"
            value={area.parking.suitability === 'recommended' ? 'Recommended' : area.parking.suitability === 'avoid' ? 'Avoid' : 'Verify'}
            detail={area.parking.note}
            tone={area.parking.suitability === 'recommended' ? 'good' : area.parking.suitability === 'avoid' ? 'avoid' : 'caution'}
          />
          <FactRow
            icon={<ShieldIcon className="h-5 w-5" />}
            title="Permit placement metrics (excluding hydrants)"
            value={`${permitPasses}/${permitChecks.length} pass`}
            detail={permitChecks.length > 0
              ? permitChecks.map((check) => `${check.rule}: ${check.pass ? 'pass' : 'fail'}`).join(' · ')
              : 'No non-hydrant placement measurements were returned; verify requirements before operating.'}
            tone={permitChecks.length > 0 && permitPasses === permitChecks.length ? 'good' : 'caution'}
          />
          <FactRow
            icon={<FoodIcon className="h-5 w-5" />}
            title="Local cuisine mix"
            value={`${area.local_cuisine.menu_overlap_count} direct overlap${area.local_cuisine.menu_overlap_count === 1 ? '' : 's'}`}
            detail={cuisineSummary ? `Nearby: ${cuisineSummary}.` : 'No nearby cuisine counts were returned for this area.'}
            tone={area.local_cuisine.opportunity === 'low_direct_overlap' ? 'good' : area.local_cuisine.opportunity === 'high_direct_overlap' ? 'avoid' : 'caution'}
          />
        </>
      )}
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
  const discovered = useAppStore((state) => state.discovered)
  const location = useAppStore((state) => state.location)
  const selectSpot = useAppStore((state) => state.selectSpot)
  const panelRef = useRef<HTMLElement>(null)
  // #49: a pin found while exploring opens the same sheet as a ranked one.
  const spot =
    spots.find((candidate) => candidate.id === selectedId) ??
    discovered.find((candidate) => candidate.id === selectedId)
  useDialogFocus(panelRef, () => selectSpot(null), true, Boolean(spot))

  if (!spot) return null
  const navigationTarget = spot.area_insights ? spot.area_insights.navigation.destination : spot.point
  const navigationMode = spot.area_insights ? spot.area_insights.navigation.mode : 'driving'
  const navigationUrl = buildNavigationUrl(location, navigationTarget, navigationMode)
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
        <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              Good to know
            </p>
            <h2 id="spot-title" className="mt-1 font-display text-2xl text-foreground">
              {spot.block_label}
            </h2>
            {spot.address && (
              <p className="mt-0.5 text-xs text-muted-foreground">{spot.address}</p>
            )}
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
          <p className="mt-3 rounded-xl border border-border bg-white px-4 py-3 text-sm font-medium leading-snug text-foreground">
            {spot.why_one_line}
          </p>
          <a
            href={navigationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-primary"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="3 11 22 2 13 21 11 13 3 11" />
            </svg>
            Navigate to suggested parking
          </a>
          <StreetViewImage spot={spot} />
          {spot.event_opportunity && (
            <section className="mt-3 rounded-xl border border-border bg-white p-4" aria-labelledby="event-opportunity-title">
              <h3 id="event-opportunity-title" className="text-sm font-bold text-foreground">Nearby event opportunity</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {spot.event_opportunity.event_name} at {spot.event_opportunity.venue} ? {spot.event_opportunity.start}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Promoter: {spot.event_opportunity.promoter_name ?? 'Not provided by Ticketmaster'}
              </p>
              {spot.event_opportunity.event_url && (
                <a href={spot.event_opportunity.event_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-sm font-bold text-primary underline">
                  Open Ticketmaster event page
                </a>
              )}
              {spot.outreach_draft && (
                <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
                  <p className="font-bold text-foreground">Here's a draft you can send</p>
                  <p className="mt-2 font-semibold text-foreground">{spot.outreach_draft.subject}</p>
                  <p className="mt-1 whitespace-pre-line text-muted-foreground">{spot.outreach_draft.body}</p>
                </div>
              )}
            </section>
          )}
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
