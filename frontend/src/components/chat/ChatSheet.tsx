/**
 * Chat copilot bottom sheet, layered over the map.
 *
 * store.sheetView drives it:
 *   'peek'  — collapsed bar (~108px): drag handle, one-line hint, quick prompts
 *   'chat'  — expanded conversation (75dvh) with vendor-type picker + composer
 *   'spot' / 'permits' — other modules own those panels; this renders nothing
 *
 * Height animates 250ms; index.css globally shortens transitions for users
 * who prefer reduced motion.
 */

import { useAppStore } from '../../store'
import Composer from './Composer'
import MessageList from './MessageList'
import QuickPrompts from './QuickPrompts'
import VendorTypePicker from './VendorTypePicker'

const PEEK_HEIGHT = 'calc(108px + env(safe-area-inset-bottom, 0px))'
const EXPANDED_HEIGHT = '75dvh'

function ChevronDownIcon() {
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
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export default function ChatSheet() {
  const sheetView = useAppStore((s) => s.sheetView)
  const setSheetView = useAppStore((s) => s.setSheetView)
  const messageCount = useAppStore((s) => s.messages.length)

  // Spot detail + permit checklist panels are separate modules.
  if (sheetView === 'spot' || sheetView === 'permits') return null

  const expanded = sheetView === 'chat'
  // Welcome message + first exchange: keep quick prompts within reach.
  const shortConversation = messageCount <= 3

  return (
    <section
      aria-label="Copilot chat"
      className="fixed inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_-8px_30px_rgba(15,23,42,0.16)] transition-[height] duration-250 ease-out"
      style={{ height: expanded ? EXPANDED_HEIGHT : PEEK_HEIGHT }}
    >
      {expanded ? (
        <div className="flex h-full flex-col">
          <header className="relative shrink-0 px-4 pt-2.5 pb-1">
            <div
              aria-hidden="true"
              className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-border"
            />
            <h2 className="font-display text-lg text-foreground">
              Rollaway copilot
            </h2>
            <button
              type="button"
              onClick={() => setSheetView('peek')}
              aria-label="Collapse chat"
              className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-opacity duration-150 active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDownIcon />
            </button>
          </header>

          <VendorTypePicker />

          <MessageList />

          {shortConversation && <QuickPrompts className="shrink-0 px-3 pb-2" />}

          <Composer />
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <button
            type="button"
            onClick={() => setSheetView('chat')}
            aria-label="Open chat"
            aria-expanded={false}
            className="flex w-full flex-col items-center gap-1.5 px-4 pt-2.5 pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-10 rounded-full bg-border"
            />
            <span className="text-sm text-muted-foreground">
              Ask where to set up, or what permits you need
            </span>
          </button>
          <QuickPrompts className="px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]" />
        </div>
      )}
    </section>
  )
}
