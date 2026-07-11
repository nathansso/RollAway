import type { LatLng } from '../types/contract'

export const SF_BOUNDS = {
  southwest: { lat: 37.7034, lng: -122.527 },
  northeast: { lat: 37.833, lng: -122.3482 },
} as const

export function isWithinSanFrancisco(point: LatLng): boolean {
  return (
    point.lat >= SF_BOUNDS.southwest.lat &&
    point.lat <= SF_BOUNDS.northeast.lat &&
    point.lng >= SF_BOUNDS.southwest.lng &&
    point.lng <= SF_BOUNDS.northeast.lng
  )
}
