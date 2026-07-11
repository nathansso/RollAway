/**
 * Pure display helpers for the spot detail panel — name formatting,
 * verdict/saturation metadata, and score formatting.
 */

import type { Saturation, Verdict } from '../../types/contract'

/**
 * Derive a friendly spot name from its id.
 * "spot-2nd-howard" -> "2nd & Howard"; "spot-mission-5th" -> "Mission & 5th".
 */
export function spotDisplayName(id: string): string {
  const tokens = id
    .replace(/^spot[-_]?/i, '')
    .split(/[-_]+/)
    .filter(Boolean)
  if (tokens.length === 0) return id
  const capped = tokens.map((t) => t.charAt(0).toUpperCase() + t.slice(1))
  if (capped.length === 2) return `${capped[0]} & ${capped[1]}`
  return capped.join(' ')
}

/** 0.86 -> "86/100" */
export function formatScore(score: number): string {
  const clamped = Math.min(1, Math.max(0, score))
  return `${Math.round(clamped * 100)}/100`
}

export interface VerdictMeta {
  label: string
  /** Solid badge classes. Caution uses dark text — white fails contrast on amber. */
  badgeClass: string
  /** Verdict-tinted text for icons/accents (used on light backgrounds only). */
  iconClass: string
}

export const VERDICT_META: Record<Verdict, VerdictMeta> = {
  good: {
    label: 'Good spot',
    badgeClass: 'bg-good text-on-primary',
    iconClass: 'text-good',
  },
  caution: {
    label: 'Use caution',
    badgeClass: 'bg-caution text-foreground',
    iconClass: 'text-caution',
  },
  avoid: {
    label: 'Avoid',
    badgeClass: 'bg-avoid text-on-primary',
    iconClass: 'text-avoid',
  },
}

export interface SaturationMeta {
  label: string
  dotClass: string
  chipClass: string
}

export const SATURATION_META: Record<Saturation, SaturationMeta> = {
  low: { label: 'Low', dotClass: 'bg-good', chipClass: 'bg-good/10' },
  medium: { label: 'Medium', dotClass: 'bg-caution', chipClass: 'bg-caution/10' },
  high: { label: 'High', dotClass: 'bg-avoid', chipClass: 'bg-avoid/10' },
}
