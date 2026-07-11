import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LegacyChatResponse, RecommendSpotsRequest } from '../types/contract'
import {
  adaptLegacyRecommendations,
  apiClient,
  validateClosuresResponse,
  validatePermitChecklist,
  validateRecommendationResponse,
} from './apiClient'

const request: RecommendSpotsRequest = {
  vendor_type: 'truck',
  menu: { raw: 'Tacos $5', items: [{ name: 'Tacos', price: 5 }], price_tier: '$' },
  location: { lat: 37.7869, lng: -122.3982 },
  when: {
    preset: 'custom',
    date: '2026-07-10',
    day: 'fri',
    time_from: '11:00',
    time_to: '14:00',
    label: 'Friday lunch',
  },
  max_travel: { value: 25, unit: 'minutes' },
}

describe('fixture API client', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns the complete deterministic SoMa scenario without fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const response = await apiClient.recommendSpots(request, { delayMs: 0 })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(response.recommendations).toHaveLength(3)
    expect(response.recommendations.map((spot) => spot.block_label)).toEqual([
      '2nd & Howard',
      'Folsom & 1st',
      'Mission & 5th',
    ])
    expect(response.recommendations[0].foot_traffic.basis).toBe('bay_wheels')
  })

  it('returns vendors, closures, and permit guidance without fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const [vendors, closures, checklist] = await Promise.all([
      apiClient.getVendors(),
      apiClient.getClosures(),
      apiClient.getPermitChecklist('truck', { delayMs: 0 }),
    ])

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(vendors.features.length).toBeGreaterThan(0)
    expect(closures.closures.length).toBeGreaterThan(0)
    expect(checklist.sections.map((section) => section.agency)).toEqual([
      'Public Works',
      'Public Health',
      'Fire',
      'Treasurer',
    ])
  })

  it('personalizes fire guidance for a no-cook pushcart', async () => {
    const checklist = await apiClient.getPermitChecklist('pushcart_nocook', { delayMs: 0 })
    const fire = checklist.sections.find((section) => section.agency === 'Fire')
    expect(fire?.items[0].title).toMatch(/not required/i)
    expect(fire?.items[0].easy_apply).toBe(false)
  })
})

describe('recommendation network boundary', () => {
  it('converts the old map_actions envelope in one adapter', () => {
    const legacy: LegacyChatResponse = {
      agent: 'spot_scout',
      reply_markdown: 'unused',
      citations: [],
      checklist: null,
      map_actions: [
        {
          type: 'add_spot',
          id: 'spot-2nd-howard',
          point: { lat: 37.7869, lng: -122.3982 },
          verdict: 'good',
          score: 0.86,
          reasons: ['Strong lunch demand'],
          breakdown: {
            constraints: [{ rule: '75 ft restaurant clearance', pass: true, detail: '110 ft' }],
            demand: { foot_traffic_score: 0.82, restaurant_saturation: 'low' },
            nearby_vendors: [],
          },
        },
      ],
    }

    const adapted = adaptLegacyRecommendations(legacy, request)
    expect(adapted.recommendations[0]).toMatchObject({
      rank: 1,
      block_label: '2nd & Howard',
      verdict: 'good',
      travel_minutes: expect.any(Number),
    })
  })

  it('rejects malformed native responses instead of leaking unsafe values to UI', () => {
    expect(validateRecommendationResponse({ recommendations: [{ rank: 'first' }] })).toBeNull()
    expect(validateRecommendationResponse(null)).toBeNull()
  })
})

describe('other live response boundaries', () => {
  it('rejects malformed closures before Mapbox receives geometry', () => {
    expect(validateClosuresResponse({ closures: [{ geometry: null }], count: 1 })).toBeNull()
  })

  it('rejects malformed permit sections before React renders them', () => {
    expect(
      validatePermitChecklist({
        vendor_type: 'truck',
        generated_at: 'now',
        sections: [{ agency: 'Public Works', items: 'not-an-array' }],
      }),
    ).toBeNull()
  })
})
