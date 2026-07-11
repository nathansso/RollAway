/**
 * OfflineGate — wraps the whole app and keeps it honest about connectivity.
 *
 * - Children stay mounted while offline (checklist etc. keep working).
 * - A caution banner slides in at the top while the connection is down.
 * - If the app *loads* offline, we show a friendly full-screen card instead
 *   of a broken map / white screen.
 * - On reconnect the banner is replaced by a brief green "Back online" flash.
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const BACK_ONLINE_MS = 2500

function WifiOffIcon({ className }: { className?: string }) {
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
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
      <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
      <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
      <path d="M5 13a10 10 0 0 1 5.24-2.76" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  )
}

function CheckCircleIcon({ className }: { className?: string }) {
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
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

export default function OfflineGate({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState<boolean>(() => navigator.onLine)
  // True once we have had a connection at any point this session. If the very
  // first load happens offline, we show the full fallback card instead of a
  // half-broken map behind a banner.
  const [everOnline, setEverOnline] = useState<boolean>(() => navigator.onLine)
  const [backOnlineFlash, setBackOnlineFlash] = useState(false)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      setEverOnline(true)
      setBackOnlineFlash(true)
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(
        () => setBackOnlineFlash(false),
        BACK_ONLINE_MS,
      )
    }
    const handleOffline = () => {
      setOnline(false)
      setBackOnlineFlash(false)
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [])

  const showOfflineBanner = !online && everOnline
  const showBootFallback = !online && !everOnline

  return (
    <>
      {children}

      {/* Offline banner — children stay mounted underneath */}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 top-0 z-50 pt-[env(safe-area-inset-top)] transition-opacity duration-200 ${
          showOfflineBanner ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {showOfflineBanner && (
          <div className="pointer-events-auto mx-3 mt-2 flex items-start gap-2.5 rounded-2xl bg-caution px-4 py-3 text-slate-900 shadow-lg">
            <WifiOffIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm font-medium leading-snug">
              You&rsquo;re offline &mdash; the map and copilot need a
              connection. Your checklist is still here.
            </p>
          </div>
        )}
      </div>

      {/* Brief reconnect confirmation */}
      {backOnlineFlash && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-0 z-50 pt-[env(safe-area-inset-top)]"
        >
          <div className="mx-3 mt-2 flex items-center gap-2.5 rounded-2xl bg-good px-4 py-3 text-white shadow-lg">
            <CheckCircleIcon className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">Back online</p>
          </div>
        </div>
      )}

      {/* Loaded offline: friendly full-screen card instead of a white screen */}
      {showBootFallback && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background p-6">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-6 text-center shadow-lg">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-caution">
              <WifiOffIcon className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl text-primary">
              No connection
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Rollaway needs the internet for the map and the copilot. Once
              you&rsquo;re back online, this screen will get out of your way.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-on-primary shadow-sm transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </>
  )
}
