/**
 * MapView — the app's centerpiece. Full-screen Mapbox map that renders:
 *  - the seed layer of permitted vendors (clustered, color-coded by status)
 *  - scored spots from the copilot (verdict-colored pin markers with scores)
 *  - a pin-drop mode so vendors can ask "am I allowed here?"
 *
 * It reads/writes ONLY the zustand store: mapCenter syncs out on moveend,
 * spot taps call selectSpot, pin drops call setPinnedPoint.
 */

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import type { GeoJSONSource } from 'mapbox-gl'
import type { Point } from 'geojson'
import { useAppStore } from '../../store'
import { loadVendors } from '../../lib/vendorSource'
import type { VendorProperties } from '../../types/contract'
import {
  buildPinElement,
  buildSpotMarkerElement,
  buildVendorPopup,
} from './markers'

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ?? ''
const MAP_STYLE = 'mapbox://styles/mapbox/streets-v12'

const VENDOR_SOURCE = 'vendors'
const LAYER_CLUSTERS = 'vendor-clusters'
const LAYER_CLUSTER_COUNT = 'vendor-cluster-count'
const LAYER_POINTS = 'vendor-points'
const LAYER_POINTS_HIT = 'vendor-points-hit'

// Vendor permit-status colors (green = active, amber = pending, slate = inactive)
const STATUS_ACTIVE = '#16a34a'
const STATUS_PENDING = '#d97706'
const STATUS_INACTIVE = '#94a3b8'

type MapFailure = 'missing-token' | 'load-failed'

/** Fetches the seed vendors and adds the clustered source + layers. */
async function addVendorLayers(map: mapboxgl.Map): Promise<void> {
  const vendors = await loadVendors()
  try {
    if (map.getSource(VENDOR_SOURCE)) return
    map.addSource(VENDOR_SOURCE, {
      type: 'geojson',
      data: vendors,
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50,
    })

    map.addLayer({
      id: LAYER_CLUSTERS,
      type: 'circle',
      source: VENDOR_SOURCE,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#ea580c', // brand primary
        'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 25, 26],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    })

    map.addLayer({
      id: LAYER_CLUSTER_COUNT,
      type: 'symbol',
      source: VENDOR_SOURCE,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 13,
      },
      paint: { 'text-color': '#ffffff' },
    })

    // Invisible hit-area under each vendor dot: the visible dot is only
    // ~18px, so taps land on this larger transparent circle instead.
    map.addLayer({
      id: LAYER_POINTS_HIT,
      type: 'circle',
      source: VENDOR_SOURCE,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': 22,
        'circle-opacity': 0,
      },
    })

    map.addLayer({
      id: LAYER_POINTS,
      type: 'circle',
      source: VENDOR_SOURCE,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': [
          'match',
          ['get', 'status'],
          'APPROVED',
          STATUS_ACTIVE,
          'ISSUED',
          STATUS_ACTIVE,
          'REQUESTED',
          STATUS_PENDING,
          /* EXPIRED / SUSPEND / anything else */ STATUS_INACTIVE,
        ],
        'circle-radius': 7,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    })
  } catch {
    // Map was removed while vendors were loading — nothing to clean up.
  }
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const spotMarkersRef = useRef<mapboxgl.Marker[]>([])
  const pinMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const lastEpochRef = useRef(0)
  const loadedRef = useRef(false)

  const [failure, setFailure] = useState<MapFailure | null>(
    MAPBOX_TOKEN ? null : 'missing-token',
  )

  const spots = useAppStore((s) => s.spots)
  const spotsEpoch = useAppStore((s) => s.spotsEpoch)
  const pinMode = useAppStore((s) => s.pinMode)
  const pinnedPoint = useAppStore((s) => s.pinnedPoint)

  // --- map lifecycle: create exactly once, tear down fully on unmount ---
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return

    mapboxgl.accessToken = MAPBOX_TOKEN
    let map: mapboxgl.Map
    try {
      const center = useAppStore.getState().mapCenter
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [center.lng, center.lat],
        zoom: 13,
      })
    } catch {
      setFailure('load-failed')
      return
    }
    mapRef.current = map

    // The container can be zero-height at construction (font/CSS timing) and
    // changes size with mobile browser chrome — keep the canvas in sync.
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(containerRef.current)

    map.on('load', () => {
      loadedRef.current = true
      map.resize()
      void addVendorLayers(map)
    })

    // Fatal only before first load (bad/expired token, blocked style fetch).
    // Transient tile errors on a working map shouldn't nuke it.
    map.on('error', (e) => {
      const msg = e.error?.message ?? ''
      if (!loadedRef.current && /token|unauthorized|forbidden|401|403/i.test(msg)) {
        setFailure('load-failed')
      }
    })

    // Keep the store's map_center in sync so chat requests carry it.
    map.on('moveend', () => {
      const c = map.getCenter()
      useAppStore.getState().setMapCenter({ lat: c.lat, lng: c.lng })
    })

    // Pin-drop: a plain map tap sets the pinned point while pin mode is on.
    map.on('click', (e) => {
      const s = useAppStore.getState()
      if (!s.pinMode) return
      s.setPinnedPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    })

    // Cluster tap -> zoom into the cluster (unless the user is dropping a pin).
    map.on('click', LAYER_CLUSTERS, (e) => {
      if (useAppStore.getState().pinMode) return
      const feature = e.features?.[0]
      if (!feature || feature.geometry.type !== 'Point') return
      const clusterId = feature.properties?.cluster_id as number | undefined
      if (clusterId === undefined) return
      const source = map.getSource(VENDOR_SOURCE) as GeoJSONSource | undefined
      source?.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err || zoom === null || zoom === undefined) return
        map.easeTo({
          center: (feature.geometry as Point).coordinates as [number, number],
          zoom,
          duration: 300,
        })
      })
    })

    // Vendor tap -> popup with name, cuisine, type, status chip.
    map.on('click', LAYER_POINTS_HIT, (e) => {
      if (useAppStore.getState().pinMode) return
      const feature = e.features?.[0]
      if (!feature || feature.geometry.type !== 'Point') return
      const props = feature.properties as unknown as VendorProperties
      const [lng, lat] = feature.geometry.coordinates
      new mapboxgl.Popup({ offset: 14, maxWidth: '260px' })
        .setLngLat([lng, lat])
        .setDOMContent(buildVendorPopup(props))
        .addTo(map)
    })

    for (const layer of [LAYER_CLUSTERS, LAYER_POINTS_HIT]) {
      map.on('mouseenter', layer, () => {
        if (!useAppStore.getState().pinMode) {
          map.getCanvas().style.cursor = 'pointer'
        }
      })
      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = useAppStore.getState().pinMode
          ? 'crosshair'
          : ''
      })
    }

    return () => {
      ro.disconnect()
      for (const m of spotMarkersRef.current) m.remove()
      spotMarkersRef.current = []
      pinMarkerRef.current?.remove()
      pinMarkerRef.current = null
      loadedRef.current = false
      mapRef.current = null
      map.remove()
    }
  }, [])

  // --- scored spots: verdict pins + fit-to-bounds on each new batch ---
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const m of spotMarkersRef.current) m.remove()
    spotMarkersRef.current = spots.map((spot) => {
      const el = buildSpotMarkerElement(spot, () =>
        useAppStore.getState().selectSpot(spot.id),
      )
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([spot.point.lng, spot.point.lat])
        .addTo(map)
      // mapbox stamps role="img" on marker elements; ours are real buttons
      el.setAttribute('role', 'button')
      return marker
    })

    if (spots.length > 0 && spotsEpoch !== lastEpochRef.current) {
      lastEpochRef.current = spotsEpoch
      const bounds = new mapboxgl.LngLatBounds()
      for (const s of spots) bounds.extend([s.point.lng, s.point.lat])
      map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 900 })
    }
  }, [spots, spotsEpoch])

  // --- pin-drop marker: exists only while pin mode is on and a point is set ---
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!pinMode || !pinnedPoint) {
      pinMarkerRef.current?.remove()
      pinMarkerRef.current = null
      return
    }

    if (pinMarkerRef.current) {
      pinMarkerRef.current.setLngLat([pinnedPoint.lng, pinnedPoint.lat])
      return
    }

    const marker = new mapboxgl.Marker({
      element: buildPinElement(),
      anchor: 'bottom',
      draggable: true,
    })
      .setLngLat([pinnedPoint.lng, pinnedPoint.lat])
      .addTo(map)
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLngLat()
      useAppStore.getState().setPinnedPoint({ lat, lng })
    })
    pinMarkerRef.current = marker
  }, [pinMode, pinnedPoint])

  // --- crosshair cursor while pin mode is on ---
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = pinMode ? 'crosshair' : ''
  }, [pinMode])

  return (
    <div className="absolute inset-0">
      {/* h-full/w-full are load-bearing: mapbox's unlayered `.mapboxgl-map
          {position:relative}` overrides Tailwind's layered `absolute`, so
          inset-0 alone collapses this container to zero height. */}
      <div
        ref={containerRef}
        className="absolute inset-0 h-full w-full"
        role="application"
        aria-label="Map of San Francisco street-food vendors and scored spots"
      />

      {pinMode && !failure && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center">
          <div className="flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="7" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
            Tap the map to drop a pin
          </div>
        </div>
      )}

      {failure && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background p-6">
          <div className="max-w-sm rounded-2xl border border-border bg-white p-6 text-center shadow-lg">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-primary">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
                <path d="M9 4v14M15 6v14" />
              </svg>
            </div>
            <h2 className="mt-4 font-display text-xl text-foreground">
              Map unavailable
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {failure === 'missing-token'
                ? 'No Mapbox token found. Add VITE_MAPBOX_TOKEN to frontend/.env and restart the dev server.'
                : "The map couldn't load. The Mapbox token may be invalid, or the network is blocking Mapbox."}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Chat and the permit checklist still work without the map.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
