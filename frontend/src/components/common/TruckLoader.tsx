interface TruckLoaderProps {
  label: string
  compact?: boolean
  presentation?: 'default' | 'hero'
}

export default function TruckLoader({
  label,
  compact = false,
  presentation = 'default',
}: TruckLoaderProps) {
  const isHero = presentation === 'hero'

  return (
    <div
      role={label ? 'status' : undefined}
      aria-live={label ? 'polite' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      className={`truck-loader flex items-center justify-center gap-3 ${isHero ? 'truck-loader--hero flex-col' : compact ? '' : 'flex-col py-5'}`}
    >
      <svg
        className={
          isHero ? 'h-28 w-56 sm:h-32 sm:w-64' : compact ? 'h-12 w-24' : 'h-16 w-32'
        }
        viewBox="0 0 160 78"
        fill="none"
        aria-hidden="true"
      >
        <g className="truck-loader__dust" fill="#7C2D12">
          <circle cx="15" cy="54" r="4" opacity=".28" />
          <circle cx="28" cy="62" r="3" opacity=".18" />
          <circle cx="5" cy="65" r="2.5" opacity=".14" />
        </g>
        <g className="truck-loader__body">
          <path
            d="M38 19h69a6 6 0 0 1 6 6v37H32V25a6 6 0 0 1 6-6Z"
            fill="#F97316"
          />
          <path d="M113 36h22l15 15v11h-37V36Z" fill="#C2410C" />
          <path d="M121 41h11l9 10h-20V41Z" fill="#FFF7ED" />
          <path d="M45 30h41v20H45V30Z" fill="#FFF7ED" opacity=".96" />
          <path
            d="M50 36h31M50 43h22"
            stroke="#7C2D12"
            strokeWidth="4"
            strokeLinecap="square"
          />
          <path d="M29 62h124" stroke="#0F172A" strokeWidth="4" strokeLinecap="square" />
          <g className="truck-loader__wheel">
            <circle cx="58" cy="63" r="11" fill="#1E293B" />
            <circle cx="58" cy="63" r="4" fill="#FDBA74" />
            <path d="M58 54v18M49 63h18" stroke="#FFF7ED" strokeWidth="2" />
          </g>
          <g className="truck-loader__wheel">
            <circle cx="130" cy="63" r="11" fill="#1E293B" />
            <circle cx="130" cy="63" r="4" fill="#FDBA74" />
            <path d="M130 54v18M121 63h18" stroke="#FFF7ED" strokeWidth="2" />
          </g>
        </g>
      </svg>
      {label && (
        <span className="text-center text-sm font-semibold text-foreground">
          {label}
        </span>
      )}
    </div>
  )
}
