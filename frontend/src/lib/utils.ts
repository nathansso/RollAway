import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names with Tailwind-aware conflict resolution.
 * Standard shadcn/ui helper: `clsx` builds the list, `tailwind-merge`
 * de-duplicates conflicting Tailwind utilities (last one wins).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
