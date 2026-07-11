interface BrandMarkProps {
  className?: string
  compact?: boolean
}

export default function BrandMark({ className = '', compact = false }: BrandMarkProps) {
  return (
    <span className={`brand-mark ${className}`} aria-label="Rollaway">
      <svg
        className={compact ? 'h-6 w-10' : 'h-7 w-12'}
        viewBox="0 0 96 56"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M14 17h44a4 4 0 0 1 4 4v24H10V21a4 4 0 0 1 4-4Z"
          fill="currentColor"
        />
        <path d="M62 28h14l10 10v7H62V28Z" fill="#9A3412" />
        <path d="M68 32h7l6 6H68V32Z" fill="#FFF7ED" />
        <path d="M20 25h25M20 32h18" stroke="#FFF7ED" strokeWidth="3" strokeLinecap="square" />
        <path d="M8 45h80" stroke="#431407" strokeWidth="3" strokeLinecap="square" />
        <circle cx="27" cy="45" r="7" fill="#0F172A" />
        <circle cx="27" cy="45" r="2.5" fill="#FDBA74" />
        <circle cx="73" cy="45" r="7" fill="#0F172A" />
        <circle cx="73" cy="45" r="2.5" fill="#FDBA74" />
      </svg>
      <span>Rollaway</span>
    </span>
  )
}
