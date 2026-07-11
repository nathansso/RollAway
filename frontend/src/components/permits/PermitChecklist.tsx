import { useState } from 'react'
import {
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  FileIcon,
  PermitIcon,
  ShieldIcon,
  UserIcon,
} from '../common/Icons'
import EasyApplyModal from './EasyApplyModal'
import FilledFormWorkflow from './FilledFormWorkflow'
import { useAppStore } from '../../store'
import type { PermitChecklistItem } from '../../types/contract'

const DEADLINES = [
  { value: '30 days', label: 'Public notice' },
  { value: '90 days', label: 'Tentative approval' },
  { value: '15 days', label: 'Appeal window' },
]

const AGENCY_ICONS = [ShieldIcon, FileIcon, ClockIcon, CheckIcon]

const RING_RADIUS = 18
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export default function PermitChecklist() {
  const profile = useAppStore((state) => state.profile)
  const status = useAppStore((state) => state.permitStatus)
  const error = useAppStore((state) => state.permitError)
  const checklist = useAppStore((state) => state.permitChecklist)
  const completed = useAppStore((state) => state.completedPermitItems)
  const startPermitChecklist = useAppStore((state) => state.startPermitChecklist)
  const toggle = useAppStore((state) => state.togglePermitItem)
  const openProfile = useAppStore((state) => state.openProfileEditor)
  const setActiveTab = useAppStore((state) => state.setActiveTab)
  const [easyApplyItem, setEasyApplyItem] = useState<PermitChecklistItem | null>(null)

  const items = checklist?.sections.flatMap((section) => section.items) ?? []
  const completeCount = items.filter((item) => completed.includes(item.id)).length
  const progress = items.length ? Math.round((completeCount / items.length) * 100) : 0

  if (status === 'idle' || status === 'error') {
    return (
      <main id="permits-content" className="permits-screen" tabIndex={-1}>
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-32 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6">
          <header className="flex items-center justify-between">
            <button type="button" className="secondary-button" onClick={() => setActiveTab('map')} aria-label="Back to map">
              <ChevronIcon className="h-4 w-4 rotate-180" />
              Map
            </button>
            <button type="button" className="touch-button bg-white shadow-sm" onClick={openProfile} aria-label="Edit vendor profile">
              <UserIcon className="h-5 w-5" />
            </button>
          </header>

          <section className="permit-hero my-auto flex flex-col items-center gap-6 px-6 py-10 text-center sm:px-10" aria-labelledby="permit-landing-title">
            <span className="permit-hero__rings">
              <span className="permit-hero__badge" aria-hidden="true">
                <PermitIcon className="h-9 w-9" />
              </span>
            </span>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                San Francisco permits
              </p>
              <h1 id="permit-landing-title" className="mt-2 max-w-md font-display text-3xl text-foreground">
                Build your San Francisco permit path
              </h1>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                Get a personalized checklist ordered across the San Francisco agencies that shape your launch, with key deadlines and application guidance.
              </p>
            </div>

            {status === 'error' && (
              <div role="alert" className="w-full max-w-lg rounded-2xl border border-destructive/30 bg-white p-4">
                <p className="font-semibold text-destructive">{error}</p>
              </div>
            )}

            <button
              type="button"
              className="primary-button"
              onClick={() => void startPermitChecklist()}
            >
              {status === 'error' ? 'Try building again' : 'Build my permit checklist'}
            </button>

            <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="permit-feature">
                <span className="permit-feature__icon" aria-hidden="true"><ShieldIcon className="h-4 w-4" /></span>
                <span className="text-xs font-semibold text-foreground">4 agencies, ordered</span>
              </div>
              <div className="permit-feature">
                <span className="permit-feature__icon" aria-hidden="true"><ClockIcon className="h-4 w-4" /></span>
                <span className="text-xs font-semibold text-foreground">Deadlines tracked</span>
              </div>
              <div className="permit-feature">
                <span className="permit-feature__icon" aria-hidden="true"><FileIcon className="h-4 w-4" /></span>
                <span className="text-xs font-semibold text-foreground">Pre-filled paperwork</span>
              </div>
            </div>
          </section>

          <aside className="rounded-2xl border border-caution/30 bg-caution/10 p-4 text-sm leading-relaxed text-foreground">
            <strong>Guidance, not legal advice.</strong> Requirements and fees can change. Verify your path, deadlines, and official submissions with the SF Permit Center.
          </aside>
        </div>
      </main>
    )
  }

  return (
    <main id="permits-content" className="permits-screen" tabIndex={-1}>
      <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6">
        <div className="mb-4">
          <button type="button" className="secondary-button" onClick={() => setActiveTab('map')} aria-label="Back to map">
            <ChevronIcon className="h-4 w-4 rotate-180" />
            Map
          </button>
        </div>
        <header className="permit-header-card flex items-center justify-between gap-4 p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
              Personalized guidance
            </p>
            <h1 className="mt-1 font-display text-2xl text-foreground sm:text-3xl">Your permit path</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ordered across the four SF agencies that shape your launch.
            </p>
          </div>
          <div className="flex flex-none flex-col items-center gap-2.5">
            <button type="button" className="touch-button bg-white/70 shadow-sm" onClick={openProfile} aria-label="Edit vendor profile">
              <UserIcon className="h-5 w-5" />
            </button>
            {status === 'success' && checklist ? (
              <div
                className="permit-progress-ring"
                role="progressbar"
                aria-label="Permit checklist progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <svg viewBox="0 0 44 44" width="100%" height="100%" aria-hidden="true">
                  <circle className="permit-progress-ring__track" cx="22" cy="22" r={RING_RADIUS} fill="none" strokeWidth="5" />
                  <circle
                    className="permit-progress-ring__fill"
                    cx="22"
                    cy="22"
                    r={RING_RADIUS}
                    fill="none"
                    strokeWidth="5"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress / 100)}
                  />
                </svg>
                <span>{progress}%</span>
              </div>
            ) : (
              <span className="permit-progress-ring permit-progress-ring--placeholder" aria-hidden="true">
                <PermitIcon className="h-6 w-6 text-primary" />
              </span>
            )}
          </div>
        </header>

        <section aria-label="Important permit deadlines" className="deadline-rail mt-5">
          {DEADLINES.map((deadline) => (
            <div key={deadline.value} className="deadline-pill">
              <span className="deadline-pill__icon" aria-hidden="true">
                <ClockIcon className="h-3.5 w-3.5" />
              </span>
              <strong>{deadline.value}</strong>
              <span>{deadline.label}</span>
            </div>
          ))}
        </section>

        {status === 'success' && checklist && (
          <>
            <p className="mt-4 text-sm font-semibold text-foreground">
              {completeCount} of {items.length} steps complete
            </p>

            <div className="mt-4 space-y-7">
              {checklist.sections.map((section, sectionIndex) => {
                const sectionDone = section.items.filter((item) => completed.includes(item.id)).length
                const AgencyIcon = AGENCY_ICONS[sectionIndex % AGENCY_ICONS.length]
                return (
                <section key={section.agency} aria-labelledby={`agency-${sectionIndex}`}>
                  <div className="mb-3 flex items-center gap-3">
                    <span className={`agency-badge agency-badge--${sectionIndex % 4}`} aria-hidden="true">
                      <AgencyIcon className="h-5 w-5" />
                      <span className="agency-badge__index">{sectionIndex + 1}</span>
                    </span>
                    <h2 id={`agency-${sectionIndex}`} className="min-w-0 flex-1 font-display text-xl text-foreground">
                      {section.agency}
                    </h2>
                    <span className="agency-progress-chip">
                      {sectionDone}/{section.items.length}
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {section.items.map((item) => {
                      const done = completed.includes(item.id)
                      return (
                        <li key={item.id} className={`permit-item ${done ? 'permit-item--done' : ''}`}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={done}
                            aria-label={`${done ? 'Mark incomplete' : 'Mark complete'}: ${item.title}`}
                            className={`permit-checkbox ${done ? 'permit-checkbox--done' : ''}`}
                            onClick={() => toggle(item.id)}
                          >
                            <CheckIcon className="h-5 w-5" />
                          </button>
                          <div className="min-w-0 flex-1">
                            <h3 className={`text-sm font-bold leading-snug ${done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                              {item.title}
                            </h3>
                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                              {item.detail}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {item.deadline_label && (
                                <span className="deadline-chip">
                                  <ClockIcon className="h-3.5 w-3.5" />
                                  {item.deadline_label}
                                </span>
                              )}
                              <span className="source-chip">
                                <FileIcon className="h-3.5 w-3.5" />
                                {item.cite}
                              </span>
                            </div>
                            {item.form_url && (
                              <a href={item.form_url} target="_blank" rel="noopener noreferrer" className="easyapply-button">
                                Open official PDF form
                                <span className="sr-only"> for {item.title}</span>
                                <ChevronIcon className="h-4 w-4" />
                              </a>
                            )}
                            {item.easy_apply && (
                              <button type="button" className="easyapply-button" onClick={() => setEasyApplyItem(item)}>
                                Review &amp; submit
                                <span className="sr-only"> simulated draft for {item.title}</span>
                                <ChevronIcon className="h-4 w-4" />
                              </button>
                            )}
                            {item.filled_form && (
                              <FilledFormWorkflow itemId={item.id} source={item.cite} form={item.filled_form} />
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </section>
                )
              })}
            </div>
          </>
        )}

        <aside className="mt-7 rounded-2xl border border-caution/30 bg-caution/10 p-4 text-sm leading-relaxed text-foreground">
          <strong>Guidance, not legal advice.</strong> Requirements and fees can change. Verify your path, deadlines, and official submissions with the SF Permit Center.
        </aside>
      </div>

      {easyApplyItem && profile && (
        <EasyApplyModal
          item={easyApplyItem}
          profile={profile}
          onClose={() => setEasyApplyItem(null)}
        />
      )}
    </main>
  )
}
