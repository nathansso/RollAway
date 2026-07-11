import { UserIcon } from '../common/Icons'
import BrandMark from '../common/BrandMark'
import { useAppStore } from '../../store'

export default function AppHeader() {
  const openProfile = useAppStore((state) => state.openProfileEditor)
  const businessName = useAppStore(
    (state) => state.profile?.autofill_profile.business_name ?? 'Vendor profile',
  )

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between gap-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-3">
        <a
          href="/"
          aria-label="Rollaway — go to home page"
          className="pointer-events-auto brand-lockup no-underline transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandMark compact />
        </a>
        <button
          type="button"
          onClick={openProfile}
          aria-label={`Edit profile for ${businessName}`}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-md border border-white/60 bg-white/95 text-foreground shadow-md backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <UserIcon className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}
