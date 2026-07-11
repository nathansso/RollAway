/**
 * Pure helpers for the permit checklist view.
 */

import type { Checklist, ChecklistStep, VendorType } from '../../types/contract'

/** Human-friendly label for each canonical vendor type. */
export const VENDOR_TYPE_LABELS: Record<VendorType, string> = {
  truck: 'Food truck',
  trailer: 'Trailer',
  pushcart_cooking: 'Pushcart · cooking',
  pushcart_nocook: 'Pushcart · no cooking',
}

export interface AgencyGroup {
  agency: string
  steps: ChecklistStep[]
}

/**
 * Steps sorted by `order`, then grouped into consecutive runs by agency
 * (first-appearance order of each agency wins).
 */
export function groupStepsByAgency(checklist: Checklist): AgencyGroup[] {
  const sorted = [...checklist.steps].sort((a, b) => a.order - b.order)
  const groups: AgencyGroup[] = []
  const byAgency = new Map<string, AgencyGroup>()
  for (const step of sorted) {
    let group = byAgency.get(step.agency)
    if (!group) {
      group = { agency: step.agency, steps: [] }
      byAgency.set(step.agency, group)
      groups.push(group)
    }
    group.steps.push(step)
  }
  return groups
}

/** Tailwind bg-* classes cycled across agency groups for the header dot. */
export const AGENCY_DOT_CLASSES = [
  'bg-primary',
  'bg-accent',
  'bg-good',
  'bg-caution',
  'bg-secondary',
] as const

export function agencyDotClass(groupIndex: number): string {
  return AGENCY_DOT_CLASSES[groupIndex % AGENCY_DOT_CLASSES.length]
}
