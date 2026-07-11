import type {
  AreaInsights,
  ClosuresResponse,
  EasyApplyFieldKey,
  EventOpportunity,
  OutreachDraft,
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
import { isWithinSanFrancisco } from './sfBounds'
import { parseMenu } from './profile'
import type { MenuItem } from '../types/contract'

const USE_FIXTURES =
  String(import.meta.env.VITE_USE_FIXTURES ?? 'true').toLowerCase() !== 'false'
const RECOMMEND_URL = String(import.meta.env.VITE_RECOMMEND_SPOTS_URL ?? '')
const VENDORS_URL = String(import.meta.env.VITE_VENDORS_URL ?? '')
const CLOSURES_URL = String(import.meta.env.VITE_CLOSURES_URL ?? '')
const PERMIT_URL = String(import.meta.env.VITE_PERMIT_CHECKLIST_URL ?? '')
// Gradient-backed menu extraction (agents runtime POST /menu_extract).
const MENU_EXTRACT_URL = String(import.meta.env.VITE_MENU_EXTRACT_URL ?? '')
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

const PERMIT_FORM_HOSTS = new Set([
  'sf.gov', 'www.sf.gov', 'sfpublicworks.org', 'www.sfpublicworks.org',
  'sf-fire.org', 'www.sf-fire.org', 'sfdph.org', 'www.sfdph.org',
  'sftreasurer.org', 'www.sftreasurer.org',
])

function allowedPermitFormUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && PERMIT_FORM_HOSTS.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
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

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isNullableNonNegativeNumber(value: unknown): boolean {
  return value === null || isNonNegativeFiniteNumber(value)
}

function isEventOpportunity(value: unknown): value is EventOpportunity {
  return isRecord(value) &&
    typeof value.event_name === 'string' &&
    typeof value.venue === 'string' &&
    typeof value.start === 'string' &&
    isNonNegativeFiniteNumber(value.expected_attendance) &&
    (value.event_url === null || typeof value.event_url === 'string') &&
    (value.promoter_name === null || typeof value.promoter_name === 'string')
}

function isOutreachDraft(value: unknown): value is OutreachDraft {
  return isRecord(value) && typeof value.subject === 'string' && typeof value.body === 'string'
}

function isAreaInsights(value: unknown): value is AreaInsights {
  if (!isRecord(value) || !isRecord(value.parking) ||
      !isRecord(value.local_cuisine) || !isRecord(value.navigation)) return false
  const parking = value.parking
  const cuisine = value.local_cuisine
  const navigation = value.navigation
  return (
    isPoint(parking.point) &&
    isWithinSanFrancisco(parking.point as LatLng) &&
    ['recommended', 'verify', 'avoid'].includes(String(parking.suitability)) &&
    typeof parking.note === 'string' &&
    Array.isArray(parking.permit_checks) &&
    parking.permit_checks.every((check) =>
      isRecord(check) &&
      typeof check.rule === 'string' &&
      typeof check.pass === 'boolean' &&
      isNullableNonNegativeNumber(check.required_ft) &&
      isNullableNonNegativeNumber(check.actual_ft) &&
      (check.cite === null || typeof check.cite === 'string')) &&
    Array.isArray(cuisine.nearby) &&
    cuisine.nearby.every((row) =>
      isRecord(row) && typeof row.cuisine === 'string' &&
      isNonNegativeFiniteNumber(row.count)) &&
    isNonNegativeFiniteNumber(cuisine.menu_overlap_count) &&
    ['low_direct_overlap', 'some_direct_overlap', 'high_direct_overlap']
      .includes(String(cuisine.opportunity)) &&
    isPoint(navigation.destination) &&
    isWithinSanFrancisco(navigation.destination as LatLng) &&
    ['driving', 'walking', 'cycling'].includes(String(navigation.mode)) &&
    isNullableNonNegativeNumber(navigation.minutes) &&
    typeof navigation.estimated === 'boolean'
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
    isWithinSanFrancisco(value.point as LatLng) &&
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
    (value.area_insights === undefined || isAreaInsights(value.area_insights)) &&
    (value.event_opportunity === undefined || value.event_opportunity === null || isEventOpportunity(value.event_opportunity)) &&
    (value.outreach_draft === undefined || value.outreach_draft === null || isOutreachDraft(value.outreach_draft)) &&
    (!value.outreach_draft || Boolean(value.event_opportunity)) &&
    isNonNegativeFiniteNumber(value.travel_minutes) &&
    isNonNegativeFiniteNumber(value.travel_distance_miles)
  )
}

function isCoordinatePosition(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate)) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  )
}

function isValidClosureCoordinates(type: string, value: unknown): boolean {
  if (!Array.isArray(value)) return false
  if (type === 'LineString') {
    return value.length >= 2 && value.every(isCoordinatePosition)
  }
  return (
    type === 'Polygon' &&
    value.length > 0 &&
    value.every(
      (ring) =>
        Array.isArray(ring) &&
        ring.length >= 4 &&
        ring.every(isCoordinatePosition) &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1],
    )
  )
}

function coordinatesWithinSanFrancisco(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false
  if (value.every((coordinate) => typeof coordinate === 'number')) {
    return (
      value.length >= 2 &&
      value.every(Number.isFinite) &&
      isWithinSanFrancisco({ lng: value[0], lat: value[1] })
    )
  }
  return value.every(coordinatesWithinSanFrancisco)
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
    return isValidClosureCoordinates(String(closure.geometry.type), closure.geometry.coordinates)
  })
  if (!valid) return null
  const closures = (value.closures as ClosuresResponse['closures']).filter((closure) =>
    coordinatesWithinSanFrancisco(closure.geometry.coordinates),
  )
  return {
    closures,
    count: closures.length,
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
          (item.form_url === undefined || item.form_url === null || allowedPermitFormUrl(item.form_url)) &&
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
    if (isRecord(candidate) && (candidate.eliminated === true || candidate.rank === null)) {
      continue
    }
    if (
      !isRecord(candidate) ||
      typeof candidate.rank !== 'number' ||
      !isPoint(candidate.point) ||
      !isWithinSanFrancisco(candidate.point as LatLng) ||
      typeof candidate.block_label !== 'string' ||
      typeof candidate.why_one_line !== 'string' ||
      !isRecord(candidate.score_breakdown)
    ) {
      return null
    }
    const breakdown = candidate.score_breakdown
    if (
      typeof breakdown.foot_traffic !== 'number' ||
      (typeof breakdown.competition !== 'number' && !isRecord(breakdown.competition)) ||
      !isRecord(breakdown.legality) ||
      typeof breakdown.legality.pass !== 'boolean' ||
      typeof breakdown.legality.rule !== 'string' ||
      !isNonNegativeFiniteNumber(breakdown.travel_minutes)
    ) {
      return null
    }
    const score = Math.min(
      1,
      Math.max(0, Number(candidate.total_score ?? candidate.score ?? 0)),
    )
    const traffic = Math.min(1, Math.max(0, breakdown.foot_traffic))
    const competitionRecord = isRecord(breakdown.competition)
      ? breakdown.competition
      : null
    const competition = Math.min(
      1,
      Math.max(
        0,
        Number(competitionRecord?.penalty ?? breakdown.competition) || 0,
      ),
    )
    const overlapRows = Array.isArray(competitionRecord?.overlapping)
      ? competitionRecord.overlapping.filter(isRecord)
      : []
    const hasClosure = isRecord(breakdown.closures)
      ? Boolean(breakdown.closures.blocked)
      : Boolean(breakdown.closures)
    const legal = breakdown.legality.pass && !hasClosure
    const travel = estimateTravel(candidate.point as LatLng, request.location)
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
          overlapRows.length > 0 ? overlapRows.length : Math.round(competition * 3),
        saturation: competition >= 0.67 ? 'high' : competition >= 0.34 ? 'medium' : 'low',
        menu_matches: overlapRows
          .map((match) => (typeof match.name === 'string' ? match.name : ''))
          .filter(Boolean),
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
      travel_minutes: competitionRecord ? breakdown.travel_minutes : travel.minutes,
      travel_distance_miles: travel.miles,
      area_insights: isAreaInsights(candidate.area_insights)
        ? candidate.area_insights
        : undefined,
      event_opportunity: isEventOpportunity(candidate.event_opportunity)
        ? candidate.event_opportunity
        : null,
      outreach_draft: isEventOpportunity(candidate.event_opportunity) && isOutreachDraft(candidate.outreach_draft)
        ? candidate.outreach_draft
        : null,
    })
  }
  return { contract_version: 2, generated_for: request.when, recommendations }
}

export function estimateTravel(
  point: LatLng,
  origin: LatLng,
): { minutes: number; miles: number } {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const latDelta = toRadians(point.lat - origin.lat)
  const lngDelta = toRadians(point.lng - origin.lng)
  const originLat = toRadians(origin.lat)
  const pointLat = toRadians(point.lat)
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(originLat) * Math.cos(pointLat) * Math.sin(lngDelta / 2) ** 2
  const straightLineMiles =
    2 * 3958.8 * Math.asin(Math.min(1, Math.sqrt(haversine)))
  const miles = Math.round(straightLineMiles * 100) / 100

  return {
    miles,
    minutes: Math.max(3, Math.ceil(straightLineMiles * 6 + 3)),
  }
}

export function normalizeRecommendationTravel(
  response: RecommendSpotsResponse,
  origin: LatLng,
): RecommendSpotsResponse {
  return {
    ...response,
    recommendations: response.recommendations.map((spot) => {
      const travel = estimateTravel(spot.point, origin)
      return {
        ...spot,
        travel_minutes: travel.minutes,
        travel_distance_miles: travel.miles,
      }
    }),
  }
}

export function adaptLegacyRecommendations(
  legacy: LegacyChatResponse,
  request: RecommendSpotsRequest,
): RecommendSpotsResponse {
  const actions = Array.isArray(legacy.map_actions) ? legacy.map_actions : []
  const recommendations = actions
    .filter(
      (action) =>
        action?.type === 'add_spot' &&
        isPoint(action.point) &&
        isWithinSanFrancisco(action.point),
    )
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
      const travel = estimateTravel(action.point, request.location)
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
        travel_minutes: travel.minutes,
        travel_distance_miles: travel.miles,
        event_opportunity: isEventOpportunity(action.event_opportunity) ? action.event_opportunity : null,
        outreach_draft: isEventOpportunity(action.event_opportunity) && isOutreachDraft(action.outreach_draft)
          ? action.outreach_draft : null,
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
  response.recommendations = response.recommendations.map((spot) => {
    const travel = estimateTravel(spot.point, request.location)
    return {
      ...spot,
      foot_traffic: {
        ...spot.foot_traffic,
        time_context: request.when.label,
      },
      competition: {
        ...spot.competition,
        price_tier: request.user_profile.menu.price_tier,
      },
      travel_minutes: travel.minutes,
      travel_distance_miles: travel.miles,
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
    }
  })
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
    throw new ApiClientError('NETWORK', 'Could not reach the Rollaway service.')
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok || body === null) {
    throw new ApiClientError('NETWORK', 'The Rollaway service returned an error.')
  }
  return body
}

export function normalizeVendors(value: unknown): VendorCollection | null {
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
        Number.isFinite(feature.geometry.coordinates[0]) &&
        feature.geometry.coordinates[0] >= -180 &&
        feature.geometry.coordinates[0] <= 180 &&
        typeof feature.geometry.coordinates[1] === 'number' &&
        Number.isFinite(feature.geometry.coordinates[1]) &&
        feature.geometry.coordinates[1] >= -90 &&
        feature.geometry.coordinates[1] <= 90 &&
        isRecord(feature.properties) &&
        typeof feature.properties.permit_id === 'string' &&
        typeof feature.properties.name === 'string' &&
        typeof feature.properties.type === 'string' &&
        typeof feature.properties.cuisine === 'string' &&
        typeof feature.properties.status === 'string',
    )
    if (!valid) return null
    const collection = value as unknown as VendorCollection
    return {
      type: 'FeatureCollection',
      features: collection.features.filter((vendor) => {
        const [lng, lat] = vendor.geometry.coordinates
        return isWithinSanFrancisco({ lat, lng })
      }),
    }
  }
  if (!Array.isArray(value.vendors)) return null
  const features = value.vendors
    .filter(
      (vendor) =>
        isRecord(vendor) &&
        isPoint(vendor.point) &&
        isWithinSanFrancisco(vendor.point as LatLng) &&
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


export function adaptAgentPermitChecklist(
  value: unknown,
  vendorType: VendorType,
): PermitChecklist | null {
  if (!isRecord(value)) return null
  const envelope = isRecord(value.envelope) ? value.envelope : value
  const raw = isRecord(envelope.checklist) ? envelope.checklist : null
  if (!raw || !Array.isArray(raw.steps)) return null
  const rawSteps: unknown[] = raw.steps

  const agencies = ['Public Works', 'Public Health', 'Fire', 'Treasurer'] as const
  const sections = agencies.map((agency) => ({
    agency,
    items: rawSteps
      .filter((step): step is Record<string, unknown> =>
        isRecord(step) && step.agency === agency,
      )
      .map((step, index) => {
        const autofill = typeof step.autofill_field === 'string' ? step.autofill_field : null
        const allowedAutofill = [
          'owner_name', 'business_name', 'email', 'phone', 'address', 'city',
          'state', 'postal_code', 'vendor_type', 'menu', 'location',
        ]
        return {
          id: typeof step.id === 'string'
            ? step.id
            : `${agency.toLowerCase().replace(/[^a-z]+/g, '-')}-${Number(step.order) || index + 1}`,
          order: Number(step.order) || index + 1,
          title: String(step.title ?? 'Permit step'),
          detail: String(step.detail ?? ''),
          deadline_days: typeof step.deadline_days === 'number' ? step.deadline_days : null,
          deadline_label: typeof step.deadline_label === 'string' ? step.deadline_label : null,
          cite: String(step.cite ?? ''),
          form_url: allowedPermitFormUrl(step.form_url) ? step.form_url : null,
          easy_apply: Boolean(autofill),
          fields: autofill && allowedAutofill.includes(autofill)
            ? [{
              key: autofill as EasyApplyFieldKey,
              label: autofill.replace(/_/g, ' '),
              requirement: 'auto_filled' as const,
            }]
            : [],
        }
      }),
  }))

  return {
    vendor_type: vendorType,
    generated_at: new Date().toISOString(),
    sections,
  }
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
    if (native) return normalizeRecommendationTravel(native, request.location)
    const planned = adaptNativeRecommendations(body, request)
    if (planned) return planned
    if (isRecord(body) && Array.isArray(body.map_actions)) {
      return adaptLegacyRecommendations(body as unknown as LegacyChatResponse, request)
    }
    throw new ApiClientError('INVALID_RESPONSE', 'Recommendations were not in a supported format.')
  },

  // Extract a menu from raw text, a website link, or an image via the Gradient
  // serverless-inference endpoint. Without the live service, only pasted/text
  // sources parse in the browser (images/PDFs/links need the extractor).
  async extractMenu(payload: {
    input_type: 'text' | 'image' | 'url'
    text?: string
    image_data_url?: string
    url?: string
    vendor_type?: string
  }): Promise<{ items: MenuItem[]; plain_text: string }> {
    if (!MENU_EXTRACT_URL) {
      if (payload.input_type === 'text' && payload.text?.trim()) {
        const text = payload.text.trim()
        return { items: parseMenu(text), plain_text: text }
      }
      throw new ApiClientError(
        'CONFIG',
        'Menu extraction service is not connected. Images, PDFs, and links need the live Gradient extractor.',
      )
    }
    const body = await requestJson(MENU_EXTRACT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!isRecord(body) || body.ok === false) {
      const message =
        (isRecord(body) && typeof body.error === 'string' && body.error) ||
        'Menu extraction failed.'
      throw new ApiClientError('INVALID_RESPONSE', message)
    }
    const items: MenuItem[] = (Array.isArray(body.items) ? body.items : [])
      .map((raw) => {
        const record = isRecord(raw) ? raw : {}
        return { name: String(record.name ?? '').trim(), price: Number(record.price) }
      })
      .filter((it) => it.name.length > 0 && Number.isFinite(it.price))
    const plain_text = typeof body.plain_text === 'string' ? body.plain_text : ''
    return { items, plain_text }
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
    const body = await requestJson(PERMIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ vendor_type: vendorType }),
    })
    const checklist =
      validatePermitChecklist(body) ?? adaptAgentPermitChecklist(body, vendorType)
    if (!checklist) {
      throw new ApiClientError('INVALID_RESPONSE', 'Permit guidance was malformed.')
    }
    return checklist
  },
}
