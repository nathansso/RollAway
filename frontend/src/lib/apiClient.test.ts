import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LegacyChatResponse, RecommendSpotsRequest } from '../types/contract'
import {
  adaptAgentPermitChecklist,
  adaptLegacyRecommendations,
  adaptNativeRecommendations,
  apiClient,
  buildFunctionUrl,
  estimateTravel,
  normalizeRecommendationTravel,
  normalizeVendors,
  validateClosuresResponse,
  validatePermitChecklist,
  validateRecommendationResponse,
} from './apiClient'

const request: RecommendSpotsRequest = {
  user_profile: {
    schema_version: 1,
    vendor_type: 'truck',
    cuisine: 'mexican',
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
    expect(response.recommendations[0].travel_minutes).toBeGreaterThanOrEqual(3)
    expect(response.recommendations[0].travel_distance_miles).toBeGreaterThanOrEqual(0)
    expect(response.recommendations[0].area_insights?.parking.suitability).toBe('recommended')
    expect(response.recommendations[0].event_opportunity?.event_name).toBe('SF Giants vs Dodgers')
    expect(response.recommendations[0].outreach_draft?.subject).toMatch(/Food vendor inquiry/)
    expect(response.recommendations[0].area_insights?.parking.permit_checks.every((check) => !/hydrant/i.test(check.rule))).toBe(true)
    for (const spot of response.recommendations) {
      expect({
        minutes: spot.travel_minutes,
        miles: spot.travel_distance_miles,
      }).toEqual(estimateTravel(spot.point, request.location))
    }
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
  it('produces deterministic straight-line miles and conservative city minutes', () => {
    expect(estimateTravel(request.location, request.location)).toEqual({
      minutes: 3,
      miles: 0,
    })
    expect(
      estimateTravel({ lat: 37.7869, lng: -122.3882 }, request.location),
    ).toEqual({
      minutes: 7,
      miles: 0.55,
    })
  })

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
            area_insights: {
              parking: {
                point: { lat: 37.7869, lng: -122.3982 },
                suitability: 'recommended',
                permit_checks: [
                  { rule: 'restaurant entrance setback', pass: true, required_ft: 75, actual_ft: 110, cite: 'dpw-182101' },
                ],
                note: 'Verify posted curb and parking signs.',
              },
              local_cuisine: {
                nearby: [{ cuisine: 'tacos', count: 4 }],
                menu_overlap_count: 0,
                opportunity: 'low_direct_overlap',
              },
              navigation: {
                destination: { lat: 37.7869, lng: -122.3982 },
                mode: 'driving',
                minutes: 8,
                estimated: false,
              },
            },
            event_opportunity: {
              event_name: 'Market Night', venue: 'Civic Plaza', start: '2026-07-18T18:00:00',
              expected_attendance: 5000, event_url: 'https://www.ticketmaster.com/event/123', promoter_name: null,
            },
            outreach_draft: { subject: 'Vendor inquiry', body: 'Hello event team.' },
            why_one_line: 'Strong lunch demand',
          },
        ],
      },
      request,
    )
    expect(adapted?.recommendations[0]).toMatchObject({
      rank: 1,
      block_label: '2nd & Howard',
      travel_minutes: 3,
      travel_distance_miles: 0,
      area_insights: {
        parking: { suitability: 'recommended' },
        local_cuisine: { opportunity: 'low_direct_overlap' },
        navigation: { mode: 'driving' },
      },
      event_opportunity: { event_name: 'Market Night', promoter_name: null },
      outreach_draft: { subject: 'Vendor inquiry' },
    })
  })

  it('replaces normalized travel fields with one coherent local estimate', async () => {
    const response = await apiClient.recommendSpots(request, { delayMs: 0 })
    const inconsistent = structuredClone(response)
    inconsistent.recommendations[0].travel_minutes = 99
    inconsistent.recommendations[0].travel_distance_miles = 0.01

    const normalized = normalizeRecommendationTravel(inconsistent, request.location)
    expect(normalized.recommendations[0]).toMatchObject({
      travel_minutes: 3,
      travel_distance_miles: 0,
      area_insights: {
        parking: { suitability: 'recommended' },
        local_cuisine: { opportunity: 'some_direct_overlap' },
        navigation: { mode: 'driving' },
      },
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
      travel_distance_miles: expect.any(Number),
    })
  })

  it('rejects malformed normalized travel values instead of leaking them to UI', async () => {
    const valid = await apiClient.recommendSpots(request, { delayMs: 0 })
    expect(validateRecommendationResponse(valid)).not.toBeNull()

    const negative = structuredClone(valid)
    negative.recommendations[0].travel_distance_miles = -1
    expect(validateRecommendationResponse(negative)).toBeNull()

    const nonFinite = structuredClone(valid)
    nonFinite.recommendations[0].travel_distance_miles = Number.POSITIVE_INFINITY
    expect(validateRecommendationResponse(nonFinite)).toBeNull()

    const invalidMinutes = structuredClone(valid)
    invalidMinutes.recommendations[0].travel_minutes = Number.NaN
    expect(validateRecommendationResponse(invalidMinutes)).toBeNull()
  })

  it('rejects normalized and planned recommendations outside San Francisco', async () => {
    const valid = await apiClient.recommendSpots(request, { delayMs: 0 })
    const outside = structuredClone(valid)
    outside.recommendations[0].point = { lat: 37.8044, lng: -122.2712 }
    expect(validateRecommendationResponse(outside)).toBeNull()

    expect(
      adaptNativeRecommendations(
        {
          spots: [
            {
              rank: 1,
              point: { lat: 37.8044, lng: -122.2712 },
              block_label: 'Oakland',
              why_one_line: 'Outside city',
              score_breakdown: {
                foot_traffic: 0.5,
                competition: 0.5,
                legality: { pass: true, rule: 'test' },
                travel_minutes: 5,
              },
            },
          ],
        },
        request,
      ),
    ).toBeNull()
  })

  it('filters legacy recommendations outside San Francisco', () => {
    const legacy = {
      agent: 'spot_scout',
      reply_markdown: '',
      citations: [],
      checklist: null,
      map_actions: [
        {
          type: 'add_spot',
          id: 'outside',
          point: { lat: 37.8044, lng: -122.2712 },
          verdict: 'good',
          score: 1,
          reasons: [],
          breakdown: { constraints: [], demand: {}, nearby_vendors: [] },
        },
      ],
    } as unknown as LegacyChatResponse

    expect(adaptLegacyRecommendations(legacy, request).recommendations).toEqual([])
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
    expect(
      validateClosuresResponse({
        closures: [
          {
            id: 'bad-line',
            reason: 'Malformed',
            source: 'sfmta_event',
            active_from: '2026-07-11T00:00:00.000Z',
            active_to: '2026-07-11T23:59:59.000Z',
            geometry: {
              type: 'LineString',
              coordinates: [[-122.4013, 37.7793]],
            },
          },
        ],
      }),
    ).toBeNull()
  })

  it('filters GeoJSON and legacy vendors outside San Francisco', () => {
    const sfVendor = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-122.4013, 37.7793] },
      properties: {
        permit_id: 'sf',
        name: 'SF Vendor',
        type: 'truck',
        cuisine: 'mexican',
        status: 'APPROVED',
      },
    }
    const oaklandVendor = {
      ...sfVendor,
      geometry: { type: 'Point', coordinates: [-122.2712, 37.8044] },
      properties: { ...sfVendor.properties, permit_id: 'oakland', name: 'Oakland Vendor' },
    }

    expect(
      normalizeVendors({
        type: 'FeatureCollection',
        features: [sfVendor, oaklandVendor],
      })?.features.map((vendor) => vendor.properties.permit_id),
    ).toEqual(['sf'])
    expect(
      normalizeVendors({
        vendors: [
          { permit_id: 'sf', name: 'SF Vendor', point: { lat: 37.7793, lng: -122.4013 } },
          {
            permit_id: 'oakland',
            name: 'Oakland Vendor',
            point: { lat: 37.8044, lng: -122.2712 },
          },
        ],
      })?.features.map((vendor) => vendor.properties.permit_id),
    ).toEqual(['sf'])
  })

  it('filters closures whose geometry reaches outside San Francisco', () => {
    const closure = {
      id: 'sf',
      reason: 'Street event',
      source: 'sfmta_event',
      active_from: '2026-07-11T00:00:00.000Z',
      active_to: '2026-07-11T23:59:59.000Z',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-122.4013, 37.7793],
          [-122.4003, 37.7803],
        ],
      },
    }
    const result = validateClosuresResponse({
      count: 2,
      closures: [
        closure,
        {
          ...closure,
          id: 'crosses-city-line',
          geometry: {
            type: 'LineString',
            coordinates: [
              [-122.4013, 37.7793],
              [-122.2712, 37.8044],
            ],
          },
        },
      ],
    })

    expect(result?.closures.map((item) => item.id)).toEqual(['sf'])
    expect(result?.count).toBe(1)
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

  it('adapts the direct Permit Copilot envelope into frontend sections', () => {
    const checklist = adaptAgentPermitChecklist(
      {
        agent: 'permit_copilot',
        checklist: {
          vendor_type: 'truck',
          steps: [
            {
              order: 1,
              agency: 'Public Works',
              title: 'Apply for location permit',
              detail: 'Prepare the location packet.',
              deadline_days: 30,
              deadline_label: '30-day notice',
              cite: 'sfpw-mff',
              form_url: 'https://sfpublicworks.org/sites/default/files/Application_for_Mobile_Food_Facility.pdf',
              autofill_field: 'location',
            },
          ],
        },
      },
      'truck',
    )
    expect(checklist?.sections.find((section) => section.agency === 'Public Works')?.items[0])
      .toMatchObject({ title: 'Apply for location permit', easy_apply: true,
        form_url: 'https://sfpublicworks.org/sites/default/files/Application_for_Mobile_Food_Facility.pdf' })
    expect(checklist?.sections).toHaveLength(4)
  })

})


describe('merged recommend_spots boundary', () => {
  it('adapts object breakdowns and excludes eliminated candidates', () => {
    const adapted = adaptNativeRecommendations({
      spots: [
        {
          id: 'spot-live', rank: 1, point: { lat: 37.78, lng: -122.4 },
          block_label: 'Live block', score: 0.8, verdict: 'good',
          why_one_line: 'Strong live candidate.',
          score_breakdown: {
            foot_traffic: 0.75,
            competition: { penalty: 0.2, overlapping: [{ name: 'Nearby tacos' }] },
            legality: { pass: true, rule: 'all setbacks clear', checks: [] },
            closures: { blocked: false },
            travel_minutes: 9,
          },
        },
        {
          id: 'spot-eliminated', rank: null, eliminated: true,
          point: { lat: 37.781, lng: -122.401 }, block_label: 'Rejected block',
          why_one_line: 'Fails clearance.', score_breakdown: {},
        },
      ],
    }, request)
    expect(adapted?.recommendations).toHaveLength(1)
    expect(adapted?.recommendations[0]).toMatchObject({
      id: 'spot-live', travel_minutes: 9,
      competition: { overlap_count: 1, menu_matches: ['Nearby tacos'] },
      closure: { active: false },
    })
  })
})
