import { describe, expect, it } from 'vitest'
import { buildNavigationUrl } from './navigation'

describe('buildNavigationUrl', () => {
  it('includes origin, suggested destination, and immediate navigation intent', () => {
    const url = new URL(buildNavigationUrl(
      { lat: 37.78, lng: -122.4 },
      { lat: 37.781, lng: -122.399 },
      'driving',
    ))
    expect(url.origin).toBe('https://www.google.com')
    expect(url.searchParams.get('origin')).toBe('37.78,-122.4')
    expect(url.searchParams.get('destination')).toBe('37.781,-122.399')
    expect(url.searchParams.get('travelmode')).toBe('driving')
    expect(url.searchParams.get('dir_action')).toBe('navigate')
  })

  it('maps cycling to the Google Maps bicycling mode', () => {
    const url = new URL(buildNavigationUrl(
      { lat: 37.78, lng: -122.4 },
      { lat: 37.781, lng: -122.399 },
      'cycling',
    ))
    expect(url.searchParams.get('travelmode')).toBe('bicycling')
  })
})
