import { MapIcon, PermitIcon } from '../common/Icons'
import { useAppStore } from '../../store'

export default function BottomNav() {
  const active = useAppStore((state) => state.activeTab)
  const setActive = useAppStore((state) => state.setActiveTab)

  return (
    <nav aria-label="Primary" className="bottom-nav">
      <button
        type="button"
        aria-current={active === 'map' ? 'page' : undefined}
        onClick={() => setActive('map')}
        className={`bottom-nav__item ${active === 'map' ? 'bottom-nav__item--active' : ''}`}
      >
        <MapIcon className="h-5 w-5" />
        <span>Map</span>
      </button>
      <button
        type="button"
        aria-current={active === 'permits' ? 'page' : undefined}
        onClick={() => setActive('permits')}
        className={`bottom-nav__item ${active === 'permits' ? 'bottom-nav__item--active' : ''}`}
      >
        <PermitIcon className="h-5 w-5" />
        <span>Permits</span>
      </button>
    </nav>
  )
}
