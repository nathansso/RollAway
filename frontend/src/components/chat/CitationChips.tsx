/**
 * Tappable citation pills under an assistant message. Tapping a chip toggles
 * an inset quote block showing the cited text and its source.
 */

import { useState } from 'react'
import type { Citation } from '../../types/contract'

function SourceIcon() {
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
      className="shrink-0"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  )
}

export default function CitationChips({ citations }: { citations: Citation[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  if (citations.length === 0) return null
  const open = openIdx !== null ? citations[openIdx] : null

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1.5">
        {citations.map((c, i) => {
          const isOpen = openIdx === i
          return (
            <button
              key={`${c.label}-${i}`}
              type="button"
              aria-expanded={isOpen}
              aria-label={`Citation: ${c.label}`}
              onClick={() => setOpenIdx(isOpen ? null : i)}
              className={`relative inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isOpen
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-white text-muted-foreground'
              }`}
            >
              <SourceIcon />
              <span className="max-w-48 truncate">{c.label}</span>
            </button>
          )
        })}
      </div>
      {open && (
        <blockquote className="mt-2 rounded-xl border-l-2 border-primary bg-muted px-3 py-2 text-xs">
          <p className="italic leading-relaxed text-foreground">
            &ldquo;{open.quote}&rdquo;
          </p>
          <footer className="mt-1 font-medium text-muted-foreground">
            {open.label} &middot; {open.source}
          </footer>
        </blockquote>
      )}
    </div>
  )
}
