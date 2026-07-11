import type { LatLng } from '../types/contract'

const GOOGLE_MODE = {
  driving: 'driving',
  walking: 'walking',
  cycling: 'bicycling',
} as const

export function buildNavigationUrl(
  origin: LatLng,
  destination: LatLng,
  mode: keyof typeof GOOGLE_MODE = 'driving',
): string {
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('origin', `${origin.lat},${origin.lng}`)
  url.searchParams.set('destination', `${destination.lat},${destination.lng}`)
  url.searchParams.set('travelmode', GOOGLE_MODE[mode])
  url.searchParams.set('dir_action', 'navigate')
  return url.toString()
}
