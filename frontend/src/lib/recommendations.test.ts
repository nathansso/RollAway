import { describe, expect, it } from 'vitest'
import { normalizeRecommendations } from './recommendations'
import type { RecommendationSpot } from '../types/contract'

function spot(over: Partial<RecommendationSpot> & { id: string }): RecommendationSpot {
  return {
    rank: 1,
    point: { lat: 37.78, lng: -122.4 },
    block_label: over.id,
    score: 0,
    verdict: 'avoid',
    why_one_line: '',
    foot_traffic: { level: 'low', score: 0, basis: 'estimated', time_context: '', detail: '' },
    competition: { overlap_count: 0, saturation: 'low', menu_matches: [], price_tier: '$', detail: '' },
    legality: { pass: true, status: 'pass', rule: '', detail: '', cite: '' },
    closure: { active: false, detail: '', source: null },
    travel_minutes: 5,
    travel_distance_miles: 0.5,
    address: null,
    ...over,
  } as RecommendationSpot
}

describe('normalizeRecommendations', () => {
  it('surfaces the strongest legal spots as green even when raw scores are ~0', () => {
    const input = [
      spot({ id: 'a', score: 0.15, foot_traffic: { level: 'low', score: 0, basis: 'estimated', time_context: '', detail: '' } }),
      spot({ id: 'b', foot_traffic: { level: 'high', score: 0.45, basis: 'bay_wheels', time_context: '', detail: '' } }),
      spot({ id: 'c', foot_traffic: { level: 'high', score: 0.44, basis: 'bay_wheels', time_context: '', detail: '' } }),
      spot({ id: 'd', foot_traffic: { level: 'moderate', score: 0.3, basis: 'bay_wheels', time_context: '', detail: '' } }),
      spot({ id: 'e', foot_traffic: { level: 'low', score: 0.1, basis: 'estimated', time_context: '', detail: '' } }),
    ]
    const out = normalizeRecommendations(input)
    const verdicts = out.map((s) => s.verdict)
    expect(verdicts).toContain('good')
    expect(verdicts).toContain('caution')
    // sorted by quality: the best foot-traffic spot (b) ranks first and reads green
    expect(out[0].id).toBe('b')
    expect(out[0].verdict).toBe('good')
    expect(out.find((s) => s.id === 'b')!.score).toBeGreaterThan(out.find((s) => s.id === 'e')!.score)
  })

  it('never marks an illegal or closed spot green', () => {
    const out = normalizeRecommendations([
      spot({ id: 'legal', foot_traffic: { level: 'high', score: 0.9, basis: 'bay_wheels', time_context: '', detail: '' } }),
      spot({ id: 'illegal', foot_traffic: { level: 'high', score: 0.95, basis: 'bay_wheels', time_context: '', detail: '' }, legality: { pass: false, status: 'fail', rule: '', detail: '', cite: '' } }),
      spot({ id: 'closed', foot_traffic: { level: 'high', score: 0.95, basis: 'bay_wheels', time_context: '', detail: '' }, closure: { active: true, detail: '', source: 'x' } }),
    ])
    expect(out.find((s) => s.id === 'illegal')!.verdict).toBe('avoid')
    expect(out.find((s) => s.id === 'closed')!.verdict).toBe('avoid')
    expect(out.find((s) => s.id === 'legal')!.verdict).toBe('good')
  })
})
