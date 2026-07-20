import type { LatLng } from '../types/contract'

/**
 * A coarse outline of San Francisco's landmass, as [lng, lat].
 *
 * SF_BOUNDS is a rectangle, which is fine for rejecting Oakland but says
 * nothing about water: most of that box is the Bay and the Pacific. Anything
 * that invents its own points needs to know the difference, or it will cheerfully
 * park a food truck off Pier 14.
 *
 * Deliberately coarse — it traces the shoreline closely enough to keep pins on
 * streets, and does not attempt piers, inlets, or Treasure Island (excluded:
 * being conservative here costs a few valid blocks, while being loose puts pins
 * in the water). Live, real candidate points come from road and clearance data
 * and never need this.
 */
const SF_LAND: [number, number][] = [
  // North shore, west to east: Golden Gate -> Fisherman's Wharf.
  [-122.4750, 37.8110], // Fort Point
  [-122.4680, 37.8112], // Golden Gate Bridge landing
  [-122.4600, 37.8090], // Crissy Field
  [-122.4450, 37.8072], // Marina
  [-122.4350, 37.8065], // Marina Green
  [-122.4250, 37.8075], // Fort Mason
  [-122.4180, 37.8090], // Aquatic Park
  [-122.4110, 37.8095], // Fisherman's Wharf
  [-122.4105, 37.8085], // Pier 39 base
  // East waterfront, north to south. Follows the Embarcadero seawall, NOT the
  // pier tips: tracing the tips draws the open water between piers inside the
  // polygon, which is how pins ended up floating off Pier 15.
  [-122.4030, 37.8050], // Pier 33 base
  [-122.3985, 37.8025], // Pier 27 base
  [-122.3968, 37.8000], // Pier 15 base (Exploratorium)
  [-122.3958, 37.7980], // Pier 7 base
  [-122.3925, 37.7955], // Ferry Building
  [-122.3900, 37.7930],
  [-122.3880, 37.7910], // Rincon Park
  [-122.3860, 37.7865], // Bay Bridge
  [-122.3878, 37.7818], // South Beach
  [-122.3866, 37.7784], // Oracle Park
  [-122.3868, 37.7740], // Mission Bay
  [-122.3840, 37.7700],
  [-122.3820, 37.7660], // Mission Rock
  [-122.3830, 37.7600], // Dogpatch
  [-122.3800, 37.7530], // Islais Creek
  [-122.3720, 37.7450],
  [-122.3650, 37.7350], // Hunters Point
  [-122.3700, 37.7280],
  [-122.3760, 37.7220], // Candlestick
  [-122.3850, 37.7100],
  // South county line, east to west.
  [-122.4050, 37.7060],
  [-122.4550, 37.7080],
  [-122.4900, 37.7090],
  // Pacific shore, south to north.
  [-122.5060, 37.7180], // Ocean Beach south
  [-122.5090, 37.7350],
  [-122.5110, 37.7600], // Ocean Beach
  [-122.5120, 37.7780],
  [-122.5105, 37.7870], // Point Lobos
  [-122.5050, 37.7900],
  [-122.4950, 37.7950],
  [-122.4830, 37.8000], // Lands End
  [-122.4770, 37.8060], // Baker Beach north
]

/**
 * True when the point is on San Francisco land rather than in the Bay or the
 * ocean. Standard ray casting against the coarse outline above.
 */
export function isOnSanFranciscoLand(point: LatLng): boolean {
  let inside = false
  for (let i = 0, j = SF_LAND.length - 1; i < SF_LAND.length; j = i, i += 1) {
    const [lngI, latI] = SF_LAND[i]
    const [lngJ, latJ] = SF_LAND[j]
    const straddles = latI > point.lat !== latJ > point.lat
    if (
      straddles &&
      point.lng < ((lngJ - lngI) * (point.lat - latI)) / (latJ - latI) + lngI
    ) {
      inside = !inside
    }
  }
  return inside
}
