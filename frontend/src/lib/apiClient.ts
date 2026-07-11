import type {
  ClosuresResponse,
  LegacyChatResponse,
  PermitChecklist,
  RecommendSpotsRequest,
  RecommendSpotsResponse,
  RecommendationSpot,
  SessionWhen,
  LatLng,
  VendorCollection,
  VendorFeature,
  VendorType,
  Verdict,
} from '../types/contract'
import recommendationFixture from '../fixtures/recommend_spots.json'
import vendorFixture from '../fixtures/vendors.geojson.json'
import closureFixture from '../fixtures/get_closures.json'
import permitFixture from '../fixtures/permit_checklist.json'

const USE_FIXTURES =
  String(import.meta.env.VITE_USE_FIXTURES ?? 'true').toLowerCase() !== 'false'
const RECOMMEND_URL = String(import.meta.env.VITE_RECOMMEND_SPOTS_URL ?? '')
const VENDORS_URL = String(import.meta.env.VITE_VENDORS_URL ?? '')
const CLOSURES_URL = String(import.meta.env.VITE_CLOSURES_URL ?? '')
const PERMIT_URL = String(import.meta.env.VITE_PERMIT_CHECKLIST_URL ?? '')
const DEFAULT_DELAY = Math.max(
  0,
  Number(import.meta.env.VITE_FIXTURE_DELAY_MS ?? 1100) || 0,
)

export class ApiClientError extends Error {
  readonly code: 'CONFIG' | 'NETWORK' | 'INVALID_RESPONSE'

  constructor(
    code: 'CONFIG' | 'NETWORK' | 'INVALID_RESPONSE',
    message: string,
  ) {
    super(message)
    this.code = code
    this.name = 'ApiClientError'
  }
}

function wait(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPoint(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.lat === 'number' &&
    Number.isFinite(value.lat) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    typeof value.lng === 'number' &&
    Number.isFinite(value.lng)
    && value.lng >= -180 &&
    value.lng <= 180
  )
}

const VERDICTS = new Set<Verdict>(['good', 'caution', 'avoid'])
const VENDOR_TYPES = new Set<VendorType>([
  'truck',
  'trailer',
  'pushcart_cooking',
  'pushcart_nocook',
])
const PRICE_TIERS = new Set(['$', '$$', '$$$'])
const SATURATIONS = new Set(['low', 'medium', 'high'])

function isRecommendation(value: unknown): value is RecommendationSpot {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.rank === 'number' &&
    value.rank > 0 &&
    isPoint(value.point) &&
    typeof value.block_label === 'string' &&
    typeof value.score === 'number' &&
    VERDICTS.has(value.verdict as Verdict) &&
    typeof value.why_one_line === 'string' &&
    isRecord(value.foot_traffic) &&
    typeof value.foot_traffic.score === 'number' &&
    ['low', 'moderate', 'high'].includes(String(value.foot_traffic.level)) &&
    ['bay_wheels', 'estimated'].includes(String(value.foot_traffic.basis)) &&
    typeof value.foot_traffic.time_context === 'string' &&
    typeof value.foot_traffic.detail === 'string' &&
    isRecord(value.competition) &&
    typeof value.competition.overlap_count === 'number' &&
    SATURATIONS.has(String(value.competition.saturation)) &&
    Array.isArray(value.competition.menu_matches) &&
    value.competition.menu_matches.every((match) => typeof match === 'string') &&
    PRICE_TIERS.has(String(value.competition.price_tier)) &&
    typeof value.competition.detail === 'string' &&
    isRecord(value.legality) &&
    typeof value.legality.pass === 'boolean' &&
    ['pass', 'fail', 'conditional'].includes(String(value.legality.status)) &&
    typeof value.legality.rule === 'string' &&
    typeof value.legality.detail === 'string' &&
    typeof value.legality.cite === 'string' &&
    isRecord(value.closure) &&
    typeof value.closure.active === 'boolean' &&
    typeof value.closure.detail === 'string' &&
    (value.closure.source === null || typeof value.closure.source === 'string') &&
    typeof value.travel_minutes === 'number'
  )
}

function hasNumericCoordinates(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false
  if (value.every((coordinate) => typeof coordinate === 'number')) {
    return (
      value.length >= 2 &&
      value.every(Number.isFinite) &&
      value[0] >= -180 &&
      value[0] <= 180 &&
      value[1] >= -90 &&
      value[1] <= 90
    )
  }
  return value.every(hasNumericCoordinates)
}

export function validateRecommendationResponse(
  value: unknown,
): RecommendSpotsResponse | null {
  if (
    !isRecord(value) ||
    value.contract_version !== 2 ||
    !isRecord(value.generated_for) ||
    !Array.isArray(value.recommendations) ||
    value.recommendations.length > 5 ||
    !value.recommendations.every(isRecommendation)
  ) {
    return null
  }
  return value as unknown as RecommendSpotsResponse
}

export function validateClosuresResponse(value: unknown): ClosuresResponse | null {
  if (!isRecord(value) || !Array.isArray(value.closures)) return null
  const valid = value.closures.every((closure) => {
    if (
      !isRecord(closure) ||
      typeof closure.id !== 'string' ||
      typeof closure.reason !== 'string' ||
      !['sfmta_event', 'dpw_permit'].includes(String(closure.source)) ||
      typeof closure.active_from !== 'string' ||
      typeof closure.active_to !== 'string' ||
      !isRecord(closure.geometry) ||
      !['LineString', 'Polygon'].includes(String(closure.geometry.type)) ||
      !Array.isArray(closure.geometry.coordinates)
    ) {
      return false
    }
    return hasNumericCoordinates(closure.geometry.coordinates)
  })
  if (!valid) return null
  return {
    closures: value.closures as ClosuresResponse['closures'],
    count: value.closures.length,
  }
}

export function validatePermitChecklist(value: unknown): PermitChecklist | null {
  if (
    !isRecord(value) ||
    !VENDOR_TYPES.has(value.vendor_type as VendorType) ||
    typeof value.generated_at !== 'string' ||
    !Array.isArray(value.sections)
  ) {
    return null
  }
  const agencies = new Set(['Public Works', 'Public Health', 'Fire', 'Treasurer'])
  const seenAgencies = new Set<string>()
  const valid = value.sections.length === agencies.size && value.sections.every(
    (section) =>
      isRecord(section) &&
      agencies.has(String(section.agency)) &&
      !seenAgencies.has(String(section.agency)) &&
      Boolean(seenAgencies.add(String(section.agency))) &&
      Array.isArray(section.items) &&
      section.items.every(
        (item) =>
          isRecord(item) &&
          typeof item.id === 'string' &&
          typeof item.order === 'number' &&
          typeof item.title === 'string' &&
          typeof item.detail === 'string' &&
          typeof item.cite === 'string' &&
          typeof item.easy_apply === 'boolean' &&
          Array.isArray(item.fields) &&
          item.fields.every(
            (field) =>
              isRecord(field) &&
              [
                'owner_name',
                'business_name',
                'email',
                'phone',
                'address',
                'city',
                'state',
                'postal_code',
                'vendor_type',
                'menu',
                'location',
                'proposed_start_date',
                'signature',
              ].includes(String(field.key)) &&
              typeof field.label === 'string' &&
              ['auto_filled', 'missing', 'must_verify'].includes(
                String(field.requirement),
              ),
          ),
      ),
  )
  return valid ? (value as unknown as PermitChecklist) : null
}

function blockLabelFromId(id: string): string {
  const known: Record<string, string> = {
    'spot-2nd-howard': '2nd & Howard',
    'spot-folsom-1st': 'Folsom & 1st',
    'spot-mission-5th': 'Mission & 5th',
  }
  return known[id] ?? 'Suggested block'
}

export function adaptNativeRecommendations(
  body: unknown,
  request: RecommendSpotsRequest,
): RecommendSpotsResponse | null {
  if (!isRecord(body) || !Array.isArray(body.spots) || body.spots.length > 5) {
    return null
  }
  const recommendations: RecommendationSpot[] = []
  for (const candidate of body.spots) {
    if (
      !isRecord(candidate) ||
      typeof candidate.rank !== 'number' ||
      !isPoint(candidate.point) ||
      typeof candidate.block_label !== 'string' ||
      typeof candidate.why_one_line !== 'string' ||
      !isRecord(candidate.score_breakdown)
    ) {
      return null
    }
    const breakdown = candidate.score_breakdown
    if (
      typeof breakdown.foot_traffic !== 'number' ||
      typeof breakdown.competition !== 'number' ||
      !isRecord(breakdown.legality) ||
      typeof breakdown.legality.pass !== 'boolean' ||
      typeof breakdown.legality.rule !== 'string' ||
      typeof breakdown.travel_minutes !== 'number'
    ) {
      return null
    }
    const score = Math.min(
      1,
      Math.max(0, Number(candidate.total_score ?? candidate.score ?? 0)),
    )
    const traffic = Math.min(1, Math.max(0, breakdown.foot_traffic))
    const competition = Math.min(1, Math.max(0, breakdown.competition))
    const hasClosure = Boolean(breakdown.closures)
    const legal = breakdown.legality.pass && !hasClosure
    recommendations.push({
      id:
        typeof candidate.id === 'string'
          ? candidate.id
          : `spot-${candidate.rank}-${candidate.block_label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      rank: candidate.rank,
      point: candidate.point as LatLng,
      block_label: candidate.block_label,
      score,
      verdict: VERDICTS.has(candidate.verdict as Verdict)
        ? (candidate.verdict as Verdict)
        : legal
          ? score >= 0.7
            ? 'good'
            : 'caution'
          : 'avoid',
      why_one_line: candidate.why_one_line,
      foot_traffic: {
        level: traffic >= 0.7 ? 'high' : traffic >= 0.4 ? 'moderate' : 'low',
        score: traffic,
        basis: 'bay_wheels',
        time_context: request.when.label,
        detail: 'Estimated from nearby Bay Wheels activity.',
      },
      competition: {
        overlap_count:
          typeof breakdown.overlap_count === 'number'
            ? Math.max(0, breakdown.overlap_count)
            : Math.round(competition * 3),
        saturation: competition >= 0.67 ? 'high' : competition >= 0.34 ? 'medium' : 'low',
        menu_matches: Array.isArray(breakdown.menu_matches)
          ? breakdown.menu_matches.filter((match): match is string => typeof match === 'string')
          : [],
        price_tier: request.user_profile.menu.price_tier,
        detail:
          typeof breakdown.competition_detail === 'string'
            ? breakdown.competition_detail
            : 'Estimated overlap for your menu and price point.',
      },
      legality: {
        pass: legal,
        status: legal ? 'pass' : 'fail',
        rule: breakdown.legality.rule,
        detail:
          typeof breakdown.legality.detail === 'string'
            ? breakdown.legality.detail
            : legal
              ? 'Returned placement checks pass.'
              : 'A returned placement check needs attention.',
        cite:
          typeof breakdown.legality.cite === 'string'
            ? breakdown.legality.cite
            : 'dpw-182101',
      },
      closure: {
        active: hasClosure,
        detail:
          typeof breakdown.closure_detail === 'string'
            ? breakdown.closure_detail
            : hasClosure
              ? 'An active closure affects this point.'
              : 'No active closure reported for this point.',
        source: hasClosure ? 'sfmta_event' : null,
      },
      travel_minutes: Math.max(0, breakdown.travel_minutes),
    })
  }
  return { contract_version: 2, generated_for: request.when, recommendations }
}

function travelEstimate(point: LatLng, request: RecommendSpotsRequest): number {
  const latMiles = (point.lat - request.location.lat) * 69
  const lngMiles =
    (point.lng - request.location.lng) *
    69 *
    Math.cos((request.location.lat * Math.PI) / 180)
  return Math.max(3, Math.round(Math.hypot(latMiles, lngMiles) * 5 + 3))
}

export function adaptLegacyRecommendations(
  legacy: LegacyChatResponse,
  request: RecommendSpotsRequest,
): RecommendSpotsResponse {
  const actions = Array.isArray(legacy.map_actions) ? legacy.map_actions : []
  const recommendations = actions
    .filter((action) => action?.type === 'add_spot' && isPoint(action.point))
    .slice(0, 5)
    .map((action, index): RecommendationSpot => {
      const constraints = Array.isArray(action.breakdown?.constraints)
        ? action.breakdown.constraints
        : []
      const failed = constraints.find((constraint) => !constraint.pass)
      const traffic = Math.min(
        1,
        Math.max(0, Number(action.breakdown?.demand?.foot_traffic_score) || 0),
      )
      const overlap = (action.breakdown?.nearby_vendors ?? []).filter(
        (vendor) => vendor.scheduled_here,
      )
      return {
        id: action.id,
        rank: index + 1,
        point: action.point,
        block_label: blockLabelFromId(action.id),
        score: Math.min(1, Math.max(0, Number(action.score) || 0)),
        verdict: VERDICTS.has(action.verdict) ? action.verdict : 'caution',
        why_one_line: action.reasons?.[0] ?? 'Review the current demand and placement checks.',
        foot_traffic: {
          level: traffic >= 0.7 ? 'high' : traffic >= 0.4 ? 'moderate' : 'low',
          score: traffic,
          basis: 'bay_wheels',
          time_context: request.when.label,
          detail: 'Estimated from nearby Bay Wheels activity.',
        },
        competition: {
          overlap_count: overlap.length,
          saturation: action.breakdown?.demand?.restaurant_saturation ?? 'medium',
          menu_matches: [...new Set(overlap.map((vendor) => vendor.cuisine))],
          price_tier: request.user_profile.menu.price_tier,
          detail:
            overlap.length === 0
              ? 'No scheduled vendor directly overlaps your menu.'
              : `${overlap.length} scheduled vendor${overlap.length === 1 ? '' : 's'} overlap your menu.`,
        },
        legality: {
          pass: !failed,
          status: failed ? 'fail' : 'pass',
          rule: failed?.rule ?? constraints[0]?.rule ?? 'Verify posted curb and placement rules',
          detail: failed?.detail ?? 'The returned clearance checks pass.',
          cite: 'dpw-182101',
        },
        closure: {
          active: Boolean(failed && /closure/i.test(failed.rule)),
          detail:
            failed && /closure/i.test(failed.rule)
              ? failed.detail
              : 'No active closure reported for this point.',
          source: failed && /closure/i.test(failed.rule) ? 'sfmta_event' : null,
        },
        travel_minutes: travelEstimate(action.point, request),
      }
    })
  return {
    contract_version: 2,
    generated_for: request.when,
    recommendations,
  }
}

export function buildFunctionUrl(
  base: string,
  params: Record<string, string | number>,
): string {
  const url = new URL(base)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

function fixtureRecommendations(request: RecommendSpotsRequest): RecommendSpotsResponse {
  const response = structuredClone(recommendationFixture) as RecommendSpotsResponse
  response.generated_for = request.when
  const hasFridayClosure = request.when.date === '2026-07-10'
  response.recommendations = response.recommendations.map((spot) => ({
    ...spot,
    foot_traffic: {
      ...spot.foot_traffic,
      time_context: request.when.label,
    },
    competition: {
      ...spot.competition,
      price_tier: request.user_profile.menu.price_tier,
    },
    travel_minutes: travelEstimate(spot.point, request),
    ...(spot.id === 'spot-mission-5th' && !hasFridayClosure
      ? {
          score: 0.56,
          verdict: 'caution' as const,
          why_one_line: 'Strong activity, with direct menu competition worth checking.',
          legality: {
            ...spot.legality,
            pass: true,
            status: 'conditional' as const,
            rule: 'Verify posted curb and placement rules',
            detail: 'No fixture closure is active for the selected date.',
          },
          closure: {
            active: false,
            detail: 'No fixture closure is active for the selected date.',
            source: null,
          },
        }
      : {}),
  }))
  return response
}

function fixtureClosures(when: SessionWhen): ClosuresResponse {
  const closures = (structuredClone(closureFixture) as ClosuresResponse).closures.filter(
    (closure) =>
      closure.active_from.slice(0, 10) <= when.date &&
      closure.active_to.slice(0, 10) >= when.date,
  )
  return { closures, count: closures.length }
}

async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  if (!url) throw new ApiClientError('CONFIG', 'This live endpoint is not configured.')
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    throw new ApiClientError('NETWORK', 'Could not reach the RollAway service.')
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok || body === null) {
    throw new ApiClientError('NETWORK', 'The RollAway service returned an error.')
  }
  return body
}

function normalizeVendors(value: unknown): VendorCollection | null {
  if (!isRecord(value)) return null
  if (value.type === 'FeatureCollection' && Array.isArray(value.features)) {
    const valid = value.features.every(
      (feature) =>
        isRecord(feature) &&
        feature.type === 'Feature' &&
        isRecord(feature.geometry) &&
        feature.geometry.type === 'Point' &&
        Array.isArray(feature.geometry.coordinates) &&
        feature.geometry.coordinates.length === 2 &&
        typeof feature.geometry.coordinates[0] === 'number' &&
        feature.geometry.coordinates[0] >= -180 &&
        feature.geometry.coordinates[0] <= 180 &&
        typeof feature.geometry.coordinates[1] === 'number' &&
        feature.geometry.coordinates[1] >= -90 &&
        feature.geometry.coordinates[1] <= 90 &&
        isRecord(feature.properties) &&
        typeof feature.properties.permit_id === 'string' &&
        typeof feature.properties.name === 'string' &&
        typeof feature.properties.type === 'string' &&
        typeof feature.properties.cuisine === 'string' &&
        typeof feature.properties.status === 'string',
    )
    return valid ? (value as unknown as VendorCollection) : null
  }
  if (!Array.isArray(value.vendors)) return null
  const features = value.vendors
    .filter(
      (vendor) =>
        isRecord(vendor) &&
        isPoint(vendor.point) &&
        typeof vendor.permit_id === 'string' &&
        typeof vendor.name === 'string',
    )
    .map((vendor): VendorFeature => {
      const point = vendor.point as { lat: number; lng: number }
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
        properties: {
          permit_id: String(vendor.permit_id),
          name: String(vendor.name),
          type: String(vendor.type ?? 'Mobile vendor'),
          cuisine: String(vendor.cuisine ?? 'other'),
          status: String(vendor.status ?? 'REQUESTED') as VendorFeature['properties']['status'],
          scheduled_here: Boolean(vendor.scheduled_here),
          schedule_window:
            typeof vendor.schedule_window === 'string' ? vendor.schedule_window : undefined,
        },
      }
    })
  return { type: 'FeatureCollection', features }
}

function withVendorType(value: PermitChecklist, vendorType: VendorType): PermitChecklist {
  const checklist = { ...structuredClone(value), vendor_type: vendorType }
  if (vendorType === 'pushcart_nocook') {
    const fire = checklist.sections.find((section) => section.agency === 'Fire')
    if (fire?.items[0]) {
      fire.items[0] = {
        ...fire.items[0],
        title: 'Fire permit is generally not required',
        detail:
          'A no-cook cart without heating, open flame, propane, or a generator generally does not need an SFFD operational permit. Verify if your equipment changes.',
        easy_apply: false,
        fields: [],
      }
    }
  }
  return checklist
}

export const apiClient = {
  useFixtures: USE_FIXTURES,

  async recommendSpots(
    request: RecommendSpotsRequest,
    options: { delayMs?: number } = {},
  ): Promise<RecommendSpotsResponse> {
    if (USE_FIXTURES) {
      await wait(options.delayMs ?? DEFAULT_DELAY)
      return fixtureRecommendations(request)
    }
    const body = await requestJson(RECOMMEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        user_profile: request.user_profile,
        when: request.when,
        location: request.location,
      }),
    })
    const native = validateRecommendationResponse(body)
    if (native) return native
    const planned = adaptNativeRecommendations(body, request)
    if (planned) return planned
    if (isRecord(body) && Array.isArray(body.map_actions)) {
      return adaptLegacyRecommendations(body as unknown as LegacyChatResponse, request)
    }
    throw new ApiClientError('INVALID_RESPONSE', 'Recommendations were not in a supported format.')
  },

  async getVendors(location: LatLng, when: SessionWhen): Promise<VendorCollection> {
    if (USE_FIXTURES) return structuredClone(vendorFixture) as VendorCollection
    const normalized = normalizeVendors(
      await requestJson(
        buildFunctionUrl(VENDORS_URL, {
          lat: location.lat,
          lng: location.lng,
          radius_m: 1500,
          day: when.day,
          time: when.time_from,
        }),
      ),
    )
    if (!normalized) throw new ApiClientError('INVALID_RESPONSE', 'Vendor data was malformed.')
    return normalized
  },

  async getClosures(location: LatLng, when: SessionWhen): Promise<ClosuresResponse> {
    if (USE_FIXTURES) return fixtureClosures(when)
    const closures = validateClosuresResponse(
      await requestJson(
        buildFunctionUrl(CLOSURES_URL, {
          lat: location.lat,
          lng: location.lng,
          radius_m: 1800,
          date_from: when.date,
          date_to: when.date,
        }),
      ),
    )
    if (!closures) {
      throw new ApiClientError('INVALID_RESPONSE', 'Closure data was malformed.')
    }
    return closures
  },

  async getPermitChecklist(
    vendorType: VendorType,
    options: { delayMs?: number } = {},
  ): Promise<PermitChecklist> {
    if (USE_FIXTURES) {
      await wait(options.delayMs ?? DEFAULT_DELAY)
      return withVendorType(permitFixture as PermitChecklist, vendorType)
    }
    const checklist = validatePermitChecklist(await requestJson(PERMIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ vendor_type: vendorType }),
    }))
    if (!checklist) {
      throw new ApiClientError('INVALID_RESPONSE', 'Permit guidance was malformed.')
    }
    return checklist
  },
}
