import { create } from 'zustand'
import { apiClient, ApiClientError } from './lib/apiClient'
import {
  PROFILE_STORAGE_KEY,
  parseStoredProfile,
  validateProfile,
} from './lib/profile'
import { isWithinSanFrancisco } from './lib/sfBounds'
import { createPresetWhen, isValidCustomWindow } from './lib/when'
import { loadJson, loadStringArray, saveJson } from './lib/storage'
import { EMPTY_FORM_STATE, type PermitFormState } from './components/permits/permitForms'
import type {
  AppPhase,
  ClosuresResponse,
  PermitChecklist,
  RecommendSpotsRequest,
  RecommendationSpot,
  SessionWhen,
  VendorCollection,
  VendorProfile,
} from './types/contract'

export type AppTab = 'map' | 'permits'
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error'
export type LocationStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'outside_sf'

const SOMA_FALLBACK = { lat: 37.7793, lng: -122.4013 }
const PERMIT_PROGRESS_KEY = 'rollaway.permit-progress.v1'
const PERMIT_FORMS_KEY = 'rollaway.permit-forms.v1'
let latestRecommendationRequest = 0
let latestPermitRequest = 0
let latestBaseRequest = 0

function permitProgressKey(profile: VendorProfile | null): string {
  return `${PERMIT_PROGRESS_KEY}.${profile?.vendor_type ?? 'none'}`
}

function permitFormsKey(profile: VendorProfile | null): string {
  return `${PERMIT_FORMS_KEY}.${profile?.vendor_type ?? 'none'}`
}

function loadPermitForms(key: string): Record<string, PermitFormState> {
  const raw = loadJson<unknown>(key, {})
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as Record<string, PermitFormState>
}

function storedProfile(): VendorProfile | null {
  try {
    return parseStoredProfile(localStorage.getItem(PROFILE_STORAGE_KEY))
  } catch {
    return null
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback
}

interface AppState {
  appPhase: AppPhase
  continueToSession: () => void

  activeTab: AppTab
  setActiveTab: (tab: AppTab) => void

  profile: VendorProfile | null
  profileEditorOpen: boolean
  openProfileEditor: () => void
  closeProfileEditor: () => void
  saveProfile: (profile: VendorProfile) => boolean

  when: SessionWhen
  setWhen: (when: SessionWhen) => void
  locationStatus: LocationStatus
  location: { lat: number; lng: number }
  locationNotice: string | null
  requestLocation: () => void

  vendors: VendorCollection | null
  closures: ClosuresResponse | null
  baseDataError: string | null
  loadBaseData: () => Promise<void>

  recommendationStatus: AsyncStatus
  recommendationError: string | null
  recommendations: RecommendationSpot[]
  startRecommendations: () => Promise<void>
  requestRecommendations: () => Promise<void>
  selectedSpotId: string | null
  selectSpot: (id: string | null) => void

  permitStatus: AsyncStatus
  permitError: string | null
  permitChecklist: PermitChecklist | null
  completedPermitItems: string[]
  startPermitChecklist: () => Promise<void>
  togglePermitItem: (id: string) => void

  permitForms: Record<string, PermitFormState>
  setPermitFormField: (itemId: string, profileKey: string, value: string) => void
  exportPermitForm: (itemId: string) => void
  setPermitFormSubmission: (itemId: string, submitted: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => {
  const initialProfile = storedProfile()
  const initialPhase: AppPhase = initialProfile ? 'session' : 'profile'

  const startRecommendations = async () => {
    const { profile, location, when, recommendationStatus, locationStatus } = get()
    if (
      !profile ||
      !validateProfile(profile) ||
      !isValidCustomWindow(when.date, when.time_from, when.time_to)
    ) {
      set({
        appPhase: 'session',
        recommendationStatus: 'error',
        recommendationError: 'Complete your profile and session setup before finding spots.',
      })
      return
    }
    if (recommendationStatus === 'loading' || locationStatus === 'requesting') return

    const requestId = ++latestRecommendationRequest
    set({
      appPhase: 'loading_recommendations',
      recommendationStatus: 'loading',
      recommendationError: null,
      selectedSpotId: null,
    })
    const request: RecommendSpotsRequest = {
      user_profile: profile,
      location,
      when,
    }
    try {
      const response = await apiClient.recommendSpots(request)
      if (requestId !== latestRecommendationRequest) return
      set({
        appPhase: 'ready',
        recommendations: response.recommendations,
        recommendationStatus: 'success',
      })
    } catch (error) {
      if (requestId !== latestRecommendationRequest) return
      set({
        appPhase: 'session',
        recommendationStatus: 'error',
        recommendationError: errorMessage(
          error,
          'Recommendations could not be loaded. Try again.',
        ),
      })
    }
  }

  const startPermitChecklist = async () => {
    const { profile, permitStatus } = get()
    if (!profile || !validateProfile(profile) || permitStatus === 'loading') return

    const requestId = ++latestPermitRequest
    set({ appPhase: 'loading_permits', permitStatus: 'loading', permitError: null })
    try {
      const permitChecklist = await apiClient.getPermitChecklist(profile.vendor_type)
      if (requestId !== latestPermitRequest) return
      set({ appPhase: 'ready', permitChecklist, permitStatus: 'success' })
    } catch (error) {
      if (requestId !== latestPermitRequest) return
      set({
        appPhase: 'ready',
        permitStatus: 'error',
        permitError: errorMessage(error, 'Permit guidance could not be loaded. Try again.'),
      })
    }
  }

  const updatePermitForm = (
    itemId: string,
    patch: Partial<PermitFormState>,
  ): void => {
    const current = get().permitForms[itemId] ?? EMPTY_FORM_STATE
    const permitForms = { ...get().permitForms, [itemId]: { ...current, ...patch } }
    set({ permitForms })
    saveJson(permitFormsKey(get().profile), permitForms)
  }

  return {
    appPhase: initialPhase,
    continueToSession: () => {
      if (get().profile && validateProfile(get().profile)) {
        set({ appPhase: 'session', profileEditorOpen: false })
      }
    },

    activeTab: 'map',
    setActiveTab: (activeTab) => set({ activeTab }),

    profile: initialProfile,
    profileEditorOpen: initialProfile === null,
    openProfileEditor: () => set({ profileEditorOpen: true }),
    closeProfileEditor: () => {
      if (get().profile) set({ profileEditorOpen: false })
    },
    saveProfile: (profile) => {
      if (!validateProfile(profile)) return false
      const isFirstProfile = get().profile === null
      const currentPhase = get().appPhase
      const nextPhase =
        currentPhase === 'loading_recommendations'
          ? 'session'
          : currentPhase === 'loading_permits'
            ? 'ready'
            : currentPhase
      set({
        appPhase: isFirstProfile ? 'session' : nextPhase,
        profile,
        profileEditorOpen: false,
        permitChecklist: null,
        permitStatus: 'idle',
        completedPermitItems: loadStringArray(permitProgressKey(profile)),
        permitForms: loadPermitForms(permitFormsKey(profile)),
        recommendations: [],
        recommendationStatus: 'idle',
        selectedSpotId: null,
      })
      latestRecommendationRequest += 1
      latestPermitRequest += 1
      saveJson(PROFILE_STORAGE_KEY, profile)
      return true
    },

    when: createPresetWhen('today_lunch'),
    setWhen: (when) => {
      latestRecommendationRequest += 1
      latestBaseRequest += 1
      set({
        appPhase:
          get().appPhase === 'loading_recommendations' ? 'session' : get().appPhase,
        when,
        recommendations: [],
        recommendationStatus: 'idle',
        recommendationError: null,
        selectedSpotId: null,
        vendors: null,
        closures: null,
        baseDataError: null,
      })
    },
    locationStatus: 'idle',
    location: SOMA_FALLBACK,
    locationNotice: null,
    requestLocation: () => {
      latestBaseRequest += 1
      set({ vendors: null, closures: null, baseDataError: null })
      if (!navigator.geolocation) {
        set({
          locationStatus: 'unavailable',
          location: SOMA_FALLBACK,
          locationNotice: null,
        })
        return
      }
      latestRecommendationRequest += 1
      set({
        locationStatus: 'requesting',
        recommendations: [],
        recommendationStatus: 'idle',
        recommendationError: null,
        selectedSpotId: null,
        locationNotice: null,
      })
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          latestRecommendationRequest += 1
          const location = { lat: coords.latitude, lng: coords.longitude }
          const outsideSanFrancisco = !isWithinSanFrancisco(location)
          set({
            appPhase:
              get().appPhase === 'loading_recommendations' ? 'session' : get().appPhase,
            locationStatus: outsideSanFrancisco ? 'outside_sf' : 'granted',
            location: outsideSanFrancisco ? SOMA_FALLBACK : location,
            locationNotice: outsideSanFrancisco
              ? 'Your location is outside San Francisco. Using the SoMa demo origin.'
              : null,
            recommendations: [],
            recommendationStatus: 'idle',
            selectedSpotId: null,
          })
        },
        (error) => {
          latestRecommendationRequest += 1
          set({
            appPhase:
              get().appPhase === 'loading_recommendations' ? 'session' : get().appPhase,
            locationStatus: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable',
            location: SOMA_FALLBACK,
            locationNotice: null,
            recommendations: [],
            recommendationStatus: 'idle',
            selectedSpotId: null,
          })
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 },
      )
    },

    vendors: null,
    closures: null,
    baseDataError: null,
    loadBaseData: async () => {
      const requestId = ++latestBaseRequest
      const { location, when } = get()
      set({ vendors: null, closures: null, baseDataError: null })
      try {
        const [vendors, closures] = await Promise.all([
          apiClient.getVendors(location, when),
          apiClient.getClosures(location, when),
        ])
        if (requestId !== latestBaseRequest) return
        set({ vendors, closures, baseDataError: null })
      } catch (error) {
        if (requestId !== latestBaseRequest) return
        set({
          vendors: null,
          closures: null,
          baseDataError: errorMessage(error, 'Base map data is temporarily unavailable.'),
        })
      }
    },

    recommendationStatus: 'idle',
    recommendationError: null,
    recommendations: [],
    startRecommendations,
    requestRecommendations: startRecommendations,
    selectedSpotId: null,
    selectSpot: (selectedSpotId) => set({ selectedSpotId }),

    permitStatus: 'idle',
    permitError: null,
    permitChecklist: null,
    completedPermitItems: loadStringArray(permitProgressKey(initialProfile)),
    startPermitChecklist,
    togglePermitItem: (id) => {
      const completed = new Set(get().completedPermitItems)
      if (completed.has(id)) completed.delete(id)
      else completed.add(id)
      const completedPermitItems = [...completed]
      set({ completedPermitItems })
      saveJson(permitProgressKey(get().profile), completedPermitItems)
    },

    permitForms: loadPermitForms(permitFormsKey(initialProfile)),
    setPermitFormField: (itemId, profileKey, value) => {
      const current = get().permitForms[itemId] ?? EMPTY_FORM_STATE
      updatePermitForm(itemId, { values: { ...current.values, [profileKey]: value } })
    },
    exportPermitForm: (itemId) => updatePermitForm(itemId, { exported: true }),
    setPermitFormSubmission: (itemId, submitted) =>
      updatePermitForm(
        itemId,
        submitted
          ? { submission: 'submitted', submittedAt: Date.now() }
          : { submission: 'not_submitted', submittedAt: null },
      ),
  }
})
