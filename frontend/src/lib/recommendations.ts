import type { RecommendationSpot, Verdict } from '../types/contract'

/** A spot the vendor legally cannot use: fails a setback or sits in a closure. */
function isBlocked(spot: RecommendationSpot): boolean {
  return spot.legality?.pass === false || spot.closure?.active === true
}

/** Composite quality: foot traffic first, nudged by the raw score, docked for competition. */
function quality(spot: RecommendationSpot): number {
  const foot = spot.foot_traffic?.score ?? 0
  const overlap = spot.competition?.overlap_count ?? 0
  const base = typeof spot.score === 'number' ? spot.score : 0
  return foot + 0.5 * base - 0.04 * overlap
}

/**
 * Re-derive verdicts and a readable score by *relative* quality, so the
 * strongest legal options read green, the middle read yellow, and the weakest
 * read red. Legality is never overridden: a spot that fails a setback or sits
 * in a closure always stays "avoid". Keeps the returned order (rank) intact.
 */
export function normalizeRecommendations(
  spots: RecommendationSpot[],
): RecommendationSpot[] {
  const legal = spots
    .filter((spot) => !isBlocked(spot))
    .sort((a, b) => quality(b) - quality(a))
  const blocked = spots.filter((spot) => isBlocked(spot))
  const n = legal.length
  const goodCount = n ? Math.max(1, Math.ceil(n * 0.4)) : 0
  const cautionCount = Math.ceil(n * 0.4)

  const rankedLegal = legal.map((spot, index): RecommendationSpot => {
    const verdict: Verdict =
      index < goodCount ? 'good' : index < goodCount + cautionCount ? 'caution' : 'avoid'
    const score = Math.round((0.35 + (1 - index / Math.max(1, n)) * 0.6) * 100) / 100
    return { ...spot, verdict, score, rank: index + 1 }
  })

  // Illegal/closed spots always stay "avoid" and sort to the bottom.
  const rankedBlocked = blocked.map((spot, index): RecommendationSpot => ({
    ...spot,
    verdict: 'avoid',
    score: Math.min(spot.score ?? 0, 0.25),
    rank: rankedLegal.length + index + 1,
  }))

  return [...rankedLegal, ...rankedBlocked]
}
