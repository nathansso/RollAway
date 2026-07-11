/**
 * Message composer: auto-growing textarea (1–3 rows) + 44px send button.
 * Enter sends, Shift+Enter inserts a newline.
 */

import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store'

/** ~3 rows: 3 × 20px line-height + 20px vertical padding. */
const MAX_TEXTAREA_HEIGHT = 84

function SendIcon() {
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
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4z" />
    </svg>
  )
}

export default function Composer() {
  const [text, setText] = useState('')
  const sending = useAppStore((s) => s.sending)
  const sendMessage = useAppStore((s) => s.sendMessage)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const canSend = !sending && text.trim().length > 0

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
  }, [text])

  function submit() {
    if (!canSend) return
    void sendMessage(text)
    setText('')
  }

  return (
    <div className="border-t border-border bg-white pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          placeholder="Ask your copilot…"
          aria-label="Message"
          className="min-h-11 flex-1 resize-none overflow-y-auto rounded-2xl border border-border bg-muted px-3.5 py-2.5 text-base leading-5 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-opacity duration-150 active:opacity-80 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  )
}
