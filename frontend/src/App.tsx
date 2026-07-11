import { useEffect, useState } from 'react'
import MapView from './components/map/MapView'
import SessionControls from './components/map/SessionControls'
import RecommendationTray from './components/map/RecommendationTray'
import SpotPanel from './components/spot/SpotPanel'
import PermitChecklist from './components/permits/PermitChecklist'
import AppHeader from './components/shell/AppHeader'
import BottomNav from './components/shell/BottomNav'
import OfflineGate from './components/shell/OfflineGate'
import ProfileEditor from './components/onboarding/ProfileEditor'
import FullScreenLoader from './components/common/FullScreenLoader'
import { useAppStore } from './store'

export default function App() {
  const appPhase = useAppStore((state) => state.appPhase)
  const activeTab = useAppStore((state) => state.activeTab)
  const location = useAppStore((state) => state.location)
  const locationStatus = useAppStore((state) => state.locationStatus)
  const when = useAppStore((state) => state.when)
  const profileEditorOpen = useAppStore((state) => state.profileEditorOpen)
  const selectedSpotId = useAppStore((state) => state.selectedSpotId)
  const recommendationStatus = useAppStore((state) => state.recommendationStatus)
  const loadBaseData = useAppStore((state) => state.loadBaseData)
  const requestLocation = useAppStore((state) => state.requestLocation)
  const startRecommendations = useAppStore((state) => state.startRecommendations)
  const [mapViewReady, setMapViewReady] = useState(false)
  const [fontsReady, setFontsReady] = useState(false)
  const [mapRevealed, setMapRevealed] = useState(false)

  useEffect(() => {
    if (
      (appPhase !== 'ready' && appPhase !== 'loading_recommendations') ||
      locationStatus === 'requesting'
    ) {
      return
    }
    void loadBaseData()
  }, [
    appPhase,
    loadBaseData,
    locationStatus,
    location.lat,
    location.lng,
    when.date,
    when.time_from,
    when.time_to,
  ])

  useEffect(() => {
    if (!('fonts' in document)) {
      setFontsReady(true)
      return
    }
    let cancelled = false
    void document.fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (appPhase === 'profile') {
      setMapRevealed(false)
      setMapViewReady(false)
    }
    if (appPhase === 'loading_recommendations') setMapRevealed(false)
  }, [appPhase])

  // #14: once past the profile step, land on the recommendation map without a
  // separate setup page. Default the origin to the vendor's current location
  // (requesting geolocation once), then auto-run the search. An idle status on
  // the map (after a time/location change) re-runs it the same way.
  useEffect(() => {
    if (appPhase !== 'loading_recommendations' && appPhase !== 'ready') return
    if (recommendationStatus !== 'idle') return
    if (locationStatus === 'idle') {
      requestLocation()
      return
    }
    if (locationStatus === 'requesting') return
    void startRecommendations()
  }, [appPhase, recommendationStatus, locationStatus, requestLocation, startRecommendations])

  useEffect(() => {
    if (
      appPhase === 'ready' &&
      recommendationStatus === 'success' &&
      mapViewReady &&
      fontsReady
    ) {
      setMapRevealed(true)
    }
  }, [appPhase, fontsReady, mapViewReady, recommendationStatus])

  const recommendationRevealPending =
    appPhase === 'loading_recommendations' ||
    (appPhase === 'ready' && recommendationStatus === 'success' && !mapRevealed)

  const mapShell = (
    <div className="relative h-dvh w-full overflow-hidden bg-background">
      <div
        className="contents"
        inert={profileEditorOpen || selectedSpotId || recommendationRevealPending ? true : undefined}
      >
        <div
          id="map-content"
          tabIndex={-1}
          className={`absolute inset-0 ${activeTab === 'map' ? 'visible' : 'invisible'}`}
          aria-hidden={activeTab !== 'map'}
        >
          <MapView onViewReadyChange={setMapViewReady} />
          <AppHeader />
          <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+4.25rem)] z-20 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]">
            <SessionControls />
          </div>
          {!recommendationRevealPending && (
            <div className="absolute inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20">
              <RecommendationTray />
            </div>
          )}
        </div>

        {activeTab === 'permits' && <PermitChecklist />}
        <BottomNav />
      </div>
      {activeTab === 'map' && <SpotPanel />}
      <ProfileEditor />
      {recommendationRevealPending && <FullScreenLoader operation="recommendations" />}
    </div>
  )

  if (appPhase === 'profile') {
    return (
      <OfflineGate>
        <ProfileEditor />
      </OfflineGate>
    )
  }

  if (appPhase === 'loading_recommendations') {
    return (
      <OfflineGate>
        {mapShell}
      </OfflineGate>
    )
  }

  if (appPhase === 'loading_permits') {
    return (
      <OfflineGate>
        <FullScreenLoader operation="permits" />
      </OfflineGate>
    )
  }

  return (
    <OfflineGate>
      <a
        href={activeTab === 'map' ? '#map-content' : '#permits-content'}
        className="skip-link"
      >
        Skip to main content
      </a>
      {mapShell}
    </OfflineGate>
  )
}
