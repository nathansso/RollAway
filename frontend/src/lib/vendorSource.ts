/**
 * Seed vendor layer for the map.
 *
 * VITE_VENDORS_URL set  -> fetch live GeoJSON from Person 3's get_vendors?format=geojson
 * otherwise             -> bundled fixture (~15 plausible SF vendors)
 *
 * Same swap-to-real design as chatClient: env var flip, zero code changes.
 */

import type { VendorCollection, VendorFeature, VendorStatus } from '../types/contract'
import vendorsFixture from '../fixtures/vendors.geojson.json'

const VENDORS_URL: string = import.meta.env.VITE_VENDORS_URL ?? ''

/** Contract §B.1 get_vendors (non-geojson) vendor shape. */
interface VendorRecord {
  permit_id: string
  name: string
  type: string
  cuisine: string
  status: VendorStatus
  point: { lat: number; lng: number }
}

export async function loadVendors(): Promise<VendorCollection> {
  if (VENDORS_URL) {
    try {
      const res = await fetch(VENDORS_URL)
      if (res.ok) {
        const json = (await res.json()) as {
          features?: unknown
          vendors?: unknown
        } | null
        if (json && Array.isArray(json.features)) {
          return json as VendorCollection
        }
        if (json && Array.isArray(json.vendors)) {
          const features = (json.vendors as VendorRecord[]).map(
            (v): VendorFeature => ({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [v.point.lng, v.point.lat] },
              properties: {
                permit_id: v.permit_id,
                name: v.name,
                type: v.type,
                cuisine: v.cuisine,
                status: v.status,
              },
            }),
          )
          return { type: 'FeatureCollection', features }
        }
        // unknown shape — fall through to fixture
      }
    } catch {
      // fall through to fixture — a map with seed vendors beats an empty map
    }
  }
  return vendorsFixture as VendorCollection
}
