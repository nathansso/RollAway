/**
 * Quick-prompt chips. Shown in the peek bar and above the composer while the
 * conversation is still short. Tapping one expands the sheet and sends it.
 */

import { useAppStore } from '../../store'

const PROMPTS = [
  'Best spot for Friday lunch?',
  'What permits do I need?',
  'Am I allowed to park here?',
] as const

export default function QuickPrompts({ className = '' }: { className?: string }) {
  const sending = useAppStore((s) => s.sending)
  const sendMessage = useAppStore((s) => s.sendMessage)
  const setSheetView = useAppStore((s) => s.setSheetView)

  return (
    <div
      role="group"
      aria-label="Quick prompts"
      className={`flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          disabled={sending}
          onClick={() => {
            setSheetView('chat')
            void sendMessage(prompt)
          }}
          className="min-h-11 shrink-0 rounded-full border border-border bg-muted px-4 text-sm font-medium text-foreground transition-opacity duration-150 active:opacity-70 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {prompt}
        </button>
      ))}
    </div>
  )
}
