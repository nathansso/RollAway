import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertIcon, CheckIcon } from '../common/Icons'
import { apiClient } from '../../lib/apiClient'

export default function OfflineGate({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [reconnected, setReconnected] = useState(false)

  useEffect(() => {
    let timer = 0
    const onOnline = () => {
      setOnline(true)
      setReconnected(true)
      timer = window.setTimeout(() => setReconnected(false), 2500)
    }
    const onOffline = () => {
      setOnline(false)
      setReconnected(false)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return (
    <>
      {children}
      {!online && (
        <div role="status" aria-live="polite" className="connection-banner connection-banner--offline">
          <AlertIcon className="h-5 w-5 shrink-0" />
          <span>
            Offline. {apiClient.useFixtures
              ? 'Fixture recommendations, permit tools, and saved progress still work; live map tiles may not.'
              : 'Saved progress and the map fallback remain available.'}
          </span>
        </div>
      )}
      {reconnected && (
        <div role="status" aria-live="polite" className="connection-banner connection-banner--online">
          <CheckIcon className="h-5 w-5 shrink-0" />
          <span>Back online</span>
        </div>
      )}
    </>
  )
}
