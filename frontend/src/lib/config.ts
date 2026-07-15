// Runtime endpoint configuration (docs/MIGRATION-PLAN.md Phase 1.1).
//
// The backend endpoint URLs are no longer baked into the bundle at build time.
// At app boot, `initRuntimeConfig()` fetches `/config.json` (written by the
// container entrypoint from env vars — changing a URL is a restart, not a
// rebuild). When the file is absent or malformed (npm run dev, Vitest, the e2e
// suites, any static host without the entrypoint), every accessor falls back
// to the build-time `VITE_*` variable, so all existing workflows run unchanged.
//
// Dev/demo toggles (VITE_USE_FIXTURES, VITE_FIXTURE_DELAY_MS,
// VITE_FORCE_FIRST_TIME_USER) and the public browser keys stay build-time.

const RUNTIME_KEYS = [
  'RECOMMEND_SPOTS_URL',
  'VENDORS_URL',
  'CLOSURES_URL',
  'PERMIT_CHECKLIST_URL',
  'MENU_EXTRACT_URL',
  'FORM_PDF_URL',
  // Wave 2 auth (#39/#50): the Supabase client only initializes when both are
  // present, so auth is off in dev/fixtures/e2e unless explicitly configured.
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
] as const

export type RuntimeConfigKey = (typeof RUNTIME_KEYS)[number]
export type RuntimeConfig = Partial<Record<RuntimeConfigKey, string>>

// Static property accesses so Vite performs its build-time replacement.
const ENV_FALLBACKS: Record<RuntimeConfigKey, unknown> = {
  RECOMMEND_SPOTS_URL: import.meta.env.VITE_RECOMMEND_SPOTS_URL,
  VENDORS_URL: import.meta.env.VITE_VENDORS_URL,
  CLOSURES_URL: import.meta.env.VITE_CLOSURES_URL,
  PERMIT_CHECKLIST_URL: import.meta.env.VITE_PERMIT_CHECKLIST_URL,
  MENU_EXTRACT_URL: import.meta.env.VITE_MENU_EXTRACT_URL,
  FORM_PDF_URL: import.meta.env.VITE_FORM_PDF_URL,
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
}

let runtimeConfig: RuntimeConfig = {}

export function parseRuntimeConfig(body: unknown): RuntimeConfig {
  const next: RuntimeConfig = {}
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return next
  for (const key of RUNTIME_KEYS) {
    const value = (body as Record<string, unknown>)[key]
    if (typeof value === 'string' && value.trim() !== '') next[key] = value.trim()
  }
  return next
}

// Fetch /config.json before the app renders. Never throws: a 404, an HTML SPA
// fallback, or a network error all leave the env fallbacks in charge (the
// README's "recoverable configuration error" behavior in apiClient is
// unchanged — a missing URL with fixtures off still surfaces as CONFIG).
export async function initRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const response = await fetch('/config.json', { cache: 'no-store' })
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.includes('json')) return runtimeConfig
    runtimeConfig = parseRuntimeConfig(await response.json())
  } catch {
    /* dev server / tests / offline: build-time env vars apply */
  }
  return runtimeConfig
}

export function endpointUrl(key: RuntimeConfigKey): string {
  return runtimeConfig[key] ?? String(ENV_FALLBACKS[key] ?? '')
}

// Test-only escape hatch (Vitest modules are isolated per file, so this never
// leaks between suites).
export function setRuntimeConfigForTests(config: RuntimeConfig): void {
  runtimeConfig = config
}
