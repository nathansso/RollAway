/**
 * Rollaway interface contract — TypeScript mirror of docs/CONTRACTS.md (main branch).
 * contract_version: 1
 *
 * This file is the ONE source of truth for every shape the frontend renders.
 * Never invent fields; propose changes in docs/CONTRACTS.md first.
 */

export interface LatLng {
  lat: number
  lng: number
}

/** Canonical vendor-type strings, shared across the whole product (§D). */
export type VendorType =
  | 'truck'
  | 'trailer'
  | 'pushcart_cooking'
  | 'pushcart_nocook'

export type Verdict = 'good' | 'caution' | 'avoid'
export type Saturation = 'low' | 'medium' | 'high'
export type AgentName = 'spot_scout' | 'permit_copilot'

/* ---------- §A request ---------- */

export interface ChatContext {
  vendor_type: VendorType | null
  map_center: LatLng | null
  pinned_point: LatLng | null
}

export interface ChatRequest {
  session_id: string
  message: string
  context: ChatContext
}

/* ---------- §A response ---------- */

export interface Citation {
  label: string
  source: string
  quote: string
}

export interface ConstraintCheck {
  rule: string
  pass: boolean
  detail: string
}

export interface DemandSignals {
  /** 0–1. A PROXY built from bike-share activity, not a pedestrian count. */
  foot_traffic_score: number
  restaurant_saturation: Saturation
}

export interface NearbyVendor {
  name: string
  cuisine: string
  scheduled_here: boolean
}

export interface SpotBreakdown {
  constraints: ConstraintCheck[]
  demand: DemandSignals
  nearby_vendors: NearbyVendor[]
}

export interface AddSpotAction {
  type: 'add_spot'
  id: string
  point: LatLng
  verdict: Verdict
  score: number
  reasons: string[]
  breakdown: SpotBreakdown
}

export type MapAction = AddSpotAction

/* ---------- §D permit checklist ---------- */

export interface ChecklistStep {
  order: number
  agency: string
  title: string
  detail: string
  deadline_days: number | null
  deadline_label: string | null
  cite: string
  status: 'todo' | 'done'
}

export interface Checklist {
  vendor_type: VendorType
  steps: ChecklistStep[]
}

/* ---------- §A envelope ---------- */

export interface ChatResponse {
  agent: AgentName
  reply_markdown: string
  citations: Citation[]
  map_actions: MapAction[] | null
  checklist: Checklist | null
}

/* ---------- common error envelope ---------- */

export type ApiErrorCode = 'UPSTREAM_TIMEOUT' | 'BAD_INPUT' | 'RATE_LIMIT'

export interface ApiError {
  error: { code: ApiErrorCode; message: string }
}

export function isApiError(x: unknown): x is ApiError {
  return (
    typeof x === 'object' &&
    x !== null &&
    'error' in x &&
    typeof (x as ApiError).error?.code === 'string'
  )
}

/* ---------- vendor GeoJSON (seed map layer, from get_vendors) ---------- */

export type VendorStatus =
  | 'APPROVED'
  | 'REQUESTED'
  | 'EXPIRED'
  | 'SUSPEND'
  | 'ISSUED'

export interface VendorProperties {
  permit_id: string
  name: string
  /** Facility type from the permit data, e.g. "Truck" | "Push Cart". */
  type: string
  /** Enriched cuisine from the shared §C enum. */
  cuisine: string
  status: VendorStatus
  /** True when the permit schedule places the vendor at this point (§B.1). */
  scheduled_here?: boolean
  /** Human-readable schedule window, e.g. "Mo-Fr 8am-3pm" (§B.1). */
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
