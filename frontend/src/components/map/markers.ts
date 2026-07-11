import type { RecommendationSpot, VendorProperties } from '../../types/contract'

export function buildSpotMarkerElement(
  spot: RecommendationSpot,
  onSelect: () => void,
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `rank-marker rank-marker--${spot.verdict}`
  button.setAttribute(
    'aria-label',
    `Recommendation ${spot.rank}: ${spot.block_label}, ${spot.verdict}, ${Math.round(spot.score * 100)} out of 100. Open Good to Know details.`,
  )
  const badge = document.createElement('span')
  badge.textContent = String(spot.rank)
  badge.setAttribute('aria-hidden', 'true')
  button.appendChild(badge)
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    onSelect()
  })
  return button
}

export function buildUserMarkerElement(): HTMLDivElement {
  const root = document.createElement('div')
  root.className = 'user-location-marker'
  root.setAttribute('role', 'img')
  root.setAttribute('aria-label', 'Your location')
  root.append(document.createElement('span'))
  return root
}

export function vendorMarkerLabel(props: VendorProperties): string {
  const schedule = props.schedule_window
    ? ` ${props.scheduled_here ? 'Scheduled' : 'Permit window'} ${props.schedule_window}.`
    : ''
  return `Vendor ${props.name}. Cuisine ${props.cuisine.replaceAll('_', ' ')}. ${props.type}. Permit status ${props.status}.${schedule}`
}

export function buildVendorMarkerElement(
  props: VendorProperties,
  onSelect: () => void,
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'vendor-marker'
  button.setAttribute('aria-label', vendorMarkerLabel(props))
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    onSelect()
  })
  return button
}

export function buildVendorPopup(props: VendorProperties): HTMLDivElement {
  const root = document.createElement('div')
  root.className = 'min-w-44 p-1 font-sans'
  const name = document.createElement('p')
  name.className = 'm-0 text-sm font-bold text-foreground'
  name.textContent = props.name
  const meta = document.createElement('p')
  meta.className = 'm-0 mt-1 text-xs capitalize text-muted-foreground'
  meta.textContent = `${props.cuisine.replaceAll('_', ' ')} · ${props.type}`
  const schedule = document.createElement('p')
  schedule.className = 'm-0 mt-2 text-xs font-medium text-foreground'
  schedule.textContent = props.schedule_window
    ? `${props.scheduled_here ? 'Scheduled' : 'Permit'} · ${props.schedule_window}`
    : `Permit status · ${props.status}`
  root.append(name, meta, schedule)
  return root
}
