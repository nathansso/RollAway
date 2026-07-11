import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { useAppStore } from '../../store'
import { isWithinSanFrancisco } from '../../lib/sfBounds'
import {
  buildSpotMarkerElement,
  buildUserMarkerElement,
  buildVendorPopup,
  vendorMarkerLabel,
} from './markers'
import {
  attachMapFailureFallback,
  getFitCoordinates,
  initializeMapbox,
  shouldShowRecenter,
} from './mapBounds'
import { syncClosureOverlay, syncVendorOverlay } from './mapOverlays'

const MAPBOX_TOKEN = String(import.meta.env.VITE_MAPBOX_TOKEN ?? '')
const MAP_ENABLED = Boolean(MAPBOX_TOKEN)

export function FallbackMap() {
  const vendors = useAppStore((state) => state.vendors)
  const closures = useAppStore((state) => state.closures)
  const recommendations = useAppStore((state) => state.recommendations)
  const selectSpot = useAppStore((state) => state.selectSpot)
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null)
  const selectedVendorFeature = vendors?.features.find(
    (vendor) => vendor.properties.permit_id === selectedVendor,
  )

  return (
    <div className="fallback-map" role="region" aria-label="Schematic map of SoMa">
      <div className="fallback-map__grid" aria-hidden="true" />
      <div className="fallback-map__street fallback-map__street--one" aria-hidden="true" />
      <div className="fallback-map__street fallback-map__street--two" aria-hidden="true" />
      {(closures?.count ?? 0) > 0 && (
        <div className="fallback-map__closure" aria-hidden="true" />
      )}
      <div className="fallback-map__label fallback-map__label--one">Howard St</div>
      <div className="fallback-map__label fallback-map__label--two">Mission St</div>
      <div className="fallback-map__user" aria-label="Approximate location" />
      {(vendors?.features ?? []).slice(0, 9).map((vendor, index) => (
        <button
          key={vendor.properties.permit_id}
          type="button"
          className="fallback-map__vendor"
          title={vendor.properties.name}
          aria-label={vendorMarkerLabel(vendor.properties)}
          aria-pressed={selectedVendor === vendor.properties.permit_id}
          onClick={() => setSelectedVendor(vendor.properties.permit_id)}
          style={{
            left: `${18 + ((index * 17) % 68)}%`,
            top: `${25 + ((index * 23) % 48)}%`,
          }}
        />
      ))}
      {selectedVendorFeature && (
        <div className="fallback-map__vendor-detail" role="status">
          {vendorMarkerLabel(selectedVendorFeature.properties)}
        </div>
      )}
      {recommendations.map((spot, index) => (
        <button
          key={spot.id}
          type="button"
          className={`fallback-rank fallback-rank--${spot.verdict}`}
          style={{ left: `${37 + index * 17}%`, top: `${32 + index * 14}%` }}
          aria-label={`Suggested spot: ${spot.block_label}. Open details.`}
          onClick={() => selectSpot(spot.id)}
        >
          <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true">
            <circle cx="6" cy="6" r="3.5" fill="currentColor" />
          </svg>
        </button>
      ))}
      <div className="fallback-map__notice">
        <strong>Map preview</strong>
        <span>
          {MAPBOX_TOKEN
            ? 'Map tiles are unavailable. Rollaway data remains usable.'
            : 'Add a public Mapbox token for live streets and pan controls.'}
        </span>
        <span className="mt-1 text-[11px]">
          {vendors?.features.length ?? 0} vendors · {closures?.count ?? 0} active closures
        </span>
      </div>
    </div>
  )
}

export function RecenterControl({ onRecenter }: { onRecenter: () => void }) {
  return (
    <button
      type="button"
      className="map-recenter"
      aria-label="Recenter map on your origin"
      onClick={onRecenter}
    >
      <span aria-hidden="true">◎</span>
    </button>
  )
}

interface MapViewProps {
  onViewReadyChange?: (ready: boolean) => void
}

export default function MapView({ onViewReadyChange }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const spotMarkers = useRef<mapboxgl.Marker[]>([])
  const vendorPopup = useRef<mapboxgl.Popup | null>(null)
  const userMarker = useRef<mapboxgl.Marker | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [failed, setFailed] = useState(!MAP_ENABLED)

  const vendors = useAppStore((state) => state.vendors)
  const closures = useAppStore((state) => state.closures)
  const recommendations = useAppStore((state) => state.recommendations)
  const location = useAppStore((state) => state.location)
  const locationStatus = useAppStore((state) => state.locationStatus)
  const selectedSpotId = useAppStore((state) => state.selectedSpotId)
  const baseDataError = useAppStore((state) => state.baseDataError)

  useEffect(() => {
    if (!MAP_ENABLED || !containerRef.current) return
    let map: mapboxgl.Map
    try {
      map = initializeMapbox(mapboxgl, containerRef.current, MAPBOX_TOKEN)
    } catch {
      setFailed(true)
      return
    }
    mapRef.current = map
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(containerRef.current)
    const clearFailureHandlers = attachMapFailureFallback(map, {
      onReady: () => {
        setFailed(false)
        setMapReady(true)
        map.resize()
      },
      onFailure: () => setFailed(true),
    })
    return () => {
      clearFailureHandlers()
      observer.disconnect()
      spotMarkers.current.forEach((marker) => marker.remove())
      vendorPopup.current?.remove()
      userMarker.current?.remove()
      spotMarkers.current = []
      vendorPopup.current = null
      userMarker.current = null
      mapRef.current = null
      map.remove()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    vendorPopup.current?.remove()
    vendorPopup.current = null
    syncVendorOverlay(map, vendors)
  }, [vendors, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const onVendorClick = (event: mapboxgl.MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      if (!feature?.geometry || feature.geometry.type !== 'Point') return
      const [lng, lat] = feature.geometry.coordinates as [number, number]
      map.easeTo({
        center: [lng, lat],
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350,
      })
      vendorPopup.current?.remove()
      vendorPopup.current = new mapboxgl.Popup({ offset: 14, maxWidth: '260px' })
        .setLngLat([lng, lat])
        .setDOMContent(buildVendorPopup(feature.properties as never))
        .addTo(map)
    }
    const onVendorEnter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const onVendorLeave = () => {
      map.getCanvas().style.cursor = ''
    }
    map.on('click', 'vendor-dots', onVendorClick)
    map.on('mouseenter', 'vendor-dots', onVendorEnter)
    map.on('mouseleave', 'vendor-dots', onVendorLeave)
    return () => {
      map.off('click', 'vendor-dots', onVendorClick)
      map.off('mouseenter', 'vendor-dots', onVendorEnter)
      map.off('mouseleave', 'vendor-dots', onVendorLeave)
    }
  }, [mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    syncClosureOverlay(map, closures)
  }, [closures, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    spotMarkers.current.forEach((marker) => marker.remove())
    spotMarkers.current = recommendations.map((spot) => {
      const element = buildSpotMarkerElement(spot, () =>
        useAppStore.getState().selectSpot(spot.id),
      )
      return new mapboxgl.Marker({ element, anchor: 'bottom' })
        .setLngLat([spot.point.lng, spot.point.lat])
        .addTo(map)
    })
    if (recommendations.length > 0) {
      const bounds = new mapboxgl.LngLatBounds()
      getFitCoordinates(recommendations, location).forEach((coordinate) =>
        bounds.extend(coordinate),
      )
      map.fitBounds(bounds, {
        padding: { top: 190, right: 55, bottom: 230, left: 55 },
        maxZoom: 15.5,
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700,
      })
    }
  }, [location, recommendations, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    if (!userMarker.current) {
      userMarker.current = new mapboxgl.Marker({
        element: buildUserMarkerElement(),
        anchor: 'center',
      })
        .setLngLat([location.lng, location.lat])
        .addTo(map)
    }
    userMarker.current.setLngLat([location.lng, location.lat])
    if (locationStatus === 'granted') {
      map.easeTo({
        center: [location.lng, location.lat],
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450,
      })
    }
  }, [location, locationStatus, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !selectedSpotId) return
    const selected = recommendations.find((spot) => spot.id === selectedSpotId)
    if (!selected || !isWithinSanFrancisco(selected.point)) return
    map.easeTo({
      center: [selected.point.lng, selected.point.lat],
      zoom: Math.max(map.getZoom(), 15),
      duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450,
    })
  }, [mapReady, recommendations, selectedSpotId])

  const recenter = () => {
    mapRef.current?.easeTo({
      center: [location.lng, location.lat],
      zoom: Math.max(mapRef.current.getZoom(), 14),
      duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450,
    })
  }

  useEffect(() => {
    const baseLayersReady =
      (vendors !== null && closures !== null) || Boolean(baseDataError)
    onViewReadyChange?.((failed || mapReady) && baseLayersReady)
  }, [baseDataError, closures, failed, mapReady, onViewReadyChange, vendors])

  return (
    <div className="absolute inset-0 bg-background">
      <div
        ref={containerRef}
        className={`absolute inset-0 h-full w-full ${failed || !mapReady ? 'invisible' : ''}`}
        role="application"
        aria-label="Interactive map of recommendations, permitted vendors, closures, and your location"
      />
      {(failed || !mapReady) && <FallbackMap />}
      {shouldShowRecenter(mapReady, failed) && <RecenterControl onRecenter={recenter} />}
      {baseDataError && (
        <div
          role="alert"
          className="absolute inset-x-3 top-[17rem] z-10 mx-auto max-w-sm rounded-xl border border-destructive/30 bg-white/95 px-4 py-3 text-sm font-medium text-destructive shadow-md"
        >
          {baseDataError}
        </div>
      )}
    </div>
  )
}
