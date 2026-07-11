import { useEffect } from 'react'
import MapView from './components/map/MapView'
import SessionControls from './components/map/SessionControls'
import RecommendationTray from './components/map/RecommendationTray'
import SpotPanel from './components/spot/SpotPanel'
import PermitChecklist from './components/permits/PermitChecklist'
import AppHeader from './components/shell/AppHeader'
import BottomNav from './components/shell/BottomNav'
import OfflineGate from './components/shell/OfflineGate'
import ProfileEditor from './components/onboarding/ProfileEditor'
import { useAppStore } from './store'

export default function App() {
  const activeTab = useAppStore((state) => state.activeTab)
  const location = useAppStore((state) => state.location)
  const when = useAppStore((state) => state.when)
  const profileEditorOpen = useAppStore((state) => state.profileEditorOpen)
  const selectedSpotId = useAppStore((state) => state.selectedSpotId)
  const loadBaseData = useAppStore((state) => state.loadBaseData)

  useEffect(() => {
    void loadBaseData()
  }, [loadBaseData, location.lat, location.lng, when.date, when.time_from, when.time_to])

  return (
    <OfflineGate>
      <a href={activeTab === 'map' ? '#map-content' : '#permits-content'} className="skip-link">
        Skip to main content
      </a>
      <div className="relative h-dvh w-full overflow-hidden bg-background">
        <div
          className="contents"
          inert={profileEditorOpen || selectedSpotId ? true : undefined}
        >
          <div
            id="map-content"
            tabIndex={-1}
            className={`absolute inset-0 ${activeTab === 'map' ? 'visible' : 'invisible'}`}
            aria-hidden={activeTab !== 'map'}
          >
            <MapView />
            <AppHeader />
            <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+4.25rem)] z-20 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]">
              <SessionControls />
            </div>
            <div className="absolute inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20">
              <RecommendationTray />
            </div>
          </div>

          {activeTab === 'permits' && <PermitChecklist />}
          <BottomNav />
        </div>
        {activeTab === 'map' && <SpotPanel />}
        <ProfileEditor />
      </div>
    </OfflineGate>
  )
}
