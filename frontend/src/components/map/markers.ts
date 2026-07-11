/**
 * DOM builders for map overlays: scored-spot pin markers, the pin-drop
 * marker, and vendor popup content. Kept out of MapView so the component
 * stays focused on map lifecycle.
 *
 * All dynamic text is set via textContent (never innerHTML) so vendor and
 * spot data can't inject markup. innerHTML is only used for static SVG.
 */

import type {
  AddSpotAction,
  VendorProperties,
  VendorStatus,
  Verdict,
} from '../../types/contract'

const VERDICT_BG: Record<Verdict, string> = {
  good: 'bg-good',
  caution: 'bg-caution',
  avoid: 'bg-avoid',
}

const VERDICT_TEXT: Record<Verdict, string> = {
  good: 'text-good',
  caution: 'text-caution',
  avoid: 'text-avoid',
}

const VERDICT_LABEL: Record<Verdict, string> = {
  good: 'looks good',
  caution: 'use caution',
  avoid: 'avoid',
}

/** Small triangle tail under a spot pin head (fill = currentColor). */
const TAIL_SVG =
  '<svg width="12" height="9" viewBox="0 0 12 9" fill="currentColor" aria-hidden="true"><path d="M6 9 0 0h12Z"/></svg>'

/**
 * A tappable scored-spot pin: verdict-colored head with the score inside
 * and a pointed tail. Sized >= 44px so it's a comfortable touch target.
 * Use with Marker({ anchor: 'bottom' }) so the tail tip sits on the point.
 */
export function buildSpotMarkerElement(
  spot: AddSpotAction,
  onSelect: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className =
    'flex h-[52px] w-11 cursor-pointer flex-col items-center rounded-full ' +
    'transition-transform duration-150 hover:scale-105 active:scale-95 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
  btn.setAttribute(
    'aria-label',
    `Scored spot: ${Math.round(spot.score)} out of 100, ${VERDICT_LABEL[spot.verdict]}. Open details.`,
  )

  const head = document.createElement('span')
  head.className =
    'flex h-10 w-10 items-center justify-center rounded-full border-2 border-white shadow-lg ' +
    VERDICT_BG[spot.verdict]

  const score = document.createElement('span')
  score.className = 'font-mono text-sm font-bold leading-none text-white'
  score.textContent = String(Math.round(spot.score))
  head.appendChild(score)

  const tail = document.createElement('span')
  tail.className = '-mt-px flex ' + VERDICT_TEXT[spot.verdict]
  tail.innerHTML = TAIL_SVG

  btn.append(head, tail)
  btn.addEventListener('click', (ev) => {
    // Don't let the tap fall through to the map (it would drop a pin in pin mode).
    ev.stopPropagation()
    onSelect()
  })
  return btn
}

/**
 * The draggable pin-drop marker (accent blue, clearly different from spots
 * and vendor dots). Use with Marker({ anchor: 'bottom', draggable: true }).
 */
export function buildPinElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.className =
    'flex h-12 w-11 cursor-grab items-end justify-center active:cursor-grabbing'
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', 'Dropped pin. Drag to adjust the spot to check.')
  el.innerHTML =
    '<svg width="34" height="44" viewBox="0 0 34 44" fill="none" aria-hidden="true" class="drop-shadow-md">' +
    '<path d="M17 2C9 2 2.5 8.5 2.5 16.5 2.5 27 17 42 17 42s14.5-15 14.5-25.5C31.5 8.5 25 2 17 2Z" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>' +
    '<circle cx="17" cy="16.5" r="5" fill="#ffffff"/>' +
    '</svg>'
  return el
}

function statusChipClass(status: VendorStatus): string {
  switch (status) {
    case 'APPROVED':
    case 'ISSUED':
      return 'bg-good'
    case 'REQUESTED':
      return 'bg-caution'
    case 'EXPIRED':
    case 'SUSPEND':
      return 'bg-slate-400'
  }
}

/** Popup body for a permitted-vendor point: name, cuisine, type, status chip. */
export function buildVendorPopup(props: VendorProperties): HTMLDivElement {
  const root = document.createElement('div')
  root.className = 'min-w-40 p-1 font-sans'

  const name = document.createElement('p')
  name.className = 'm-0 text-sm font-semibold text-foreground'
  name.textContent = props.name

  const meta = document.createElement('p')
  meta.className = 'm-0 mt-0.5 text-xs text-muted-foreground'
  meta.textContent = `${props.cuisine} · ${props.type}`

  const chip = document.createElement('span')
  chip.className =
    'mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white ' +
    statusChipClass(props.status)
  chip.textContent = props.status

  root.append(name, meta, chip)
  return root
}
