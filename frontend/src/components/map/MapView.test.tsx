// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../lib/apiClient'
import { useAppStore } from '../../store'
import type { RecommendationSpot } from '../../types/contract'
import {
  FallbackMap,
  RecenterControl,
} from './MapView'
import {
  attachMapFailureFallback,
  getFitCoordinates,
  initializeMapbox,
  SF_MAX_BOUNDS,
  shouldShowRecenter,
} from './mapBounds'
import { buildVendorMarkerElement } from './markers'
import { replaceMapMarkers, syncClosureOverlay, syncVendorOverlay } from './mapOverlays'
import RecommendationTray from './RecommendationTray'

let spots: RecommendationSpot[]

beforeEach(async () => {
  const state = useAppStore.getState()
  const response = await apiClient.recommendSpots(
    {
      user_profile: {
        schema_version: 1,
        vendor_type: 'truck',
        cuisine: 'mexican',
        menu: { raw: 'Tacos $5', items: [], price_tier: '$' },
        home_base: { label: 'SoMa', point: null },
        max_travel: { value: 20, unit: 'minutes' },
        operating_windows: [],
        permit_status: 'researching',
        autofill_profile: {
          owner_name: '',
          business_name: '',
          email: '',
          phone: '',
          address: '',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '',
        },
      },
      location: state.location,
      when: state.when,
    },
    { delayMs: 0 },
  )
  spots = response.recommendations
  useAppStore.setState({
    vendors: await apiClient.getVendors(state.location, state.when),
    recommendations: spots,
    recommendationStatus: 'success',
    selectedSpotId: null,
  })
})

afterEach(cleanup)

describe('map result interaction', () => {
  it('fits recommendations and only includes an SF origin', () => {
    expect(getFitCoordinates(spots, { lat: 37.7793, lng: -122.4013 })).toHaveLength(4)
    expect(getFitCoordinates(spots, { lat: 37.8044, lng: -122.2712 })).toHaveLength(3)
  })

  it('shows estimated city minutes and miles in recommendation cards', () => {
    render(<RecommendationTray />)

    expect(screen.getAllByText('Estimated city travel')).toHaveLength(3)
    expect(screen.getByText(`${spots[0].travel_minutes} min`)).toBeDefined()
    expect(screen.getByText(`${spots[0].travel_distance_miles.toFixed(1)} mi`)).toBeDefined()
  })

  it('moves card focus with horizontal arrow keys', async () => {
    const user = userEvent.setup()
    render(<RecommendationTray />)
    const cards = screen.getAllByRole('button', { name: /Open details for rank/ })

    cards[0].focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(cards[1])
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(cards[0])
  })

  it('keeps fallback markers keyboard-selectable without a Mapbox token', async () => {
    const user = userEvent.setup()
    render(<FallbackMap />)

    const marker = screen.getByRole('button', { name: /Recommendation 1:/ })
    marker.focus()
    await user.keyboard('{Enter}')
    expect(useAppStore.getState().selectedSpotId).toBe(spots[0].id)
  })

  it('makes fallback vendors keyboard-accessible with useful details', async () => {
    const user = userEvent.setup()
    render(<FallbackMap />)

    const vendor = screen.getAllByRole('button', {
      name: /Vendor .* cuisine .* permit status/i,
    })[0]
    vendor.focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(vendor)
  })

  it('removes fallback vendor details if the selected vendor disappears', async () => {
    const user = userEvent.setup()
    render(<FallbackMap />)
    const vendor = screen.getAllByRole('button', {
      name: /Vendor .* cuisine .* permit status/i,
    })[0]

    await user.click(vendor)
    expect(screen.getByRole('status')).toBeDefined()
    act(() => useAppStore.setState({ vendors: null }))

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('removes old vendor markers when vendors become null', () => {
    const oldMarker = { remove: vi.fn() }
    const createMarker = vi.fn()

    expect(replaceMapMarkers([oldMarker] as never[], null, createMarker)).toEqual([])
    expect(oldMarker.remove).toHaveBeenCalledOnce()
    expect(createMarker).not.toHaveBeenCalled()
  })

  it('renders live vendor dots as a Mapbox-owned GeoJSON layer at local zooms only', () => {
    const map = {
      getSource: vi.fn(() => undefined),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getLayer: vi.fn(),
    }

    syncVendorOverlay(map as never, useAppStore.getState().vendors)

    expect(map.addSource).toHaveBeenCalledWith(
      'vendors',
      expect.objectContaining({
        type: 'geojson',
        data: expect.objectContaining({
          type: 'FeatureCollection',
          features: expect.arrayContaining([
            expect.objectContaining({ geometry: expect.objectContaining({ type: 'Point' }) }),
          ]),
        }),
      }),
    )
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'vendor-dots',
        type: 'circle',
        minzoom: 13.2,
      }),
    )
  })

  it('empties the vendor source instead of leaving stale dots on refresh', () => {
    const setData = vi.fn()
    const map = {
      getSource: vi.fn(() => ({ setData })),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getLayer: vi.fn(),
    }

    syncVendorOverlay(map as never, null)

    expect(setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] })
    expect(map.addSource).not.toHaveBeenCalled()
  })

  it('empties an existing closure source when closures become null', () => {
    const setData = vi.fn()
    const map = {
      getSource: vi.fn(() => ({ setData })),
      addSource: vi.fn(),
      addLayer: vi.fn(),
    }

    syncClosureOverlay(map as never, null)

    expect(setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] })
    expect(map.addSource).not.toHaveBeenCalled()
  })

  it('builds live vendor buttons with meaningful labels and activation', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const props = useAppStore.getState().vendors!.features[0].properties
    const marker = buildVendorMarkerElement(props, onSelect)
    document.body.append(marker)

    expect(marker.tagName).toBe('BUTTON')
    expect(marker.getAttribute('aria-label')).toMatch(
      new RegExp(`${props.name}.*${props.cuisine}.*${props.status}`, 'i'),
    )
    marker.focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledOnce()
    marker.remove()
  })

  it('exposes a keyboard-operable origin recenter control', async () => {
    const user = userEvent.setup()
    const onRecenter = vi.fn()
    render(<RecenterControl onRecenter={onRecenter} />)

    const control = screen.getByRole('button', { name: 'Recenter map on your origin' })
    control.focus()
    await user.keyboard('{Enter}')
    expect(onRecenter).toHaveBeenCalledOnce()
    expect(shouldShowRecenter(false, true)).toBe(false)
    expect(shouldShowRecenter(true, false)).toBe(true)
  })

  it('initializes Mapbox with SF max bounds independently from fixture mode', () => {
    const map = { addControl: vi.fn() }
    const Map = vi.fn(function MapMock() {
      return map
    })
    const NavigationControl = vi.fn(function NavigationControlMock() {
      return { control: true }
    })
    const mapbox = { accessToken: '', Map, NavigationControl }
    const container = document.createElement('div')

    expect(initializeMapbox(mapbox as never, container, 'test-public-token')).toBe(map)
    expect(mapbox.accessToken).toBe('test-public-token')
    expect(Map).toHaveBeenCalledWith(
      expect.objectContaining({
        container,
        maxBounds: SF_MAX_BOUNDS,
      }),
    )
    expect(map.addControl).toHaveBeenCalledOnce()
  })

  it('transitions to fallback after sustained post-load map errors', () => {
    vi.useFakeTimers()
    const handlers = new Map<string, (event?: { error?: Error }) => void>()
    const map = {
      loaded: vi.fn(() => false),
      on: vi.fn((event: string, handler: (event?: { error?: Error }) => void) => {
        handlers.set(event, handler)
      }),
    }
    const onReady = vi.fn()
    const onFailure = vi.fn()
    const cleanupFailureHandlers = attachMapFailureFallback(map, {
      onReady,
      onFailure,
    })

    handlers.get('load')!()
    expect(onReady).toHaveBeenCalledOnce()
    handlers.get('error')!({ error: new Error('tile failed') })
    handlers.get('error')!({ error: new Error('tile failed') })
    handlers.get('error')!({ error: new Error('style failed') })
    vi.advanceTimersByTime(2_999)
    expect(onFailure).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onFailure).toHaveBeenCalledOnce()

    cleanupFailureHandlers()
    vi.useRealTimers()
  })
})
