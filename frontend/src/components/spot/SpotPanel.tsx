/**
 * Spot detail panel — bottom sheet showing the full breakdown for the
 * selected scored spot: verdict + score, reasons, constraint checks,
 * demand signals, and nearby vendors. Reads everything from the store.
 */

import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store'
import type {
  AddSpotAction,
  ConstraintCheck,
  DemandSignals,
  NearbyVendor,
  Verdict,
} from '../../types/contract'
import {
  formatScore,
  SATURATION_META,
  spotDisplayName,
  VERDICT_META,
} from './spotDisplay'

/* ---------- inline icons (stroke, currentColor) ---------- */

function XIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  )
}

function XCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6M9 9l6 6" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg
      className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

/* ---------- sections ---------- */

function SectionHeading({ children }: { children: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  )
}

function ReasonsSection({
  verdict,
  reasons,
}: {
  verdict: Verdict
  reasons: string[]
}) {
  if (reasons.length === 0) return null
  const isAvoid = verdict === 'avoid'
  const meta = VERDICT_META[verdict]
  const ReasonIcon = verdict === 'good' ? CheckIcon : AlertIcon

  return (
    <details
      open
      className={`group rounded-2xl border p-4 shadow-sm ${
        isAvoid ? 'border-avoid/30 bg-avoid/5' : 'border-border bg-white'
      }`}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span
          className={`text-sm font-semibold ${isAvoid ? 'text-avoid' : 'text-foreground'}`}
        >
          {isAvoid ? 'Why avoid?' : 'Why this verdict'}
        </span>
        <ChevronIcon />
      </summary>
      <ul className="mt-2 space-y-2.5">
        {reasons.map((reason) => (
          <li key={reason} className="flex items-start gap-2.5">
            <span className={`mt-0.5 shrink-0 ${meta.iconClass}`}>
              <ReasonIcon />
            </span>
            <span className="text-sm leading-snug text-foreground">{reason}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

function ConstraintRow({ check }: { check: ConstraintCheck }) {
  return (
    <li className="flex items-start gap-3 py-3 first:pt-1 last:pb-1">
      {check.pass ? (
        <CheckCircleIcon className="mt-0.5 shrink-0 text-good" />
      ) : (
        <XCircleIcon className="mt-0.5 shrink-0 text-avoid" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug text-foreground">
            {check.rule}
          </p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-foreground ${
              check.pass ? 'bg-good/10' : 'bg-avoid/10'
            }`}
          >
            {check.pass ? 'Pass' : 'Fail'}
          </span>
        </div>
        <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
          {check.detail}
        </p>
      </div>
    </li>
  )
}

function DemandSection({ demand }: { demand: DemandSignals }) {
  const pct = Math.round(Math.min(1, Math.max(0, demand.foot_traffic_score)) * 100)
  const saturation = SATURATION_META[demand.restaurant_saturation]

  return (
    <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <SectionHeading>Demand</SectionHeading>

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground">Foot traffic</span>
          <span className="font-mono text-sm text-foreground">{pct}%</span>
        </div>
        <div
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Estimated foot traffic"
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-border"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
          Estimated from bike-share activity &mdash; a proxy, not a pedestrian
          count.
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          Restaurant saturation
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-foreground ${saturation.chipClass}`}
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${saturation.dotClass}`}
            aria-hidden="true"
          />
          {saturation.label}
        </span>
      </div>
    </section>
  )
}

function NearbyVendorsSection({ vendors }: { vendors: NearbyVendor[] }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <SectionHeading>Nearby vendors</SectionHeading>
      {vendors.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No permitted vendors found near this spot.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {vendors.map((v) => (
            <li
              key={v.name}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5 first:pt-1 last:pb-1"
            >
              <span className="text-sm font-medium text-foreground">{v.name}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize text-foreground">
                {v.cuisine}
              </span>
              {v.scheduled_here && (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                  Scheduled here
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ---------- sheet ---------- */

function SpotSheet({ spot, onClose }: { spot: AddSpotAction; onClose: () => void }) {
  const [entered, setEntered] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // Focus management: move focus into the sheet on open, restore on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement
    sheetRef.current?.focus()
    return () => {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [])

  // Escape closes the sheet, same as the close button.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const name = spotDisplayName(spot.id)
  const meta = VERDICT_META[spot.verdict]

  return (
    <div
      ref={sheetRef}
      tabIndex={-1}
      role="dialog"
      aria-label={`${name} spot details`}
      className={`fixed inset-x-0 bottom-0 z-40 flex max-h-[80dvh] flex-col rounded-t-3xl bg-background shadow-[0_-8px_30px_rgba(15,23,42,0.18)] outline-none transition-transform duration-200 ease-out ${
        entered ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      {/* grab handle */}
      <div className="flex justify-center pt-2.5" aria-hidden="true">
        <div className="h-1 w-10 rounded-full bg-border" />
      </div>

      {/* header */}
      <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-2">
        <div className="min-w-0">
          <h2 className="font-display text-2xl leading-tight text-foreground">
            {name}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-lg font-bold leading-none ${meta.badgeClass}`}
            >
              {spot.verdict === 'good' ? <CheckIcon /> : <AlertIcon />}
              {meta.label}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1.5 font-mono text-sm font-medium leading-none text-foreground shadow-sm ring-1 ring-border">
              {formatScore(spot.score)}
            </span>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close spot details"
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <XIcon />
        </button>
      </header>

      {/* scrollable body */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <ReasonsSection verdict={spot.verdict} reasons={spot.reasons} />

        <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <SectionHeading>Clearance checks</SectionHeading>
          <ul className="mt-1 divide-y divide-border">
            {spot.breakdown.constraints.map((c) => (
              <ConstraintRow key={c.rule} check={c} />
            ))}
          </ul>
        </section>

        <DemandSection demand={spot.breakdown.demand} />

        <NearbyVendorsSection vendors={spot.breakdown.nearby_vendors} />

        <p className="px-1 pt-1 text-xs leading-snug text-muted-foreground">
          Prototype guide, not legal clearance. Verify with the SF Permit Center
          before committing money.
        </p>
      </div>
    </div>
  )
}

/* ---------- entry point ---------- */

export default function SpotPanel() {
  const sheetView = useAppStore((s) => s.sheetView)
  const selectedSpotId = useAppStore((s) => s.selectedSpotId)
  const spots = useAppStore((s) => s.spots)
  const selectSpot = useAppStore((s) => s.selectSpot)
  const setSheetView = useAppStore((s) => s.setSheetView)

  if (sheetView !== 'spot' || !selectedSpotId) return null
  const spot = spots.find((sp) => sp.id === selectedSpotId)
  if (!spot) return null

  const close = () => {
    selectSpot(null)
    setSheetView('peek')
  }

  return <SpotSheet key={spot.id} spot={spot} onClose={close} />
}
