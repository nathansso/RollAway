import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ClosuresResponse,
  PermitChecklist,
  RecommendSpotsResponse,
  VendorCollection,
  VendorProfile,
} from './types/contract'
import { PROFILE_STORAGE_KEY } from './lib/profile'

const api = vi.hoisted(() => ({
  recommendSpots: vi.fn(),
  getPermitChecklist: vi.fn(),
  getVendors: vi.fn(),
  getClosures: vi.fn(),
}))

vi.mock('./lib/apiClient', () => ({
  ApiClientError: class ApiClientError extends Error {},
  apiClient: api,
}))

const validProfile: VendorProfile = {
  schema_version: 1,
  vendor_type: 'truck',
  cuisine: 'mexican',
  menu: { raw: 'Tacos $5', items: [{ name: 'Tacos', price: 5 }], price_tier: '$' },
  home_base: { label: 'SoMa', point: null },
  max_travel: { value: 25, unit: 'minutes' },
  operating_windows: [{ day: 'fri', time_from: '11:00', time_to: '14:00' }],
  permit_status: 'researching',
  autofill_profile: {
    owner_name: 'Avery Rivera',
    business_name: 'Mission Tacos',
    email: 'avery@example.com',
    phone: '415-555-0100',
    address: '1 Mission St',
    city: 'San Francisco',
    state: 'CA',
    postal_code: '94103',
  },
}

const recommendations: RecommendSpotsResponse = {
  contract_version: 2,
  generated_for: {
    preset: 'today_lunch',
    date: '2026-07-11',
    day: 'sat',
    time_from: '11:00',
    time_to: '14:00',
    label: 'Today · lunch',
  },
  recommendations: [],
}

const permitChecklist: PermitChecklist = {
  vendor_type: 'truck',
  generated_at: '2026-07-11T00:00:00.000Z',
  sections: [],
}

const vendors: VendorCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-122.4013, 37.7793] },
      properties: {
        permit_id: 'vendor-1',
        name: 'Test Vendor',
        type: 'truck',
        cuisine: 'mexican',
        status: 'APPROVED',
      },
    },
  ],
}

const closures: ClosuresResponse = {
  count: 1,
  closures: [
    {
      id: 'closure-1',
      reason: 'Test closure',
      source: 'sfmta_event',
      active_from: '2026-07-11T00:00:00.000Z',
      active_to: '2026-07-11T23:59:59.000Z',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-122.4013, 37.7793],
          [-122.4003, 37.7803],
        ],
      },
    },
  ],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key)
    },
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

// Every launch is a fresh first-time user, so a "returning" vendor is set up by
// saving the profile through the store (not by pre-seeding localStorage).
async function loadStore(withProfile: VendorProfile | null = null) {
  localStorage.clear()
  vi.resetModules()
  const store = (await import('./store')).useAppStore
  if (withProfile) {
    store.getState().saveProfile(withProfile)
  }
  return store
}

describe('guided app store phases', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.stubGlobal('localStorage', createMemoryStorage())
    api.recommendSpots.mockReset().mockResolvedValue(recommendations)
    api.getPermitChecklist.mockReset().mockResolvedValue(permitChecklist)
    api.getVendors.mockReset()
    api.getClosures.mockReset()
  })

  it('advances through profile, recommendations, and explicit permit phases', async () => {
    const recommendationRequest = deferred<RecommendSpotsResponse>()
    const permitRequest = deferred<PermitChecklist>()
    api.recommendSpots.mockReturnValueOnce(recommendationRequest.promise)
    api.getPermitChecklist.mockReturnValueOnce(permitRequest.promise)
    const store = await loadStore()

    expect(store.getState().appPhase).toBe('profile')
    expect(store.getState().saveProfile(validProfile)).toBe(true)
    expect(store.getState().appPhase).toBe('loading_recommendations')

    const recommendationRun = store.getState().startRecommendations()
    expect(store.getState().appPhase).toBe('loading_recommendations')
    recommendationRequest.resolve(recommendations)
    await recommendationRun
    expect(store.getState().appPhase).toBe('ready')

    store.getState().setActiveTab('permits')
    const permitRun = store.getState().startPermitChecklist()
    expect(store.getState().appPhase).toBe('loading_permits')
    permitRequest.resolve(permitChecklist)
    await permitRun
    expect(store.getState().appPhase).toBe('ready')
    expect(store.getState().permitStatus).toBe('success')
  })

  it('always starts as a first-time user, ignoring any stored profile', async () => {
    // Even with a valid profile persisted from a previous session, every launch
    // opens on the onboarding/initialization page as a brand-new user.
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(validProfile))
    vi.resetModules()
    const store = (await import('./store')).useAppStore

    expect(store.getState().profile).toBeNull()
    expect(store.getState().appPhase).toBe('profile')
    expect(store.getState().profileEditorOpen).toBe(true)
  })

  it('keeps ready phase when an existing profile is edited', async () => {
    const store = await loadStore()
    store.getState().saveProfile(validProfile)
    await store.getState().startRecommendations()

    store.getState().saveProfile({
      ...validProfile,
      autofill_profile: {
        ...validProfile.autofill_profile,
        business_name: 'Updated Mission Tacos',
      },
    })

    expect(store.getState().appPhase).toBe('ready')
  })

  it('does not let a stale recommendation advance the phase', async () => {
    const request = deferred<RecommendSpotsResponse>()
    api.recommendSpots.mockReturnValueOnce(request.promise)
    const store = await loadStore(validProfile)

    const run = store.getState().startRecommendations()
    store.getState().setWhen({
      preset: 'custom',
      date: '2026-07-12',
      day: 'sun',
      time_from: '10:00',
      time_to: '13:00',
      label: 'Sunday brunch',
    })
    request.resolve(recommendations)
    await run

    expect(store.getState().appPhase).toBe('loading_recommendations')
    expect(store.getState().recommendations).toEqual([])
  })

  it('stays on the map (re-arming the search) when a profile is saved during recommendation loading', async () => {
    const request = deferred<RecommendSpotsResponse>()
    api.recommendSpots.mockReturnValueOnce(request.promise)
    const store = await loadStore(validProfile)

    const run = store.getState().startRecommendations()
    store.getState().saveProfile({
      ...validProfile,
      autofill_profile: {
        ...validProfile.autofill_profile,
        business_name: 'Updated Mission Tacos',
      },
    })
    request.resolve(recommendations)
    await run

    expect(store.getState().appPhase).toBe('loading_recommendations')
    expect(store.getState().recommendationStatus).toBe('idle')
    expect(store.getState().recommendations).toEqual([])
  })

  it('returns to ready and ignores a stale permit response after a profile edit', async () => {
    const request = deferred<PermitChecklist>()
    api.getPermitChecklist.mockReturnValueOnce(request.promise)
    const store = await loadStore(validProfile)
    await store.getState().startRecommendations()

    const run = store.getState().startPermitChecklist()
    store.getState().saveProfile({
      ...validProfile,
      autofill_profile: {
        ...validProfile.autofill_profile,
        business_name: 'Updated Mission Tacos',
      },
    })
    request.resolve(permitChecklist)
    await run

    expect(store.getState().appPhase).toBe('ready')
    expect(store.getState().permitStatus).toBe('idle')
    expect(store.getState().permitChecklist).toBeNull()
  })

  it('keeps recommendation failures on the map with a visible error', async () => {
    api.recommendSpots.mockRejectedValueOnce(new Error('network down'))
    const store = await loadStore(validProfile)

    await store.getState().startRecommendations()

    expect(store.getState().appPhase).toBe('ready')
    expect(store.getState().recommendationStatus).toBe('error')
    expect(store.getState().recommendationError).toBe(
      'Recommendations could not be loaded. Try again.',
    )
  })

  it('falls back to SoMa and shows a notice for locations outside San Francisco', async () => {
    const getCurrentPosition = vi.fn().mockImplementation((success) => {
      success({ coords: { latitude: 37.8044, longitude: -122.2712 } })
    })
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    const store = await loadStore(validProfile)

    store.getState().requestLocation()

    expect(store.getState()).toMatchObject({
      locationStatus: 'outside_sf',
      location: { lat: 37.7793, lng: -122.4013 },
      locationNotice:
        'Your location is outside San Francisco. Using the SoMa demo origin.',
    })
  })

  it('ignores a stale geolocation result so it cannot wipe a finished search', async () => {
    const successCallbacks: Array<(position: unknown) => void> = []
    const getCurrentPosition = vi.fn().mockImplementation((success) => {
      successCallbacks.push(success)
    })
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    const store = await loadStore(validProfile)

    // Two location requests can be in flight at once: StrictMode re-runs the
    // mount effect with the same render's values (so both see locationStatus
    // 'idle'), and a double pin tap does it too.
    store.getState().requestLocation()
    store.getState().requestLocation()
    expect(successCallbacks).toHaveLength(2)

    // The newest request wins, and the search that follows it succeeds.
    successCallbacks[1]({ coords: { latitude: 37.7793, longitude: -122.4013 } })
    await store.getState().startRecommendations()
    expect(store.getState().recommendationStatus).toBe('success')

    // The first request resolving late must not clear those results: it used to
    // reset them to 'idle', and appPhase is 'ready' by now, so the auto-search
    // never re-fired and the map stayed empty.
    successCallbacks[0]({ coords: { latitude: 37.8044, longitude: -122.2712 } })
    expect(store.getState()).toMatchObject({
      recommendationStatus: 'success',
      locationStatus: 'granted',
      location: { lat: 37.7793, lng: -122.4013 },
    })
  })

  it('boots a returning vendor to the map, migrating a profile saved without cuisine', async () => {
    vi.stubEnv('VITE_FORCE_FIRST_TIME_USER', 'false')
    localStorage.clear()
    // Written by a build that predates the cuisine field. Rejecting it would
    // send a returning vendor back through onboarding as if they were new.
    const { cuisine: _cuisine, ...profileSavedByOlderBuild } = validProfile
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profileSavedByOlderBuild))
    vi.resetModules()
    const store = (await import('./store')).useAppStore

    expect(store.getState().appPhase).toBe('loading_recommendations')
    expect(store.getState().profile).toMatchObject({ cuisine: 'american' })
    expect(store.getState().profileEditorOpen).toBe(false)
  })

  it('clears stale vendors and closures immediately when the session time changes', async () => {
    const store = await loadStore(validProfile)
    store.setState({ vendors, closures })

    store.getState().setWhen({
      preset: 'custom',
      date: '2026-07-12',
      day: 'sun',
      time_from: '10:00',
      time_to: '13:00',
      label: 'Sunday brunch',
    })

    expect(store.getState()).toMatchObject({
      vendors: null,
      closures: null,
      baseDataError: null,
    })
  })

  it('clears stale base data immediately when requesting a new location', async () => {
    const getCurrentPosition = vi.fn()
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    const store = await loadStore(validProfile)
    store.setState({ vendors, closures })

    store.getState().requestLocation()

    expect(store.getState()).toMatchObject({
      locationStatus: 'requesting',
      vendors: null,
      closures: null,
      baseDataError: null,
    })
  })

  it('ignores a base-data response invalidated by a session change', async () => {
    const vendorRequest = deferred<VendorCollection>()
    const closureRequest = deferred<ClosuresResponse>()
    api.getVendors.mockReturnValueOnce(vendorRequest.promise)
    api.getClosures.mockReturnValueOnce(closureRequest.promise)
    const store = await loadStore(validProfile)

    const run = store.getState().loadBaseData()
    store.getState().setWhen({
      preset: 'custom',
      date: '2026-07-12',
      day: 'sun',
      time_from: '10:00',
      time_to: '13:00',
      label: 'Sunday brunch',
    })
    vendorRequest.resolve(vendors)
    closureRequest.resolve(closures)
    await run

    expect(store.getState()).toMatchObject({ vendors: null, closures: null })
  })

  it('keeps overlays empty when a base-data refresh fails', async () => {
    api.getVendors.mockRejectedValueOnce(new Error('network down'))
    api.getClosures.mockResolvedValueOnce(closures)
    const store = await loadStore(validProfile)
    store.setState({ vendors, closures })

    await store.getState().loadBaseData()

    expect(store.getState()).toMatchObject({
      vendors: null,
      closures: null,
      baseDataError: 'Base map data is temporarily unavailable.',
    })
  })

  it('tracks per-form fill, export, and submission and persists them', async () => {
    const store = await loadStore(validProfile)

    store.getState().setPermitFormField('pw-location-application', 'email', 'ana@example.com')
    expect(store.getState().permitForms['pw-location-application'].values.email).toBe(
      'ana@example.com',
    )

    store.getState().exportPermitForm('pw-location-application')
    expect(store.getState().permitForms['pw-location-application'].exported).toBe(true)

    store.getState().setPermitFormSubmission('pw-location-application', true)
    const form = store.getState().permitForms['pw-location-application']
    expect(form.submission).toBe('submitted')
    expect(typeof form.submittedAt).toBe('number')

    // persisted under the vendor-type-scoped key
    const persisted = JSON.parse(
      localStorage.getItem('rollaway.permit-forms.v1.truck') ?? '{}',
    )
    expect(persisted['pw-location-application'].submission).toBe('submitted')

    // "Not yet" clears the submission back to in-progress territory
    store.getState().setPermitFormSubmission('pw-location-application', false)
    expect(store.getState().permitForms['pw-location-application'].submission).toBe(
      'not_submitted',
    )
    expect(store.getState().permitForms['pw-location-application'].submittedAt).toBeNull()
  })

  it('reloads per-vendor-type form state and isolates it from other types', async () => {
    const store = await loadStore(validProfile)
    store.getState().exportPermitForm('pw-location-application')
    expect(store.getState().permitForms['pw-location-application'].exported).toBe(true)

    // switching vendor_type loads a different, empty scope
    store.getState().saveProfile({ ...validProfile, vendor_type: 'pushcart_nocook' })
    expect(store.getState().permitForms).toEqual({})

    // switching back reloads the persisted truck scope
    store.getState().saveProfile(validProfile)
    expect(store.getState().permitForms['pw-location-application'].exported).toBe(true)
  })
})
