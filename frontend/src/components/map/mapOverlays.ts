import type { GeoJSONSource, Map as MapboxMap } from 'mapbox-gl'
import type {
  ClosuresResponse,
  VendorCollection,
  VendorFeature,
} from '../../types/contract'

export function replaceMapMarkers<T extends { remove: () => void }>(
  current: T[],
  vendors: VendorCollection | null,
  createMarker: (vendor: VendorFeature) => T,
): T[] {
  current.forEach((marker) => marker.remove())
  return vendors ? vendors.features.map(createMarker) : []
}

type ClosureMap = Pick<MapboxMap, 'getSource' | 'addSource' | 'addLayer'>
type VendorMap = Pick<MapboxMap, 'getSource' | 'addSource' | 'addLayer' | 'getLayer'>

function vendorData(vendors: VendorCollection | null) {
  return {
    type: 'FeatureCollection' as const,
    features: (vendors?.features ?? []).map((vendor) => ({
      type: 'Feature' as const,
      properties: vendor.properties,
      geometry: vendor.geometry,
    })),
  }
}

export function syncVendorOverlay(map: VendorMap, vendors: VendorCollection | null): void {
  const data = vendorData(vendors)
  const source = map.getSource('vendors') as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    return
  }
  if (!vendors) return
  map.addSource('vendors', { type: 'geojson', data })
  map.addLayer({
    id: 'vendor-dots',
    type: 'circle',
    source: 'vendors',
    minzoom: 13.2,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13.2, 3, 15, 5],
      'circle-color': '#64748B',
      'circle-stroke-color': '#FFFFFF',
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.88,
    },
  })
}

export function syncClosureOverlay(
  map: ClosureMap,
  closures: ClosuresResponse | null,
): void {
  const data = {
    type: 'FeatureCollection' as const,
    features: (closures?.closures ?? []).map((closure) => ({
      type: 'Feature' as const,
      properties: { id: closure.id, reason: closure.reason, source: closure.source },
      geometry: closure.geometry,
    })),
  }
  const source = map.getSource('closures') as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    return
  }
  if (!closures) return
  map.addSource('closures', { type: 'geojson', data })
  map.addLayer({
    id: 'closure-fill',
    type: 'fill',
    source: 'closures',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#DC2626', 'fill-opacity': 0.2 },
  })
  map.addLayer({
    id: 'closure-lines',
    type: 'line',
    source: 'closures',
    paint: {
      'line-color': '#DC2626',
      'line-width': 5,
      'line-opacity': 0.75,
      'line-dasharray': [1.2, 1],
    },
  })
}
