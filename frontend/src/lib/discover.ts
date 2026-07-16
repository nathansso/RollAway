import { estimateTravel } from './apiClient'
import { isWithinSanFrancisco } from './sfBounds'
import { isOnSanFranciscoLand } from './sfLand'
import type {
  LatLng,
  RecommendationSpot,
  SessionWhen,
  VendorCollection,
  Verdict,
} from '../types/contract'

/**
 * #49: candidates for the region the vendor is currently looking at.
 *
 * The ranked search answers "where should I go from my origin?" once. This
 * answers a different question — "is there anything here?" — as they pan around,
 * so the map keeps rewarding exploration instead of running out at the edge of
 * the original result.
 *
 * Fixture-mode generator. Live, this is what recommend_spots does with real
 * signals; here the demand model below stands in for them. The plumbing that
 * calls it (debounced viewport -> bounded merge) is the part that survives
 * cutover.
 */

export interface ViewportBounds {
  southwest: LatLng
  northeast: LatLng
}

/**
 * An absolute bar, deliberately not the relative grading the ranked list uses.
 * Relative grading always paints someone green — it ranks whatever it is given —
 * so exploring a dead blockface would keep inventing "good" spots. Against a
 * fixed bar, a bad region simply yields fewer pins, or none.
 */
export const DISCOVERY_FLOOR = 0.52

/** Per-viewport and overall ceilings: exploring must not turn into pin soup. */
export const MAX_PER_VIEWPORT = 4
export const MAX_DISCOVERED = 12

/**
 * Past this the vendor is looking at the whole city, and a pin stops meaning
 * "set up around here". A phone sits at roughly 1.8 km corner to corner after a
 * search, so this leaves ample room to zoom out and still scout, while San
 * Francisco end to end (~18 km) stays firmly excluded.
 */
export const MAX_VIEWPORT_SPAN_M = 6000

/** Never place a new pin on top of one that is already there. */
const MIN_SPACING_M = 220

/**
 * Where San Francisco actually eats lunch. Demand decays with distance from
 * these cores, which is what makes the floor meaningful: the Outer Sunset does
 * not clear it, and no amount of panning invents a crowd there.
 */
const DEMAND_CORES: { lat: number; lng: number; weight: number; scale: number }[] = [
  { lat: 37.7915, lng: -122.4005, weight: 1, scale: 950 }, // Financial District
  { lat: 37.7855, lng: -122.401, weight: 0.95, scale: 1000 }, // SoMa / Yerba Buena
  { lat: 37.7955, lng: -122.3937, weight: 0.86, scale: 750 }, // Embarcadero
  { lat: 37.7766, lng: -122.3947, weight: 0.82, scale: 800 }, // Caltrain / Mission Bay
  { lat: 37.7599, lng: -122.4148, weight: 0.78, scale: 950 }, // Mission
  { lat: 37.779, lng: -122.4177, weight: 0.72, scale: 750 }, // Civic Center
  { lat: 37.8005, lng: -122.4098, weight: 0.66, scale: 700 }, // North Beach
]

export function metersBetween(a: LatLng, b: LatLng): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const latDelta = toRadians(b.lat - a.lat)
  const lngDelta = toRadians(b.lng - a.lng)
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(lngDelta / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(haversine)))
}

/**
 * Stable pseudo-random in [0,1) from a rounded coordinate. Determinism is a
 * requirement, not a convenience: pins are evicted when the pool is full, so
 * panning back has to rebuild the identical spot rather than a new one wearing
 * the same place's name.
 */
function noise(lat: number, lng: number, salt: number): number {
  let h = Math.imul(Math.round(lat * 1e4) ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ Math.round(lng * 1e4) ^ 0x27d4eb2f, 0xc2b2ae35)
  h = Math.imul(h ^ salt, 0x165667b1)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/** Modeled demand at a point: distance-decayed from the nearest strong core. */
export function demandAt(point: LatLng): number {
  let best = 0
  for (const core of DEMAND_CORES) {
    const distance = metersBetween(point, { lat: core.lat, lng: core.lng })
    best = Math.max(best, core.weight * Math.exp(-distance / core.scale))
  }
  return best
}

function spanMeters(bounds: ViewportBounds): number {
  return metersBetween(bounds.southwest, bounds.northeast)
}

function nearestVendorLabel(point: LatLng, vendors: VendorCollection | null): string {
  let best: { name: string; distance: number } | null = null
  for (const feature of vendors?.features ?? []) {
    const [lng, lat] = feature.geometry.coordinates
    const distance = metersBetween(point, { lat, lng })
    if (!best || distance < best.distance) {
      best = { name: feature.properties.name, distance }
    }
  }
  // Mirrors the backend's own labeling rule (150 m, else coordinates), so a
  // fixture pin and a live pin read the same way.
  if (best && best.distance <= 150) return `Near ${best.name}`
  return `Near ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`
}

function verdictFor(quality: number): Verdict {
  return quality >= 0.68 ? 'good' : 'caution'
}

function whyLine(quality: number, overlap: number): string {
  if (quality >= 0.68) {
    return overlap === 0
      ? 'Busy block with nothing selling what you sell.'
      : 'Busy block, and only light overlap with your menu.'
  }
  return overlap === 0
    ? 'Steady rather than busy, but you would have it to yourself.'
    : 'Workable backup if the stronger blocks are already taken.'
}

interface DiscoverOptions {
  origin: LatLng
  when: SessionWhen
  /** Ranked spots plus anything already discovered — used to keep pins apart. */
  existing: RecommendationSpot[]
  vendors?: VendorCollection | null
  limit?: number
}

/**
 * Candidates inside `bounds` that clear the floor, best first.
 *
 * Every returned point lies within the box, so a pin can never appear somewhere
 * the vendor is not looking. Returns fewer than `limit` — routinely zero — when
 * the region does not deserve pins.
 */
export function synthesizeViewportSpots(
  bounds: ViewportBounds,
  options: DiscoverOptions,
): RecommendationSpot[] {
  const { origin, when, existing, vendors = null, limit = MAX_PER_VIEWPORT } = options
  if (spanMeters(bounds) > MAX_VIEWPORT_SPAN_M) return []

  const latSpan = bounds.northeast.lat - bounds.southwest.lat
  const lngSpan = bounds.northeast.lng - bounds.southwest.lng
  if (latSpan <= 0 || lngSpan <= 0) return []

  // Sample a grid inset from the edges: a pin flush against the viewport border
  // is half off-screen and reads as clipped.
  const INSET = 0.14
  const STEPS = 4
  const candidates: { spot: RecommendationSpot; quality: number }[] = []

  for (let row = 0; row < STEPS; row += 1) {
    for (let column = 0; column < STEPS; column += 1) {
      const latFraction = INSET + ((row + 0.5) / STEPS) * (1 - 2 * INSET)
      const lngFraction = INSET + ((column + 0.5) / STEPS) * (1 - 2 * INSET)
      const jitterLat = (noise(row, column, 11) - 0.5) * (latSpan / STEPS) * 0.5
      const jitterLng = (noise(row, column, 23) - 0.5) * (lngSpan / STEPS) * 0.5
      const point: LatLng = {
        lat: Number((bounds.southwest.lat + latSpan * latFraction + jitterLat).toFixed(5)),
        lng: Number((bounds.southwest.lng + lngSpan * lngFraction + jitterLng).toFixed(5)),
      }
      // In the city, and on the ground. A viewport of the Embarcadero is mostly
      // Bay, and demand decays in circles that do not know where the water is.
      if (!isWithinSanFrancisco(point) || !isOnSanFranciscoLand(point)) continue

      const demand = demandAt(point)
      // Quality is demand-led, nudged by a stable per-point wobble so a grid of
      // samples doesn't read as a lattice of identical scores.
      const quality = Math.min(1, demand * 0.82 + noise(point.lat, point.lng, 7) * 0.22)
      if (quality < DISCOVERY_FLOOR) continue

      const overlap = Math.round(demand * 3 * noise(point.lat, point.lng, 31))
      const travel = estimateTravel(point, origin)
      const level = demand >= 0.66 ? 'high' : demand >= 0.4 ? 'moderate' : 'low'
      candidates.push({
        quality,
        spot: {
          // Coordinate-derived so an evicted pin rebuilds under its own id.
          id: `spot-found-${point.lat.toFixed(5)}-${point.lng.toFixed(5)}`,
          // Ordering among what this viewport turned up. These never enter the
          // tray's ranking — that stays the original top 3 — but the contract
          // requires a rank, and quality order is the honest one to give.
          rank: 1,
          point,
          block_label: nearestVendorLabel(point, vendors),
          address: null,
          score: Math.round(quality * 100) / 100,
          verdict: verdictFor(quality),
          why_one_line: whyLine(quality, overlap),
          foot_traffic: {
            level,
            score: Math.round(demand * 100) / 100,
            basis: 'estimated',
            time_context: when.label,
            detail: 'Modeled from activity around this block for this window.',
          },
          competition: {
            overlap_count: overlap,
            saturation: overlap >= 3 ? 'high' : overlap >= 1 ? 'medium' : 'low',
            menu_matches: [],
            price_tier: '$',
            detail:
              overlap === 0
                ? 'Nothing nearby overlaps your menu.'
                : `${overlap} nearby vendor${overlap === 1 ? '' : 's'} overlap your menu.`,
          },
          legality: {
            pass: true,
            status: 'conditional',
            rule: 'Verify posted curb and placement rules',
            detail: 'Found while exploring — confirm placement before setting up.',
            cite: 'dpw-182101',
          },
          closure: {
            active: false,
            detail: 'No active closure intersects this block.',
            source: null,
          },
          travel_minutes: travel.minutes,
          travel_distance_miles: travel.miles,
        },
      })
    }
  }

  const spaced: RecommendationSpot[] = []
  for (const { spot } of candidates.sort((a, b) => b.quality - a.quality)) {
    if (spaced.length >= limit) break
    const tooClose = [...existing, ...spaced].some(
      (other) => metersBetween(other.point, spot.point) < MIN_SPACING_M,
    )
    if (!tooClose) spaced.push({ ...spot, rank: spaced.length + 1 })
  }
  return spaced
}

/**
 * Merge newly found spots into the discovered pool under a hard ceiling.
 *
 * At the ceiling the pins furthest from where the vendor is now are dropped
 * first, so exploring somewhere new always has room without the pool growing
 * without end. Eviction is safe precisely because synthesis is deterministic:
 * panning back rebuilds the same pins.
 */
export function mergeDiscovered(
  current: RecommendationSpot[],
  found: RecommendationSpot[],
  focus: LatLng,
): RecommendationSpot[] {
  const byId = new Map(current.map((spot) => [spot.id, spot]))
  for (const spot of found) byId.set(spot.id, spot)
  const merged = [...byId.values()]
  if (merged.length <= MAX_DISCOVERED) return merged
  return merged
    .sort((a, b) => metersBetween(a.point, focus) - metersBetween(b.point, focus))
    .slice(0, MAX_DISCOVERED)
}
