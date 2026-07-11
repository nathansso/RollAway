import type { LatLng } from '../types/contract'

// #17: build a Google Street View Static image URL for a spot, using the
// referrer-restricted browser key. `return_error_code=true` makes Google reply
// 404 (instead of a gray "no imagery" tile) when there's no panorama, so the
// <img> onError handler can hide it cleanly.
const BROWSER_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ?? '')

export function streetViewConfigured(): boolean {
  return BROWSER_KEY.length > 0
}

export function buildStreetViewUrl(
  point: LatLng,
  opts: { width?: number; height?: number } = {},
): string | null {
  if (!BROWSER_KEY) return null
  const width = opts.width ?? 640
  const height = opts.height ?? 320
  const url = new URL('https://maps.googleapis.com/maps/api/streetview')
  url.searchParams.set('size', `${width}x${height}`)
  url.searchParams.set('location', `${point.lat},${point.lng}`)
  url.searchParams.set('fov', '80')
  url.searchParams.set('return_error_code', 'true')
  url.searchParams.set('key', BROWSER_KEY)
  return url.toString()
}
