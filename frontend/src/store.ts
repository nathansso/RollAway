import { create } from 'zustand'
import { apiClient, ApiClientError } from './lib/apiClient'
import {
  PROFILE_STORAGE_KEY,
  parseStoredProfile,
  validateProfile,
} from './lib/profile'
import { createPresetWhen } from './lib/when'
import { loadStringArray, saveJson } from './lib/storage'
import type {
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
export type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable'

const SOMA_FALLBACK = { lat: 37.7793, lng: -122.4013 }
const PERMIT_PROGRESS_KEY = 'rollaway.permit-progress.v1'

function permitProgressKey(profile: VendorProfile | null): string {
  return `${PERMIT_PROGRESS_KEY}.${profile?.vendor_type ?? 'none'}`
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
  requestLocation: () => void

  vendors: VendorCollection | null
  closures: ClosuresResponse | null
  baseDataError: string | null
  loadBaseData: () => Promise<void>

  recommendationStatus: AsyncStatus
  recommendationError: string | null
  recommendations: RecommendationSpot[]
  requestRecommendations: () => Promise<void>
  selectedSpotId: string | null
  selectSpot: (id: string | null) => void

  permitStatus: AsyncStatus
  permitError: string | null
  permitChecklist: PermitChecklist | null
  completedPermitItems: string[]
  loadPermitChecklist: () => Promise<void>
  togglePermitItem: (id: string) => void
}

export const useAppStore = create<AppState>((set, get) => {
  const initialProfile = storedProfile()
  return {
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
      set({
        profile,
        profileEditorOpen: false,
        permitChecklist: null,
        permitStatus: 'idle',
        completedPermitItems: loadStringArray(permitProgressKey(profile)),
      })
      saveJson(PROFILE_STORAGE_KEY, profile)
      return true
    },

    when: createPresetWhen('today_lunch'),
    setWhen: (when) => set({ when }),
    locationStatus: 'idle',
    location: SOMA_FALLBACK,
    requestLocation: () => {
      if (!navigator.geolocation) {
        set({ locationStatus: 'unavailable', location: SOMA_FALLBACK })
        return
      }
      set({ locationStatus: 'requesting' })
      navigator.geolocation.getCurrentPosition(
        ({ coords }) =>
          set({
            locationStatus: 'granted',
            location: { lat: coords.latitude, lng: coords.longitude },
          }),
        (error) =>
          set({
            locationStatus: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable',
            location: SOMA_FALLBACK,
          }),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 },
      )
    },

    vendors: null,
    closures: null,
    baseDataError: null,
    loadBaseData: async () => {
      try {
        const [vendors, closures] = await Promise.all([
          apiClient.getVendors(),
          apiClient.getClosures(),
        ])
        set({ vendors, closures, baseDataError: null })
      } catch (error) {
        set({
          baseDataError: errorMessage(error, 'Base map data is temporarily unavailable.'),
        })
      }
    },

    recommendationStatus: 'idle',
    recommendationError: null,
    recommendations: [],
    requestRecommendations: async () => {
      const { profile, location, when, recommendationStatus } = get()
      if (!profile || recommendationStatus === 'loading') return
      set({ recommendationStatus: 'loading', recommendationError: null, selectedSpotId: null })
      const request: RecommendSpotsRequest = {
        vendor_type: profile.vendor_type,
        menu: profile.menu,
        location,
        when,
        max_travel: profile.max_travel,
      }
      try {
        const response = await apiClient.recommendSpots(request)
        set({
          recommendations: response.recommendations,
          recommendationStatus: 'success',
        })
      } catch (error) {
        set({
          recommendationStatus: 'error',
          recommendationError: errorMessage(
            error,
            'Recommendations could not be loaded. Try again.',
          ),
        })
      }
    },
    selectedSpotId: null,
    selectSpot: (selectedSpotId) => set({ selectedSpotId }),

    permitStatus: 'idle',
    permitError: null,
    permitChecklist: null,
    completedPermitItems: loadStringArray(permitProgressKey(initialProfile)),
    loadPermitChecklist: async () => {
      const { profile, permitStatus } = get()
      if (!profile || permitStatus === 'loading') return
      set({ permitStatus: 'loading', permitError: null })
      try {
        const permitChecklist = await apiClient.getPermitChecklist(profile.vendor_type)
        set({ permitChecklist, permitStatus: 'success' })
      } catch (error) {
        set({
          permitStatus: 'error',
          permitError: errorMessage(error, 'Permit guidance could not be loaded. Try again.'),
        })
      }
    },
    togglePermitItem: (id) => {
      const completed = new Set(get().completedPermitItems)
      if (completed.has(id)) completed.delete(id)
      else completed.add(id)
      const completedPermitItems = [...completed]
      set({ completedPermitItems })
      saveJson(permitProgressKey(get().profile), completedPermitItems)
    },
  }
})
