import { create } from 'zustand'
import { apiClient, ApiClientError } from './lib/apiClient'
import { PROFILE_STORAGE_KEY, readStoredProfile, validateProfile } from './lib/profile'
import { isAuthConfigured, getSupabase } from './lib/supabase'
import {
  AuthMessageError,
  getProfileRow,
  sendMagicLink,
  signOut as authSignOutRequest,
  takeIntent,
  upsertProfileRow,
  type AuthIntent,
} from './lib/auth'
import { isWithinSanFrancisco } from './lib/sfBounds'
import { normalizeRecommendations } from './lib/recommendations'
import { createNowWhen, isValidCustomWindow } from './lib/when'
import { loadJson, loadStringArray, saveJson } from './lib/storage'
import { EMPTY_FORM_STATE, type PermitFormState } from './components/permits/permitForms'
import { attachFilledForms } from './lib/formCatalog'
import type {
  AppPhase,
  ClosuresResponse,
  LatLng,
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
  | 'address'

const SOMA_FALLBACK = { lat: 37.7793, lng: -122.4013 }
const PERMIT_PROGRESS_KEY = 'rollaway.permit-progress.v1'
const PERMIT_FORMS_KEY = 'rollaway.permit-forms.v1'
let latestRecommendationRequest = 0
let latestPermitRequest = 0
let latestBaseRequest = 0
let latestLocationRequest = 0
// Bind the Supabase auth listener exactly once (StrictMode double-invokes the
// init effect, and initAuth may be called from more than one mount).
let authListenerBound = false

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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback
}

// The full VendorProfile cached in localStorage (Wave 2: this stays the source
// of truth for the rich profile; the Supabase `profiles` row is only the
// new/returning signal + a few reusable defaults).
function loadStoredProfile(): VendorProfile | null {
  return readStoredProfile(loadJson<unknown>(PROFILE_STORAGE_KEY, null))
}

// disabled = Supabase not configured (dev/fixtures/e2e/pre-cutover): the app
// runs exactly as before. unknown = configured, session not yet resolved.
export type AuthStatus = 'disabled' | 'unknown' | 'signed_out' | 'signed_in'

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

  // Wave 2 auth (#39/#50)
  authStatus: AuthStatus
  authEmail: string | null
  authError: string | null
  magicLinkSentTo: string | null
  // A localStorage profile eligible to import on first sign-in (offer in UI).
  authImportProfile: VendorProfile | null
  initAuth: () => void
  sendAuthMagicLink: (email: string, intent: AuthIntent) => Promise<void>
  authSignOut: () => Promise<void>
  clearAuthError: () => void
  dismissProfileImport: () => void

  when: SessionWhen
  setWhen: (when: SessionWhen) => void
  locationStatus: LocationStatus
  location: { lat: number; lng: number }
  locationNotice: string | null
  originLabel: string | null
  requestLocation: () => void
  setStartLocation: (point: LatLng, address: string) => void

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
  // Demo default: every launch starts as a brand-new, first-time user, ignoring
  // any stored profile so the app always opens on onboarding and walks through
  // profile setup -> map from scratch.
  //
  // Set VITE_FORCE_FIRST_TIME_USER=false to honor a stored profile and boot
  // straight to the map instead. That is the auth-off stand-in for the
  // returning-user routing resolveAuthRouting performs once Supabase is
  // configured, and it is how the e2e specs exercise the returning visitor.
  // It only applies when auth is off: with auth on, resolveAuthRouting decides
  // the landing phase after the session resolves, whatever this computes.
  const forceFirstTimeUser =
    String(import.meta.env.VITE_FORCE_FIRST_TIME_USER ?? 'true').toLowerCase() !== 'false'
  const initialProfile: VendorProfile | null = forceFirstTimeUser ? null : loadStoredProfile()
  const initialPhase: AppPhase = initialProfile ? 'loading_recommendations' : 'profile'

  const startRecommendations = async () => {
    const { profile, location, when, recommendationStatus, locationStatus } = get()
    if (
      !profile ||
      !validateProfile(profile) ||
      !isValidCustomWindow(when.date, when.time_from, when.time_to)
    ) {
      set({
        appPhase: get().profile ? 'ready' : 'profile',
        recommendationStatus: 'error',
        recommendationError: 'Complete your profile before finding spots.',
      })
      return
    }
    if (recommendationStatus === 'loading' || locationStatus === 'requesting') return

    const requestId = ++latestRecommendationRequest
    set({
      // Only the first search (from onboarding) takes the full-screen loader.
      // Re-runs from the map stay inline so the map never disappears.
      appPhase: get().appPhase === 'ready' ? 'ready' : 'loading_recommendations',
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
        // #31: normalize verdicts by relative quality, then keep a wider
        // candidate pool (up to 12) so the map feels populated. The tray only
        // renders tiles for the top 3; every pin stays clickable for details.
        recommendations: normalizeRecommendations(response.recommendations).slice(0, 12),
        recommendationStatus: 'success',
      })
    } catch (error) {
      if (requestId !== latestRecommendationRequest) return
      // #14: stay on the map and surface the error in the recommendation tray
      // (with a retry), rather than bouncing back to a separate setup page.
      set({
        appPhase: 'ready',
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
      // Pre-fill every included form (Public Works, Public Health, Fire) from the vendor profile so
      // each gets a fillable card + auto-filled editable PDF — not just Public Works.
      set({
        appPhase: 'ready',
        permitChecklist: attachFilledForms(permitChecklist, profile),
        permitStatus: 'success',
      })
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

  // Wave 2: decide where a freshly-authenticated user lands. A `profiles` row =
  // returning -> straight to the recommendation map (auto-running the first
  // search) when a valid local profile exists, else onboarding to rebuild it.
  // No row = new -> onboarding, offering to import any pre-auth local profile.
  const resolveAuthRouting = async (userId: string, email: string | null): Promise<void> => {
    takeIntent() // consume the round-trip intent (routing is driven by the row)
    let row = null
    try {
      row = await getProfileRow(userId)
    } catch {
      row = null // a transient read failure shouldn't trap the user out of the app
    }
    const stored = loadStoredProfile()
    if (row && stored) {
      set({
        authStatus: 'signed_in',
        authEmail: email,
        authImportProfile: null,
        profile: stored,
        profileEditorOpen: false,
        appPhase: 'loading_recommendations',
        completedPermitItems: loadStringArray(permitProgressKey(stored)),
        permitForms: loadPermitForms(permitFormsKey(stored)),
      })
      return
    }
    set({
      authStatus: 'signed_in',
      authEmail: email,
      // Returning-but-no-local-profile and brand-new both go to onboarding;
      // only a new user with a pre-auth local profile gets the import offer.
      authImportProfile: row ? null : stored,
      profileEditorOpen: true,
      appPhase: 'profile',
    })
  }

  return {
    appPhase: initialPhase,
    continueToSession: () => {
      if (get().profile && validateProfile(get().profile)) {
        set({ appPhase: 'loading_recommendations', profileEditorOpen: false })
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
        currentPhase === 'loading_permits' ? 'ready' : currentPhase
      // #14: creating the first profile drops the vendor straight onto the
      // loading screen -> recommendation map. Editing an existing profile mid
      // recommendation-load re-runs the search (stays in loading_recommendations).
      set({
        appPhase: isFirstProfile ? 'loading_recommendations' : nextPhase,
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
      // Wave 2: mirror the profile subset to Supabase when signed in (best
      // effort — RLS scopes the row; a failure never blocks the local save).
      const { authStatus } = get()
      if (authStatus === 'signed_in') {
        const supabase = getSupabase()
        void supabase?.auth.getUser().then(({ data }) => {
          if (data.user) void upsertProfileRow(data.user.id, profile).catch(() => {})
        })
      }
      return true
    },

    authStatus: isAuthConfigured() ? 'unknown' : 'disabled',
    authEmail: null,
    authError: null,
    magicLinkSentTo: null,
    authImportProfile: null,
    initAuth: () => {
      const supabase = getSupabase()
      if (!supabase) {
        set({ authStatus: 'disabled' })
        return
      }
      if (authListenerBound) return
      authListenerBound = true
      // onAuthStateChange emits INITIAL_SESSION immediately (supabase-js v2),
      // then SIGNED_IN when the magic-link redirect is consumed by
      // detectSessionInUrl — so this one subscription covers boot + login.
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session?.user) {
          set({ authStatus: 'signed_out', authEmail: null })
          return
        }
        void resolveAuthRouting(session.user.id, session.user.email ?? null)
      })
    },
    sendAuthMagicLink: async (email, intent) => {
      set({ authError: null })
      try {
        await sendMagicLink(email, intent)
        set({ magicLinkSentTo: email.trim() })
      } catch (error) {
        set({
          authError:
            error instanceof AuthMessageError
              ? error.message
              : 'Could not send the sign-in link. Check the email and try again.',
        })
        throw error
      }
    },
    authSignOut: async () => {
      await authSignOutRequest()
      set({ authStatus: 'signed_out', authEmail: null, magicLinkSentTo: null, authError: null })
    },
    clearAuthError: () => set({ authError: null }),
    dismissProfileImport: () => set({ authImportProfile: null }),

    when: createNowWhen(),
    setWhen: (when) => {
      latestRecommendationRequest += 1
      latestBaseRequest += 1
      // #14: changing the time on the map keeps you on the map; the idle
      // recommendation status lets the app auto-re-run the search.
      set({
        appPhase: get().appPhase,
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
    originLabel: null,
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
      // Only the newest location request may apply its result. Two can be in
      // flight at once (StrictMode re-runs the mount effect with the same
      // render's values, so both see locationStatus 'idle'; a user can also tap
      // the pin twice). Both callbacks clear recommendations, so a stale one
      // landing after the search succeeded wiped the results and left an empty
      // map: appPhase is 'ready' by then, so the auto-search never re-fires.
      const locationRequestId = ++latestLocationRequest
      set({
        locationStatus: 'requesting',
        originLabel: null,
        recommendations: [],
        recommendationStatus: 'idle',
        recommendationError: null,
        selectedSpotId: null,
        locationNotice: null,
      })
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          if (locationRequestId !== latestLocationRequest) return
          latestRecommendationRequest += 1
          const location = { lat: coords.latitude, lng: coords.longitude }
          const outsideSanFrancisco = !isWithinSanFrancisco(location)
          set({
            appPhase: get().appPhase,
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
          if (locationRequestId !== latestLocationRequest) return
          latestRecommendationRequest += 1
          set({
            appPhase: get().appPhase,
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
    setStartLocation: (point, address) => {
      // #14: origin chosen from Places autocomplete. Setting the recommendation
      // status idle lets the app auto-re-run the search from the new origin.
      latestBaseRequest += 1
      latestRecommendationRequest += 1
      const outsideSanFrancisco = !isWithinSanFrancisco(point)
      set({
        appPhase: get().appPhase,
        location: outsideSanFrancisco ? SOMA_FALLBACK : point,
        originLabel: outsideSanFrancisco ? null : address,
        locationStatus: outsideSanFrancisco ? 'outside_sf' : 'address',
        locationNotice: outsideSanFrancisco
          ? 'That address is outside San Francisco. Using the SoMa demo origin.'
          : null,
        recommendations: [],
        recommendationStatus: 'idle',
        recommendationError: null,
        selectedSpotId: null,
        vendors: null,
        closures: null,
        baseDataError: null,
      })
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
