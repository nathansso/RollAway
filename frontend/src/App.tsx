import MapView from './components/map/MapView'
import ChatSheet from './components/chat/ChatSheet'
import SpotPanel from './components/spot/SpotPanel'
import PermitChecklist from './components/permits/PermitChecklist'
import OfflineGate from './components/shell/OfflineGate'
import AppHeader from './components/shell/AppHeader'
import { useAppStore } from './store'

/**
 * Always-mounted screen-reader announcer: reads out the latest copilot reply
 * even when the chat sheet is collapsed and MessageList is unmounted.
 */
function CopilotAnnouncer() {
  const messages = useAppStore((s) => s.messages)
  const last = messages[messages.length - 1]
  return (
    <div aria-live="polite" role="status" className="sr-only">
      {last?.role === 'assistant' ? last.content : ''}
    </div>
  )
}

function App() {
  return (
    <OfflineGate>
      <div className="relative h-dvh w-full overflow-hidden bg-background">
        <CopilotAnnouncer />
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
