import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import type { GeoJSONSource } from 'mapbox-gl'
import { useAppStore } from '../../store'
import { apiClient } from '../../lib/apiClient'
import {
  buildSpotMarkerElement,
  buildUserMarkerElement,
  buildVendorPopup,
} from './markers'

const MAPBOX_TOKEN = String(import.meta.env.VITE_MAPBOX_TOKEN ?? '')
const MAP_ENABLED = Boolean(MAPBOX_TOKEN) && !apiClient.useFixtures
const MAP_STYLE = 'mapbox://styles/mapbox/streets-v12'

function FallbackMap() {
  const vendors = useAppStore((state) => state.vendors)
  const closures = useAppStore((state) => state.closures)
  const recommendations = useAppStore((state) => state.recommendations)
  const selectSpot = useAppStore((state) => state.selectSpot)

  return (
    <div className="fallback-map" role="region" aria-label="Schematic map of SoMa">
      <div className="fallback-map__grid" aria-hidden="true" />
      <div className="fallback-map__street fallback-map__street--one" aria-hidden="true" />
      <div className="fallback-map__street fallback-map__street--two" aria-hidden="true" />
      <div className="fallback-map__closure" aria-hidden="true" />
      <div className="fallback-map__label fallback-map__label--one">Howard St</div>
      <div className="fallback-map__label fallback-map__label--two">Mission St</div>
      <div className="fallback-map__user" aria-label="Approximate location" />
      {(vendors?.features ?? []).slice(0, 9).map((vendor, index) => (
        <span
          key={vendor.properties.permit_id}
          className="fallback-map__vendor"
          title={vendor.properties.name}
          style={{
            left: `${18 + ((index * 17) % 68)}%`,
            top: `${25 + ((index * 23) % 48)}%`,
          }}
        />
      ))}
      {recommendations.map((spot, index) => (
        <button
          key={spot.id}
          type="button"
          className={`fallback-rank fallback-rank--${spot.verdict}`}
          style={{ left: `${37 + index * 17}%`, top: `${32 + index * 14}%` }}
          aria-label={`Recommendation ${spot.rank}: ${spot.block_label}. Open details.`}
          onClick={() => selectSpot(spot.id)}
        >
          {spot.rank}
        </button>
      ))}
      <div className="fallback-map__notice">
        <strong>Map preview</strong>
        <span>
          {MAPBOX_TOKEN
            ? apiClient.useFixtures
              ? 'Offline-safe fixture map. No tile requests are made in demo mode.'
              : 'Map tiles are unavailable. RollAway data remains usable.'
            : 'Add a public Mapbox token for live streets and pan controls.'}
        </span>
        <span className="mt-1 text-[11px]">
          {vendors?.features.length ?? 0} vendors · {closures?.count ?? 0} active closures
        </span>
      </div>
    </div>
  )
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const spotMarkers = useRef<mapboxgl.Marker[]>([])
  const userMarker = useRef<mapboxgl.Marker | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [failed, setFailed] = useState(!MAP_ENABLED)

  const vendors = useAppStore((state) => state.vendors)
  const closures = useAppStore((state) => state.closures)
  const recommendations = useAppStore((state) => state.recommendations)
  const location = useAppStore((state) => state.location)
  const locationStatus = useAppStore((state) => state.locationStatus)

  useEffect(() => {
    if (!MAP_ENABLED || !containerRef.current) return
    mapboxgl.accessToken = MAPBOX_TOKEN
    let map: mapboxgl.Map
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [-122.4013, 37.7835],
        zoom: 14,
        attributionControl: true,
      })
    } catch {
      setFailed(true)
      return
    }
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(containerRef.current)
    const failTimer = window.setTimeout(() => {
      if (!map.loaded()) setFailed(true)
    }, 10000)
    map.on('load', () => {
      window.clearTimeout(failTimer)
      setFailed(false)
      setMapReady(true)
      map.resize()
    })
    map.on('error', (event) => {
      if (!map.loaded() && /token|401|403|style/i.test(event.error?.message ?? '')) {
        setFailed(true)
      }
    })
    return () => {
      window.clearTimeout(failTimer)
      observer.disconnect()
      spotMarkers.current.forEach((marker) => marker.remove())
      userMarker.current?.remove()
      spotMarkers.current = []
      userMarker.current = null
      mapRef.current = null
      map.remove()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !vendors) return
    const source = map.getSource('vendors') as GeoJSONSource | undefined
    if (source) {
      source.setData(vendors)
      return
    }
    map.addSource('vendors', { type: 'geojson', data: vendors })
    map.addLayer({
      id: 'vendors-hit',
      type: 'circle',
      source: 'vendors',
      paint: { 'circle-radius': 22, 'circle-opacity': 0 },
    })
    map.addLayer({
      id: 'vendors-muted',
      type: 'circle',
      source: 'vendors',
      paint: {
        'circle-radius': 6,
        'circle-color': '#64748B',
        'circle-opacity': 0.62,
        'circle-stroke-color': '#FFFFFF',
        'circle-stroke-width': 1.5,
      },
    })
    map.on('click', 'vendors-hit', (event) => {
      const feature = event.features?.[0]
      if (!feature || feature.geometry.type !== 'Point') return
      const [lng, lat] = feature.geometry.coordinates
      new mapboxgl.Popup({ offset: 14, maxWidth: '260px' })
        .setLngLat([lng, lat])
        .setDOMContent(buildVendorPopup(feature.properties as never))
        .addTo(map)
    })
    map.on('mouseenter', 'vendors-hit', () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', 'vendors-hit', () => {
      map.getCanvas().style.cursor = ''
    })
  }, [vendors, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !closures) return
    const data = {
      type: 'FeatureCollection' as const,
      features: closures.closures.map((closure) => ({
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
      recommendations.forEach((spot) => bounds.extend([spot.point.lng, spot.point.lat]))
      map.fitBounds(bounds, {
        padding: { top: 190, right: 55, bottom: 230, left: 55 },
        maxZoom: 15.5,
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700,
      })
    }
  }, [recommendations, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    if (!userMarker.current) {
      userMarker.current = new mapboxgl.Marker({
        element: buildUserMarkerElement(),
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

  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        className={`absolute inset-0 h-full w-full ${failed || !mapReady ? 'invisible' : ''}`}
        role="application"
        aria-label="Interactive map of recommendations, permitted vendors, closures, and your location"
      />
      {(failed || !mapReady) && <FallbackMap />}
    </div>
  )
}
