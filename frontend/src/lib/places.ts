import type { LatLng } from '../types/contract'

// Browser-side Google Places (New) helpers for #14 start-location search.
// Uses the referrer-restricted browser key (Street View + Places only). The
// browser sends the page Origin/Referer automatically, which is what the key's
// HTTP-referrer restriction checks — never send this key from a server.
const BROWSER_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ?? '')

// Bias/limit suggestions to San Francisco — the app only serves SF.
const SF_CENTER = { latitude: 37.7793, longitude: -122.4193 }
const SF_RADIUS_M = 14_000

export interface PlaceSuggestion {
  placeId: string
  primary: string
  secondary: string
}

export function placesConfigured(): boolean {
  return BROWSER_KEY.length > 0
}

interface AutocompleteResponse {
  suggestions?: {
    placePrediction?: {
      placeId: string
      structuredFormat?: {
        mainText?: { text?: string }
        secondaryText?: { text?: string }
      }
      text?: { text?: string }
    }
  }[]
}

export async function placesAutocomplete(
  input: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const query = input.trim()
  if (!BROWSER_KEY || query.length < 3) return []

  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': BROWSER_KEY,
    },
    signal,
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ['us'],
      locationBias: {
        circle: { center: SF_CENTER, radius: SF_RADIUS_M },
      },
    }),
  })
  if (!response.ok) throw new Error(`Places autocomplete failed (${response.status})`)

  const body = (await response.json()) as AutocompleteResponse
  return (body.suggestions ?? [])
    .map((suggestion) => suggestion.placePrediction)
    .filter((prediction): prediction is NonNullable<typeof prediction> =>
      Boolean(prediction?.placeId),
    )
    .map((prediction) => ({
      placeId: prediction.placeId,
      primary:
        prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? '',
      secondary: prediction.structuredFormat?.secondaryText?.text ?? '',
    }))
}

interface PlaceDetailsResponse {
  location?: { latitude?: number; longitude?: number }
  formattedAddress?: string
}

export interface ResolvedPlace {
  point: LatLng
  address: string
}

export async function placeDetails(
  placeId: string,
  signal?: AbortSignal,
): Promise<ResolvedPlace | null> {
  if (!BROWSER_KEY || !placeId) return null

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        'X-Goog-Api-Key': BROWSER_KEY,
        'X-Goog-FieldMask': 'location,formattedAddress',
      },
      signal,
    },
  )
  if (!response.ok) throw new Error(`Place details failed (${response.status})`)

  const body = (await response.json()) as PlaceDetailsResponse
  const lat = body.location?.latitude
  const lng = body.location?.longitude
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  return { point: { lat, lng }, address: body.formattedAddress ?? '' }
}
