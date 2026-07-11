import BrandMark from '../common/BrandMark'
import { CheckIcon, ClockIcon } from '../common/Icons'

/**
 * A phone mock of the Rollaway map screen for the landing hero. It reuses the
 * app's own schematic map, ranked pins, and recommendation card (the exact look
 * shown when Mapbox has no token), so it reads like a real device screenshot,
 * without pulling the Mapbox bundle onto the landing page. Spot data mirrors the
 * shipped demo fixture (2nd & Howard / Folsom & 1st / Mission & 5th).
 */
export default function HeroMock() {
  return (
    <div
      className="landing-phone"
      role="img"
      aria-label="A phone showing the Rollaway map of SoMa for Friday lunch, ranking three blocks: 2nd and Howard as a good fit, Folsom and 1st to check, and Mission and 5th to avoid inside a street closure."
    >
      <span className="landing-phone__side landing-phone__side--power" aria-hidden="true" />
      <span className="landing-phone__side landing-phone__side--vol-up" aria-hidden="true" />
      <span className="landing-phone__side landing-phone__side--vol-down" aria-hidden="true" />

      <div className="landing-phone__screen">
        {/* Schematic SF map field: the app's real no-token fallback look */}
        <div className="fallback-map" aria-hidden="true">
          <div className="fallback-map__grid" />
          <div className="fallback-map__street fallback-map__street--one" />
          <div className="fallback-map__street fallback-map__street--two" />
          <div className="fallback-map__closure" />
        </div>

        {/* Dynamic island */}
        <span className="landing-phone__island" aria-hidden="true" />

        {/* App header lockup + session context, exactly as the shell renders it */}
        <div className="landing-phone__chrome" aria-hidden="true">
          <span className="brand-lockup">
            <BrandMark compact />
          </span>
          <span className="landing-phone__context">SoMa · Fri lunch</span>
        </div>

        {/* User location + nearby vendors */}
        <span className="landing-phone__user" aria-hidden="true" />
        <span className="landing-phone__vendor" style={{ left: '40%', top: '58%' }} aria-hidden="true" />
        <span className="landing-phone__vendor" style={{ left: '74%', top: '31%' }} aria-hidden="true" />
        <span className="landing-phone__vendor" style={{ left: '28%', top: '70%' }} aria-hidden="true" />

        {/* Ranked spot pins */}
        <span
          className="rank-marker rank-marker--good landing-phone__pin"
          style={{ left: '21%', top: '30%' }}
          aria-hidden="true"
        >
          <span>1</span>
        </span>
        <span
          className="rank-marker rank-marker--caution landing-phone__pin"
          style={{ left: '63%', top: '42%' }}
          aria-hidden="true"
        >
          <span>2</span>
        </span>
        <span
          className="rank-marker rank-marker--avoid landing-phone__pin"
          style={{ left: '60%', top: '56%' }}
          aria-hidden="true"
        >
          <span>3</span>
        </span>

        {/* Top-ranked recommendation card, matching the in-app tray */}
        <div className="recommendation-card landing-phone__card" aria-hidden="true">
          <span className="recommendation-card__rank recommendation-card__rank--good">
            <svg width="16" height="16" viewBox="0 0 12 12" aria-hidden="true">
              <circle cx="6" cy="6" r="3.5" fill="currentColor" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-bold text-foreground">
              2nd &amp; Howard
            </span>
            <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">
              Strong office-lunch signal with low direct menu overlap.
            </span>
            <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-foreground">
              <span className="inline-flex items-center gap-1 text-good">
                <CheckIcon className="h-3.5 w-3.5" />
                Good fit
              </span>
              <span className="inline-flex items-center gap-1">
                <ClockIcon className="h-3.5 w-3.5" />8 min
              </span>
              <span>0.6 mi</span>
            </span>
          </span>
        </div>

        {/* Home indicator */}
        <span className="landing-phone__home" aria-hidden="true" />
      </div>
    </div>
  )
}
