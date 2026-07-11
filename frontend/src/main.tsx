import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import LandingPage from './components/landing/LandingPage'

// The map app (and its Mapbox bundle) is code-split so it only downloads when a
// visitor actually enters /app — the marketing landing stays lightweight.
const App = lazy(() => import('./App'))

const path = window.location.pathname
const isAppRoute = path === '/app' || path.startsWith('/app/')

// The landing page scrolls the document (unlike the app, which pins the body).
if (!isAppRoute) document.documentElement.classList.add('landing-route')

// Brand-colored splash while the app chunk loads, so there is no white flash
// between the landing background and the app's own loading screen.
const appBootSplash = (
  <div
    aria-hidden="true"
    style={{ position: 'fixed', inset: 0, background: 'var(--color-secondary)' }}
  />
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAppRoute ? (
      <Suspense fallback={appBootSplash}>
        <App />
      </Suspense>
    ) : (
      <LandingPage />
    )}
  </StrictMode>,
)
