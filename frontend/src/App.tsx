import MapView from './components/map/MapView'
import ChatSheet from './components/chat/ChatSheet'
import SpotPanel from './components/spot/SpotPanel'
import PermitChecklist from './components/permits/PermitChecklist'
import OfflineGate from './components/shell/OfflineGate'
import AppHeader from './components/shell/AppHeader'

function App() {
  return (
    <OfflineGate>
      <div className="relative h-dvh w-full overflow-hidden bg-background">
        {/* The map is the app — everything else floats above it */}
        <MapView />
        <AppHeader />

        {/* Bottom sheets: each self-gates on store.sheetView, one visible at a time */}
        <ChatSheet />
        <SpotPanel />
        <PermitChecklist />
      </div>
    </OfflineGate>
  )
}

export default App
