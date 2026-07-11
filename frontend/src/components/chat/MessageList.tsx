/**
 * Scrollable conversation. User bubbles right (orange), assistant cards left
 * (white, markdown via react-markdown + remark-gfm — raw HTML stays escaped,
 * which is our sanitization; do not add rehype-raw). Shows a typing indicator
 * while sending and inline follow-up buttons when a reply produced a
 * checklist or dropped spots on the map.
 */

import { useEffect, useRef } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAppStore, type ChatMessage } from '../../store'
import type { AgentName } from '../../types/contract'
import CitationChips from './CitationChips'

const AGENT_META: Record<AgentName, { label: string; className: string }> = {
  spot_scout: { label: 'Spot Scout', className: 'bg-primary/10 text-primary' },
  permit_copilot: { label: 'Permit Copilot', className: 'bg-accent/10 text-accent' },
}

/** Legible markdown inside a chat bubble. */
const mdComponents: Components = {
  p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-accent underline underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8125rem]">
      {children}
    </code>
  ),
  h1: ({ children }) => <p className="mb-1.5 text-sm font-semibold">{children}</p>,
  h2: ({ children }) => <p className="mb-1.5 text-sm font-semibold">{children}</p>,
  h3: ({ children }) => <p className="mb-1 text-sm font-semibold">{children}</p>,
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-border pl-3 text-muted-foreground last:mb-0">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-muted px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-2 py-1 align-top">{children}</td>
  ),
}

function ArrowRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

function MapPinIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="Copilot is typing"
      className="flex max-w-[85%] items-center gap-1.5 self-start rounded-2xl rounded-bl-md border border-border bg-white px-4 py-3.5 shadow-sm"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'user') {
    return (
      <div className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm text-on-primary">
        {msg.content}
      </div>
    )
  }

  if (msg.error) {
    return (
      <div className="max-w-[85%] self-start rounded-2xl rounded-bl-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm shadow-sm">
        <p className="leading-relaxed text-foreground">{msg.content}</p>
        <p className="mt-1.5 text-xs font-medium text-destructive">
          Check your connection and send your message again.
        </p>
      </div>
    )
  }

  const agent = msg.agent ? AGENT_META[msg.agent] : null

  return (
    <div className="max-w-[85%] self-start rounded-2xl rounded-bl-md border border-border bg-white px-3.5 py-2.5 text-sm shadow-sm">
      {agent && (
        <span
          className={`mb-1.5 inline-block rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${agent.className}`}
        >
          {agent.label}
        </span>
      )}
      <div className="text-foreground">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {msg.content}
        </ReactMarkdown>
      </div>
      {msg.citations && <CitationChips citations={msg.citations} />}
    </div>
  )
}

export default function MessageList() {
  const messages = useAppStore((s) => s.messages)
  const sending = useAppStore((s) => s.sending)
  const sheetView = useAppStore((s) => s.sheetView)
  const checklist = useAppStore((s) => s.checklist)
  const spots = useAppStore((s) => s.spots)
  const setSheetView = useAppStore((s) => s.setSheetView)
  const endRef = useRef<HTMLDivElement>(null)

  const expanded = sheetView === 'chat'

  useEffect(() => {
    if (expanded) endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, sending, expanded])

  const last = messages[messages.length - 1]
  const lastIsAssistant = last?.role === 'assistant' && !last.error
  const showChecklistLink =
    lastIsAssistant && last.agent === 'permit_copilot' && checklist !== null
  const showSpotsLink =
    lastIsAssistant && last.agent === 'spot_scout' && spots.length > 0

  return (
    <div
      role="log"
      aria-label="Conversation"
      /* announcements handled by the always-mounted CopilotAnnouncer in App.tsx
         — aria-live here would double-announce while the sheet is open */
      className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3"
    >
      {messages.map((msg) => (
        <MessageBubble key={msg.id} msg={msg} />
      ))}

      {sending && <TypingIndicator />}

      {!sending && showChecklistLink && (
        <button
          type="button"
          onClick={() => setSheetView('permits')}
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-2xl border border-accent/30 bg-accent/5 px-4 text-sm font-semibold text-accent transition-opacity duration-150 active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View your permit checklist
          <ArrowRightIcon />
        </button>
      )}

      {!sending && showSpotsLink && (
        <button
          type="button"
          onClick={() => setSheetView('peek')}
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-full border border-primary/30 bg-primary/5 px-4 text-sm font-semibold text-primary transition-opacity duration-150 active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MapPinIcon />
          {spots.length === 1
            ? '1 spot dropped on the map'
            : `${spots.length} spots dropped on the map`}
        </button>
      )}

      <div ref={endRef} aria-hidden="true" />
    </div>
  )
}
