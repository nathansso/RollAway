import { UserIcon } from '../common/Icons'
import { useAppStore } from '../../store'

export default function AppHeader() {
  const openProfile = useAppStore((state) => state.openProfileEditor)
  const businessName = useAppStore(
    (state) => state.profile?.autofill_profile.business_name ?? 'Vendor profile',
  )

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between gap-3 px-[max(0.75rem,env(safe-area-inset-left))] pt-3">
        <div className="pointer-events-auto rounded-full border border-white/60 bg-white/95 px-4 py-2 shadow-md backdrop-blur">
          <span className="font-display text-xl leading-none text-primary">RollAway</span>
          <span className="ml-2 hidden text-xs text-muted-foreground min-[430px]:inline">
            Find your next block.
          </span>
        </div>
        <button
          type="button"
          onClick={openProfile}
          aria-label={`Edit profile for ${businessName}`}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-white/95 text-foreground shadow-md backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <UserIcon className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}
