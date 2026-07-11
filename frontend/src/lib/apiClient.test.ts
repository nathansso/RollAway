import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LegacyChatResponse, RecommendSpotsRequest } from '../types/contract'
import {
  adaptLegacyRecommendations,
  adaptNativeRecommendations,
  apiClient,
  buildFunctionUrl,
  validateClosuresResponse,
  validatePermitChecklist,
  validateRecommendationResponse,
} from './apiClient'

const request: RecommendSpotsRequest = {
  user_profile: {
    schema_version: 1,
    vendor_type: 'truck',
    menu: { raw: 'Tacos $5', items: [{ name: 'Tacos', price: 5 }], price_tier: '$' },
    home_base: { label: 'SoMa', point: null },
    max_travel: { value: 25, unit: 'minutes' },
    operating_windows: [{ day: 'fri', time_from: '11:00', time_to: '14:00' }],
    permit_status: 'researching',
    autofill_profile: {
      owner_name: 'Avery Rivera',
      business_name: 'Mission Tacos',
      email: 'avery@example.com',
      phone: '415-555-0100',
      address: '1 Mission St',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94103',
    },
  },
  location: { lat: 37.7869, lng: -122.3982 },
  when: {
    preset: 'custom',
    date: '2026-07-10',
    day: 'fri',
    time_from: '11:00',
    time_to: '14:00',
    label: 'Friday lunch',
  },
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
      apiClient.getVendors(request.location, request.when),
      apiClient.getClosures(request.location, request.when),
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

  it('adapts fixture context and only returns closures active for the selected date', async () => {
    const saturday = {
      ...request,
      user_profile: {
        ...request.user_profile,
        menu: { ...request.user_profile.menu, price_tier: '$$' as const },
      },
      location: { lat: 37.75, lng: -122.43 },
      when: { ...request.when, date: '2026-07-11', day: 'sat' as const, label: 'Saturday' },
    }
    const [response, closures] = await Promise.all([
      apiClient.recommendSpots(saturday, { delayMs: 0 }),
      apiClient.getClosures(saturday.location, saturday.when),
    ])
    expect(response.generated_for).toEqual(saturday.when)
    expect(response.recommendations[0].foot_traffic.time_context).toBe('Saturday')
    expect(response.recommendations[0].competition.price_tier).toBe('$$')
    expect(response.recommendations[0].travel_minutes).not.toBe(8)
    expect(response.recommendations[2].closure.active).toBe(false)
    expect(closures.count).toBe(0)
  })

  it('personalizes fire guidance for a no-cook pushcart', async () => {
    const checklist = await apiClient.getPermitChecklist('pushcart_nocook', { delayMs: 0 })
    const fire = checklist.sections.find((section) => section.agency === 'Fire')
    expect(fire?.items[0].title).toMatch(/not required/i)
    expect(fire?.items[0].easy_apply).toBe(false)
  })
})

describe('recommendation network boundary', () => {
  it('converts the planned score_breakdown contract at the boundary', () => {
    const adapted = adaptNativeRecommendations(
      {
        spots: [
          {
            rank: 1,
            point: { lat: 37.7869, lng: -122.3982 },
            block_label: '2nd & Howard',
            total_score: 0.86,
            verdict: 'good',
            score_breakdown: {
              foot_traffic: 0.82,
              competition: 0.2,
              legality: { pass: true, rule: '75 ft clearance', cite: 'dpw-182101' },
              closures: false,
              travel_minutes: 8,
            },
            why_one_line: 'Strong lunch demand',
          },
        ],
      },
      request,
    )
    expect(adapted?.recommendations[0]).toMatchObject({
      rank: 1,
      block_label: '2nd & Howard',
      travel_minutes: 8,
    })
  })

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
  it('builds frozen function query parameters without dropping existing URL params', () => {
    expect(
      buildFunctionUrl('https://example.test/vendors?format=geojson', {
        lat: 37.78,
        lng: -122.4,
        day: 'fri',
        time: '11:00',
      }),
    ).toBe(
      'https://example.test/vendors?format=geojson&lat=37.78&lng=-122.4&day=fri&time=11%3A00',
    )
  })

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
