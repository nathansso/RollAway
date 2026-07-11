import { SF_BOUNDS, isWithinSanFrancisco } from '../../lib/sfBounds'
import type { LatLng, RecommendationSpot } from '../../types/contract'
import type mapboxgl from 'mapbox-gl'

export const SF_MAX_BOUNDS: [[number, number], [number, number]] = [
  [SF_BOUNDS.southwest.lng, SF_BOUNDS.southwest.lat],
  [SF_BOUNDS.northeast.lng, SF_BOUNDS.northeast.lat],
]

export function createMapOptions(container: HTMLElement): mapboxgl.MapOptions {
  return {
    container,
    // #34: a clean, minimal base (not the busy default streets style). We warm
    // it toward the brand palette on load via applyBrandBasemap().
    style: 'mapbox://styles/mapbox/light-v11',
    center: [-122.4013, 37.7835],
    zoom: 14,
    maxBounds: SF_MAX_BOUNDS,
    attributionControl: true,
  }
}

/**
 * #34: warm the stock Mapbox basemap toward the RollAway palette so it reads as
 * intentional rather than default. Pattern-matches the loaded style's layers
 * (resilient to style-version churn) and nudges the big color fields — the land
 * canvas and water — toward the brand cream / muted tones. Every write is
 * guarded so a missing layer or unsupported paint property is a no-op, never a
 * throw. Call once the map's style has loaded.
 */
export function applyBrandBasemap(map: mapboxgl.Map): void {
  const LAND = '#faf4ec' // warm cream canvas, in the brand background family
  const WATER = '#c7d4d8' // muted blue-gray, low saturation so pins stay legible
  let layers: { id: string; type: string }[]
  try {
    layers = (map.getStyle()?.layers ?? []) as { id: string; type: string }[]
  } catch {
    return
  }
  for (const layer of layers) {
    const { id, type } = layer
    try {
      if (type === 'background') {
        map.setPaintProperty(id, 'background-color', LAND)
      } else if (type === 'fill' && id === 'land') {
        map.setPaintProperty(id, 'fill-color', LAND)
      } else if (type === 'fill' && /water/i.test(id)) {
        map.setPaintProperty(id, 'fill-color', WATER)
      } else if (type === 'line' && /water/i.test(id)) {
        map.setPaintProperty(id, 'line-color', WATER)
      }
    } catch {
      // layer doesn't support this paint property under the current style — skip
    }
  }
}

export function initializeMapbox(
  mapbox: typeof mapboxgl,
  container: HTMLElement,
  token: string,
): mapboxgl.Map {
  mapbox.accessToken = token
  const map = new mapbox.Map(createMapOptions(container))
  map.addControl(new mapbox.NavigationControl({ showCompass: false }), 'bottom-right')
  return map
}

export function shouldShowRecenter(mapReady: boolean, failed: boolean): boolean {
  return mapReady && !failed
}

interface FailureMap {
  loaded: () => boolean
  on: (event: string, handler: (event?: { error?: Error }) => void) => unknown
}

export function attachMapFailureFallback(
  map: FailureMap,
  callbacks: { onReady: () => void; onFailure: () => void },
): () => void {
  let postLoadErrorCount = 0
  let degradationTimer: number | null = null
  let failed = false
  let hasLoaded = false
  const fail = () => {
    if (failed) return
    failed = true
    callbacks.onFailure()
  }
  const clearDegradation = () => {
    postLoadErrorCount = 0
    if (degradationTimer !== null) window.clearTimeout(degradationTimer)
    degradationTimer = null
  }
  const initialTimer = window.setTimeout(() => {
    if (!map.loaded()) fail()
  }, 10_000)

  map.on('load', () => {
    hasLoaded = true
    window.clearTimeout(initialTimer)
    clearDegradation()
    callbacks.onReady()
  })
  map.on('idle', clearDegradation)
  map.on('error', (event) => {
    const message = event?.error?.message ?? ''
    if (!hasLoaded) {
      if (/token|401|403|style/i.test(message)) fail()
      return
    }
    postLoadErrorCount += 1
    if (postLoadErrorCount < 3 || degradationTimer !== null) return
    degradationTimer = window.setTimeout(fail, 3_000)
  })

  return () => {
    window.clearTimeout(initialTimer)
    clearDegradation()
  }
}

export function getFitCoordinates(
  recommendations: RecommendationSpot[],
  origin: LatLng,
): [number, number][] {
  const coordinates = recommendations
    .filter((spot) => isWithinSanFrancisco(spot.point))
    .map((spot): [number, number] => [spot.point.lng, spot.point.lat])
  if (isWithinSanFrancisco(origin)) coordinates.push([origin.lng, origin.lat])
  return coordinates
}
