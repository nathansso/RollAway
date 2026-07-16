import { describe, expect, it } from 'vitest'
import {
  DISCOVERY_FLOOR,
  MAX_DISCOVERED,
  MAX_PER_VIEWPORT,
  demandAt,
  mergeDiscovered,
  metersBetween,
  synthesizeViewportSpots,
} from './discover'
import { validateRecommendationResponse } from './apiClient'
import { isOnSanFranciscoLand } from './sfLand'
import type { LatLng, SessionWhen } from '../types/contract'

const when: SessionWhen = {
  preset: 'custom',
  date: '2026-07-10',
  day: 'fri',
  time_from: '11:00',
  time_to: '14:00',
  label: 'Friday lunch',
}

const ORIGIN: LatLng = { lat: 37.7793, lng: -122.4013 }

/** Roughly a phone viewport at the app's default zoom. */
function box(lat: number, lng: number, dLat = 0.004, dLng = 0.0035) {
  return {
    southwest: { lat: lat - dLat, lng: lng - dLng },
    northeast: { lat: lat + dLat, lng: lng + dLng },
  }
}

const FINANCIAL_DISTRICT = box(37.7915, -122.4005)
const OUTER_SUNSET = box(37.7538, -122.4936)

function discover(bounds: ReturnType<typeof box>, existing: never[] = []) {
  return synthesizeViewportSpots(bounds, { origin: ORIGIN, when, existing })
}

describe('viewport discovery', () => {
  it('keeps every pin inside the box it was asked about', () => {
    const found = discover(FINANCIAL_DISTRICT)
    expect(found.length).toBeGreaterThan(0)
    for (const spot of found) {
      expect(spot.point.lat).toBeGreaterThanOrEqual(FINANCIAL_DISTRICT.southwest.lat)
      expect(spot.point.lat).toBeLessThanOrEqual(FINANCIAL_DISTRICT.northeast.lat)
      expect(spot.point.lng).toBeGreaterThanOrEqual(FINANCIAL_DISTRICT.southwest.lng)
      expect(spot.point.lng).toBeLessThanOrEqual(FINANCIAL_DISTRICT.northeast.lng)
    }
  })

  // The point of an absolute floor: a region with no crowd yields no pins at
  // all. Relative grading would have ranked these against each other and still
  // painted the best of a bad lot green.
  it('finds nothing in a region that does not clear the floor', () => {
    expect(demandAt({ lat: 37.7538, lng: -122.4936 })).toBeLessThan(DISCOVERY_FLOOR)
    expect(discover(OUTER_SUNSET)).toEqual([])
  })

  // Caught in-browser: a viewport of the Embarcadero is mostly Bay, and pins
  // were landing in open water off the piers.
  it('never puts a pin in the water', () => {
    const embarcadero = box(37.7955, -122.3937)
    const found = synthesizeViewportSpots(embarcadero, { origin: ORIGIN, when, existing: [] })
    expect(found.length).toBeGreaterThan(0)
    for (const spot of found) {
      expect(isOnSanFranciscoLand(spot.point)).toBe(true)
    }
    // A viewport that is *only* Bay yields nothing at all.
    expect(discover(box(37.795, -122.375))).toEqual([])
  })

  it('never returns more than the per-viewport cap', () => {
    expect(discover(FINANCIAL_DISTRICT).length).toBeLessThanOrEqual(MAX_PER_VIEWPORT)
  })

  it('declines to scout a whole-city viewport', () => {
    expect(discover(box(37.7793, -122.4013, 0.06, 0.06))).toEqual([])
  })

  // Eviction rebuilds pins from coordinates alone, so panning away and back has
  // to return the same spots rather than reroll the neighborhood.
  it('rebuilds identical pins for the same box', () => {
    const first = discover(FINANCIAL_DISTRICT)
    const second = discover(FINANCIAL_DISTRICT)
    expect(second.map((spot) => spot.id)).toEqual(first.map((spot) => spot.id))
    expect(second.map((spot) => spot.score)).toEqual(first.map((spot) => spot.score))
  })

  it('does not stack a new pin on one that is already there', () => {
    const first = discover(FINANCIAL_DISTRICT)
    const again = synthesizeViewportSpots(FINANCIAL_DISTRICT, {
      origin: ORIGIN,
      when,
      existing: first,
    })
    expect(again).toEqual([])
  })

  it('grades what it shows as good or caution, never as junk worth avoiding', () => {
    const found = [
      ...discover(FINANCIAL_DISTRICT),
      ...discover(box(37.7955, -122.3937)),
      ...discover(box(37.7599, -122.4148)),
    ]
    expect(found.length).toBeGreaterThan(0)
    for (const spot of found) {
      expect(spot.score).toBeGreaterThanOrEqual(DISCOVERY_FLOOR)
      expect(['good', 'caution']).toContain(spot.verdict)
    }
  })

  // Discovered pins reach the same UI as ranked ones, so they must satisfy the
  // same contract the live boundary enforces.
  it('produces spots the live validator accepts', () => {
    const found = discover(FINANCIAL_DISTRICT)
    expect(
      validateRecommendationResponse({
        contract_version: 2,
        generated_for: when,
        recommendations: found,
      }),
    ).not.toBeNull()
  })
})

describe('discovered pool merge', () => {
  const focus: LatLng = { lat: 37.7915, lng: -122.4005 }

  function poolOf(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      ...discover(FINANCIAL_DISTRICT)[0],
      id: `spot-found-${index}`,
      point: { lat: 37.79 + index * 0.004, lng: -122.4 },
    }))
  }

  it('holds the pool at the ceiling', () => {
    expect(mergeDiscovered(poolOf(MAX_DISCOVERED + 6), [], focus)).toHaveLength(MAX_DISCOVERED)
  })

  it('drops the pins furthest from where the vendor is now', () => {
    const kept = mergeDiscovered(poolOf(MAX_DISCOVERED + 6), [], focus)
    const distances = kept.map((spot) => metersBetween(spot.point, focus))
    expect(Math.max(...distances)).toBeLessThan(
      metersBetween({ lat: 37.79 + (MAX_DISCOVERED + 5) * 0.004, lng: -122.4 }, focus),
    )
  })

  it('re-merges a pin already in the pool without duplicating it', () => {
    const found = discover(FINANCIAL_DISTRICT)
    expect(mergeDiscovered(found, found, focus)).toHaveLength(found.length)
  })
})
