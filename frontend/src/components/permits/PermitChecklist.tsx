import { useState } from 'react'
import {
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  FileIcon,
  PermitIcon,
  UserIcon,
} from '../common/Icons'
import EasyApplyModal from './EasyApplyModal'
import { useAppStore } from '../../store'
import type { PermitChecklistItem } from '../../types/contract'

const DEADLINES = [
  { value: '30 days', label: 'Public notice' },
  { value: '90 days', label: 'Tentative approval' },
  { value: '15 days', label: 'Appeal window' },
]

export default function PermitChecklist() {
  const profile = useAppStore((state) => state.profile)
  const status = useAppStore((state) => state.permitStatus)
  const error = useAppStore((state) => state.permitError)
  const checklist = useAppStore((state) => state.permitChecklist)
  const completed = useAppStore((state) => state.completedPermitItems)
  const startPermitChecklist = useAppStore((state) => state.startPermitChecklist)
  const toggle = useAppStore((state) => state.togglePermitItem)
  const openProfile = useAppStore((state) => state.openProfileEditor)
  const [easyApplyItem, setEasyApplyItem] = useState<PermitChecklistItem | null>(null)

  const items = checklist?.sections.flatMap((section) => section.items) ?? []
  const completeCount = items.filter((item) => completed.includes(item.id)).length
  const progress = items.length ? Math.round((completeCount / items.length) * 100) : 0

  if (status === 'idle' || status === 'error') {
    return (
      <main id="permits-content" className="permits-screen" tabIndex={-1}>
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-32 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6">
          <header className="flex justify-end">
            <button type="button" className="touch-button bg-white shadow-sm" onClick={openProfile} aria-label="Edit vendor profile">
              <UserIcon className="h-5 w-5" />
            </button>
          </header>

          <section className="my-auto flex flex-col items-center py-10 text-center" aria-labelledby="permit-landing-title">
            <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary text-white" aria-hidden="true">
              <PermitIcon className="h-10 w-10" />
            </span>
            <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-primary">
              San Francisco permits
            </p>
            <h1 id="permit-landing-title" className="mt-2 max-w-md font-display text-3xl text-foreground">
              Build your San Francisco permit path
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Get a personalized checklist ordered across the San Francisco agencies that shape your launch, with key deadlines and application guidance.
            </p>

            {status === 'error' && (
              <div role="alert" className="mt-6 w-full max-w-lg rounded-2xl border border-destructive/30 bg-white p-4">
                <p className="font-semibold text-destructive">{error}</p>
              </div>
            )}

            <button
              type="button"
              className="primary-button mt-7"
              onClick={() => void startPermitChecklist()}
            >
              {status === 'error' ? 'Try building again' : 'Build my permit checklist'}
            </button>
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
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
              Personalized guidance
            </p>
            <h1 className="mt-1 font-display text-3xl text-foreground">Your permit path</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ordered across the four SF agencies that shape your launch.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="touch-button bg-white shadow-sm" onClick={openProfile} aria-label="Edit vendor profile">
              <UserIcon className="h-5 w-5" />
            </button>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-white" aria-hidden="true">
              <PermitIcon className="h-6 w-6" />
            </span>
          </div>
        </header>

        <section aria-label="Important permit deadlines" className="mt-5 grid grid-cols-3 gap-2">
          {DEADLINES.map((deadline) => (
            <div key={deadline.value} className="deadline-card">
              <ClockIcon className="h-4 w-4 text-caution" />
              <strong>{deadline.value}</strong>
              <span>{deadline.label}</span>
            </div>
          ))}
        </section>

        {status === 'success' && checklist && (
          <>
            <section className="mt-6 rounded-2xl border border-border bg-white p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-foreground">
                  {completeCount} of {items.length} complete
                </span>
                <span className="font-mono text-muted-foreground">{progress}%</span>
              </div>
              <div role="progressbar" aria-label="Permit checklist progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="mt-2 h-2 overflow-hidden rounded-md bg-border">
                <div className="h-full origin-left rounded-md bg-primary transition-transform" style={{ transform: `scaleX(${progress / 100})` }} />
              </div>
            </section>

            <div className="mt-6 space-y-7">
              {checklist.sections.map((section, sectionIndex) => (
                <section key={section.agency} aria-labelledby={`agency-${sectionIndex}`}>
                  <div className="mb-3 flex items-center gap-3">
                    <span className="agency-number">{sectionIndex + 1}</span>
                    <h2 id={`agency-${sectionIndex}`} className="font-display text-xl text-foreground">
                      {section.agency}
                    </h2>
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
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
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
