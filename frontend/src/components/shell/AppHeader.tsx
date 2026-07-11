/**
 * AppHeader — slim floating chrome over the full-screen map.
 *
 * Left:  Rollaway wordmark pill (+ tagline when there's room).
 * Right: pin-drop toggle + permit-checklist button (both 44px targets).
 * Extra: when a pin is dropped, a floating "Check this spot" pill asks the
 *        copilot whether that exact point is allowed.
 */

import { useAppStore } from '../../store'

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </svg>
  )
}

const CHECK_PIN_PROMPT = 'Am I allowed to set up at the pin I dropped?'

export default function AppHeader() {
  const pinMode = useAppStore((s) => s.pinMode)
  const setPinMode = useAppStore((s) => s.setPinMode)
  const pinnedPoint = useAppStore((s) => s.pinnedPoint)
  const setSheetView = useAppStore((s) => s.setSheetView)
  const sendMessage = useAppStore((s) => s.sendMessage)
  const sending = useAppStore((s) => s.sending)

  const checkPinnedSpot = () => {
    void sendMessage(CHECK_PIN_PROMPT)
    setSheetView('chat')
  }

  return (
    <>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between gap-2 px-3 pt-3">
          {/* Wordmark pill */}
          <div className="pointer-events-auto rounded-full bg-white/95 px-4 py-2 shadow-md backdrop-blur">
            <span className="font-display text-lg leading-none text-primary">
              Rollaway
            </span>
            <span className="ml-2 hidden text-xs text-muted-foreground min-[400px]:inline">
              Get your business rolling.
            </span>
          </div>

          {/* Actions */}
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPinMode(!pinMode)}
              aria-label={pinMode ? 'Turn off pin-drop mode' : 'Drop a pin on the map'}
              aria-pressed={pinMode}
              className={`flex h-11 w-11 items-center justify-center rounded-full shadow-md backdrop-blur transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                pinMode
                  ? 'bg-accent text-white'
                  : 'bg-white/95 text-foreground'
              }`}
            >
              <MapPinIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setSheetView('permits')}
              aria-label="Permit checklist"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-foreground shadow-md backdrop-blur transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ClipboardIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Floating "Check this spot" pill — appears once a pin is dropped */}
      {pinnedPoint && (
        <button
          type="button"
          onClick={checkPinnedSpot}
          disabled={sending}
          className="pointer-events-auto fixed right-4 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-30 flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform duration-150 active:scale-[0.97] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <MapPinIcon className="h-4.5 w-4.5" />
          Check this spot
        </button>
      )}
    </>
  )
}
