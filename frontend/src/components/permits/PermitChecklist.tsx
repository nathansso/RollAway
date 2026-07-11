/**
 * Permit checklist sheet — renders the §D `checklist` shape as an ordered,
 * agency-grouped to-do list. Shown when store.sheetView === 'permits'.
 */

import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store'
import type { ChecklistStep } from '../../types/contract'
import {
  VENDOR_TYPE_LABELS,
  agencyDotClass,
  groupStepsByAgency,
} from './permitHelpers'

/* ---------- inline icons (stroke = currentColor) ---------- */

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function DocIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  )
}

function TruckIcon() {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v9H1z" />
      <path d="M15 10h4l3 3v3h-7" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M4 10h6" />
    </svg>
  )
}

/* ---------- step row ---------- */

interface StepRowProps {
  step: ChecklistStep
  expanded: boolean
  onToggleCite: () => void
}

function StepRow({ step, expanded, onToggleCite }: StepRowProps) {
  const toggleStep = useAppStore((s) => s.toggleStep)
  const done = step.status === 'done'

  return (
    <li className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm border border-border">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`Mark step ${step.order}, ${step.title}, as ${done ? 'not done' : 'done'}`}
        onClick={() => toggleStep(step.order)}
        className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          done
            ? 'border-good bg-good text-white'
            : 'border-border bg-muted text-transparent hover:border-primary'
        }`}
      >
        <CheckIcon />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {step.order}.
          </span>
          <span
            className={`text-sm font-semibold leading-snug ${
              done ? 'text-muted-foreground line-through' : 'text-foreground'
            }`}
          >
            {step.title}
          </span>
        </div>

        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {step.detail}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {step.deadline_label && (
            <span className="inline-flex items-center gap-1 rounded-full bg-caution/15 px-2.5 py-1 text-xs font-medium text-amber-800">
              <ClockIcon />
              {step.deadline_label}
            </span>
          )}
          <button
            type="button"
            onClick={onToggleCite}
            aria-expanded={expanded}
            className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <DocIcon />
            {step.cite}
          </button>
        </div>

        {expanded && (
          <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Source: <span className="font-mono">{step.cite}</span>
          </p>
        )}
      </div>
    </li>
  )
}

/* ---------- empty state ---------- */

function EmptyState() {
  const setSheetView = useAppStore((s) => s.setSheetView)
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-8 text-center shadow-sm border border-border">
      <span className="text-primary">
        <TruckIcon />
      </span>
      <h3 className="font-display text-xl text-foreground">No checklist yet</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Ask the copilot &ldquo;what permits do I need?&rdquo; and tell it what
        you sell from.
      </p>
      <button
        type="button"
        onClick={() => setSheetView('chat')}
        className="min-h-[44px] rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Ask the copilot
      </button>
    </div>
  )
}

/* ---------- main sheet ---------- */

export default function PermitChecklist() {
  const sheetView = useAppStore((s) => s.sheetView)
  const setSheetView = useAppStore((s) => s.setSheetView)
  const checklist = useAppStore((s) => s.checklist)
  const [expandedCites, setExpandedCites] = useState<ReadonlySet<number>>(
    () => new Set(),
  )
  const sheetRef = useRef<HTMLElement>(null)
  const open = sheetView === 'permits'

  // Focus management: move focus into the sheet on open, close on Escape,
  // restore focus to the previously focused element on close.
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement
    sheetRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetView('chat')
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [open, setSheetView])

  if (!open) return null

  const toggleCite = (order: number) => {
    setExpandedCites((prev) => {
      const next = new Set(prev)
      if (next.has(order)) next.delete(order)
      else next.add(order)
      return next
    })
  }

  const groups = checklist ? groupStepsByAgency(checklist) : []
  const total = checklist?.steps.length ?? 0
  const doneCount =
    checklist?.steps.filter((s) => s.status === 'done').length ?? 0
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0

  return (
    <section
      ref={sheetRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Permit checklist"
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[85dvh] flex-col rounded-t-3xl bg-background shadow-[0_-8px_30px_rgba(15,23,42,0.15)] outline-none"
    >
      {/* header */}
      <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0">
          <h2 className="font-display text-2xl text-foreground">
            Your permit path
          </h2>
          {checklist && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {VENDOR_TYPE_LABELS[checklist.vendor_type]}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Close checklist"
          onClick={() => setSheetView('chat')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors duration-150 hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CloseIcon />
        </button>
      </header>

      {/* progress */}
      {checklist && (
        <div className="px-5 pb-3">
          <p className="text-xs font-medium text-muted-foreground">
            {doneCount} of {total} done
          </p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={doneCount}
            aria-label="Checklist progress"
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full rounded-full bg-primary transition-transform duration-300 origin-left"
              style={{ transform: `scaleX(${pct / 100})` }}
            />
          </div>
        </div>
      )}

      {/* scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
        {!checklist ? (
          <EmptyState />
        ) : (
          <>
            {groups.map((group, gi) => (
              <div key={group.agency}>
                <h3 className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-background/95 px-1 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 rounded-full ${agencyDotClass(gi)}`}
                  />
                  {group.agency}
                </h3>
                <ul className="mb-4 flex flex-col gap-2">
                  {group.steps.map((step) => (
                    <StepRow
                      key={step.order}
                      step={step}
                      expanded={expandedCites.has(step.order)}
                      onToggleCite={() => toggleCite(step.order)}
                    />
                  ))}
                </ul>
              </div>
            ))}
            <p className="mt-2 border-t border-border pt-4 text-center text-xs leading-relaxed text-muted-foreground">
              This is a guide to the process, not legal advice. Confirm details
              with the SF Permit Center.
            </p>
          </>
        )}
      </div>
    </section>
  )
}
