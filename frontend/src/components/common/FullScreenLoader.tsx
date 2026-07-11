import { useEffect, useRef } from 'react'
import TruckLoader from './TruckLoader'

interface FullScreenLoaderProps {
  operation: 'recommendations' | 'permits'
}

export default function FullScreenLoader({ operation }: FullScreenLoaderProps) {
  const loaderRef = useRef<HTMLElement>(null)

  useEffect(() => {
    loaderRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <main
      ref={loaderRef}
      className="full-screen-loader"
      role="status"
      aria-live="polite"
      aria-labelledby="loading-title"
      tabIndex={-1}
    >
      <div className="full-screen-loader__asset" aria-hidden="true">
        <TruckLoader label="" presentation="hero" />
      </div>
      <h1 id="loading-title">Get your business rolling</h1>
      <p>
        {operation === 'recommendations'
          ? 'Ranking San Francisco setup spots…'
          : 'Building your San Francisco permit path…'}
      </p>
    </main>
  )
}
