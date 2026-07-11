import type { CuisineId } from '../fixtures/sampleMenus'

export interface LatLng {
  lat: number
  lng: number
}

export type AppPhase =
  | 'profile'
  | 'session'
  | 'loading_recommendations'
  | 'ready'
  | 'loading_permits'

export type VendorType =
  | 'truck'
  | 'trailer'
  | 'pushcart_cooking'
  | 'pushcart_nocook'

export type DayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type PriceTier = '$' | '$$' | '$$$'
export type Verdict = 'good' | 'caution' | 'avoid'
export type Saturation = 'low' | 'medium' | 'high'

export interface MenuItem {
  name: string
  price: number | null
}

export interface MenuProfile {
  raw: string
  items: MenuItem[]
  price_tier: PriceTier
}

export interface OperatingWindow {
  day: DayCode
  time_from: string
  time_to: string
}

export interface AutofillProfile {
  owner_name: string
  business_name: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  postal_code: string
}

export interface VendorProfile {
  schema_version: 1
  vendor_type: VendorType
  cuisine: CuisineId
  menu: MenuProfile
  home_base: { label: string; point: LatLng | null }
  max_travel: { value: number; unit: 'minutes' | 'miles' }
  operating_windows: OperatingWindow[]
  permit_status: 'not_started' | 'researching' | 'in_progress' | 'permitted'
  autofill_profile: AutofillProfile
}

export type WhenPreset =
  | 'today_lunch'
  | 'tomorrow_dinner'
  | 'saturday'
  | 'custom'

export interface SessionWhen {
  preset: WhenPreset
  date: string
  day: DayCode
  time_from: string
  time_to: string
  label: string
}

export interface RecommendSpotsRequest {
  user_profile: VendorProfile
  location: LatLng
  when: SessionWhen
}

export interface LegalitySignal {
  pass: boolean
  status: 'pass' | 'fail' | 'conditional'
  rule: string
  detail: string
  cite: string
}

export interface AreaPermitCheck {
  rule: string
  pass: boolean
  required_ft: number | null
  actual_ft: number | null
  cite: string | null
}

export interface AreaInsights {
  parking: {
    point: LatLng
    suitability: 'recommended' | 'verify' | 'avoid'
    permit_checks: AreaPermitCheck[]
    note: string
  }
  local_cuisine: {
    nearby: { cuisine: string; count: number }[]
    menu_overlap_count: number
    opportunity: 'low_direct_overlap' | 'some_direct_overlap' | 'high_direct_overlap'
  }
  navigation: {
    destination: LatLng
    mode: 'driving' | 'walking' | 'cycling'
    minutes: number | null
    estimated: boolean
  }
}

export interface EventOpportunity {
  event_name: string
  venue: string
  start: string
  expected_attendance: number
  event_url: string | null
  promoter_name: string | null
}

export interface OutreachDraft {
  subject: string
  body: string
}

export interface RecommendationSpot {
  id: string
  rank: number
  point: LatLng
  block_label: string
  score: number
  verdict: Verdict
  why_one_line: string
  foot_traffic: {
    level: 'low' | 'moderate' | 'high'
    score: number
    basis: 'bay_wheels' | 'estimated'
    time_context: string
    detail: string
  }
  competition: {
    overlap_count: number
    saturation: Saturation
    menu_matches: string[]
    price_tier: PriceTier
    detail: string
  }
  legality: LegalitySignal
  closure: {
    active: boolean
    detail: string
    source: string | null
  }
  travel_minutes: number
  travel_distance_miles: number
  area_insights?: AreaInsights
  event_opportunity?: EventOpportunity | null
  outreach_draft?: OutreachDraft | null
}

export interface RecommendSpotsResponse {
  contract_version: 2
  generated_for: SessionWhen
  recommendations: RecommendationSpot[]
}

export type VendorStatus =
  | 'APPROVED'
  | 'REQUESTED'
  | 'EXPIRED'
  | 'SUSPEND'
  | 'ISSUED'

export interface VendorProperties {
  permit_id: string
  name: string
  type: string
  cuisine: string
  status: VendorStatus
  scheduled_here?: boolean
  schedule_window?: string
}

export interface VendorFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: VendorProperties
}

export interface VendorCollection {
  type: 'FeatureCollection'
  features: VendorFeature[]
}

export interface ClosureRecord {
  id: string
  reason: string
  source: 'sfmta_event' | 'dpw_permit'
  geometry:
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'Polygon'; coordinates: [number, number][][] }
  active_from: string
  active_to: string
}

export interface ClosuresResponse {
  closures: ClosureRecord[]
  count: number
}

export type PermitAgency = 'Public Works' | 'Public Health' | 'Fire' | 'Treasurer'
export type EasyApplyFieldKey =
  | keyof AutofillProfile
  | 'vendor_type'
  | 'menu'
  | 'location'
  | 'proposed_start_date'
  | 'signature'

export interface PermitChecklistItem {
  id: string
  order: number
  title: string
  detail: string
  deadline_days: number | null
  deadline_label: string | null
  cite: string
  easy_apply: boolean
  fields: {
    key: EasyApplyFieldKey
    label: string
    requirement: 'auto_filled' | 'missing' | 'must_verify'
  }[]
}

export interface PermitSection {
  agency: PermitAgency
  items: PermitChecklistItem[]
}

export interface PermitChecklist {
  vendor_type: VendorType
  generated_at: string
  sections: PermitSection[]
}

export interface LegacyConstraintCheck {
  rule: string
  pass: boolean
  detail: string
}

export interface LegacyAddSpotAction {
  type: 'add_spot'
  id: string
  point: LatLng
  verdict: Verdict
  score: number
  reasons: string[]
  event_opportunity?: EventOpportunity | null
  outreach_draft?: OutreachDraft | null
  breakdown: {
    constraints: LegacyConstraintCheck[]
    demand: { foot_traffic_score: number; restaurant_saturation: Saturation }
    nearby_vendors: { name: string; cuisine: string; scheduled_here: boolean }[]
  }
}

export interface LegacyChatResponse {
  agent: 'spot_scout' | 'permit_copilot'
  reply_markdown: string
  citations: { label: string; source: string; quote: string }[]
  map_actions: LegacyAddSpotAction[] | null
  checklist: unknown
}

export interface ApiError {
  error: { code: string; message: string }
}
