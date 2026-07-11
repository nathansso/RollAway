import type { SVGProps } from 'react'

type Props = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const MapIcon = (props: Props) => (
  <Icon {...props}><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15M15 6v15" /></Icon>
)
export const PermitIcon = (props: Props) => (
  <Icon {...props}>
    <circle cx="12" cy="8.5" r="6" />
    <path d="m9 8.5 2 2 4-4" />
    <path d="M8.3 13.8 6.5 21l5.5-2.8L17.5 21l-1.8-7.2" />
  </Icon>
)
export const UserIcon = (props: Props) => (
  <Icon {...props}><circle cx="12" cy="8" r="4" /><path d="M4 22a8 8 0 0 1 16 0" /></Icon>
)
export const LocationIcon = (props: Props) => (
  <Icon {...props}><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></Icon>
)
export const ClockIcon = (props: Props) => (
  <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>
)
export const FootTrafficIcon = (props: Props) => (
  <Icon {...props}><path d="M13 5.5a2.5 2.5 0 1 1 5 0c0 2-1.5 3-3 3s-2-1-2-3ZM6 13a2.5 2.5 0 1 1 5 0c0 2-1.5 3-3 3s-2-1-2-3Z" /><path d="M15 9c-1 2-1 4 1 6M8 16c-1 2-1 4 1 5" /></Icon>
)
export const FoodIcon = (props: Props) => (
  <Icon {...props}><path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 3c-2 3-2 7 0 9h3V3h-3ZM17 12v9" /></Icon>
)
export const ShieldIcon = (props: Props) => (
  <Icon {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></Icon>
)
export const ClosureIcon = (props: Props) => (
  <Icon {...props}><path d="M4 21 10 3h4l6 18M6 15h12M8 9h8" /></Icon>
)
export const RouteIcon = (props: Props) => (
  <Icon {...props}><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3" /></Icon>
)
export const CloseIcon = (props: Props) => (
  <Icon {...props}><path d="m6 6 12 12M18 6 6 18" /></Icon>
)
export const CheckIcon = (props: Props) => (
  <Icon {...props}><path d="m5 12 4 4L19 6" /></Icon>
)
export const AlertIcon = (props: Props) => (
  <Icon {...props}><path d="M12 3 2 21h20L12 3Z" /><path d="M12 9v5M12 18h.01" /></Icon>
)
export const FileIcon = (props: Props) => (
  <Icon {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6Z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></Icon>
)
export const ChevronIcon = (props: Props) => (
  <Icon {...props}><path d="m9 18 6-6-6-6" /></Icon>
)
