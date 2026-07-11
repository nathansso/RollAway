import { SAMPLE_MENUS } from '../fixtures/sampleMenus'
import type { CuisineId } from '../fixtures/sampleMenus'
import type {
  DayCode,
  MenuItem,
  PriceTier,
  VendorProfile,
  VendorType,
} from '../types/contract'

export const PROFILE_STORAGE_KEY = 'rollaway.profile.v1'
export const PROFILE_SCHEMA_VERSION = 1 as const

const VENDOR_TYPES = new Set<VendorType>([
  'truck',
  'trailer',
  'pushcart_cooking',
  'pushcart_nocook',
])
const CUISINES = new Set<CuisineId>(SAMPLE_MENUS.map((sample) => sample.id))
const DAYS = new Set<DayCode>(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
const PERMIT_STATUSES = new Set([
  'not_started',
  'researching',
  'in_progress',
  'permitted',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseMenu(raw: string): MenuItem[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(
        /^(.*?)(?:\s*(?:[-–—:]|\.+)?\s*\$?\s*(\d+(?:\.\d{1,2})?))\s*$/,
      )
      if (!match || !match[1]?.trim()) return { name: line, price: null }
      return {
        name: match[1].replace(/[-–—:.\s]+$/, '').trim(),
        price: Number(match[2]),
      }
    })
    .filter((item) => item.name.length > 0)
}

export function derivePriceTier(items: MenuItem[]): PriceTier {
  const prices = items
    .map((item) => item.price)
    .filter((price): price is number => price !== null && Number.isFinite(price))
    .sort((a, b) => a - b)
  if (prices.length === 0) return '$'
  const middle = Math.floor(prices.length / 2)
  const median =
    prices.length % 2 === 0
      ? (prices[middle - 1] + prices[middle]) / 2
      : prices[middle]
  if (median < 8) return '$'
  if (median < 16) return '$$'
  return '$$$'
}

export function validateProfile(value: unknown): value is VendorProfile {
  if (!isRecord(value) || value.schema_version !== PROFILE_SCHEMA_VERSION) return false
  if (!VENDOR_TYPES.has(value.vendor_type as VendorType)) return false
  if (!CUISINES.has(value.cuisine as CuisineId)) return false
  if (!isRecord(value.menu) || typeof value.menu.raw !== 'string' || !value.menu.raw.trim()) {
    return false
  }
  if (
    !Array.isArray(value.menu.items) ||
    !['$', '$$', '$$$'].includes(String(value.menu.price_tier))
  ) {
    return false
  }
  if (!isRecord(value.home_base) || typeof value.home_base.label !== 'string') return false
  if (!value.home_base.label.trim()) return false
  if (
    !isRecord(value.max_travel) ||
    typeof value.max_travel.value !== 'number' ||
    value.max_travel.value <= 0 ||
    !['minutes', 'miles'].includes(String(value.max_travel.unit))
  ) {
    return false
  }
  if (
    !Array.isArray(value.operating_windows) ||
    value.operating_windows.length === 0 ||
    !value.operating_windows.every(
      (window) =>
        isRecord(window) &&
        DAYS.has(window.day as DayCode) &&
        /^\d{2}:\d{2}$/.test(String(window.time_from)) &&
        /^\d{2}:\d{2}$/.test(String(window.time_to)),
    )
  ) {
    return false
  }
  if (!PERMIT_STATUSES.has(String(value.permit_status))) return false
  if (!isRecord(value.autofill_profile)) return false
  const contact = value.autofill_profile
  const required = ['owner_name', 'business_name', 'email', 'phone', 'address']
  if (
    !required.every(
      (key) =>
        typeof contact[key] === 'string' &&
        String(contact[key]).trim().length > 0,
    )
  ) {
    return false
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(contact.email))
}

export function parseStoredProfile(raw: string | null): VendorProfile | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    const migrated =
      isRecord(parsed) &&
      parsed.schema_version === PROFILE_SCHEMA_VERSION &&
      parsed.cuisine === undefined
        ? { ...parsed, cuisine: 'american' }
        : parsed
    return validateProfile(migrated) ? migrated : null
  } catch {
    return null
  }
}
