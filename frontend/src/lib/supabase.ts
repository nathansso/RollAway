import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { endpointUrl } from './config'

// Wave 2 auth (#39/#50). The Supabase client is created lazily from runtime
// config so the whole auth surface stays dormant unless SUPABASE_URL +
// SUPABASE_ANON_KEY are configured — dev, fixtures, e2e, and the pre-cutover
// production build all run exactly as before (localStorage-only profile).

let client: SupabaseClient | null = null
let resolved = false

export function isAuthConfigured(): boolean {
  return Boolean(endpointUrl('SUPABASE_URL') && endpointUrl('SUPABASE_ANON_KEY'))
}

// The shared client, or null when auth isn't configured. Memoized so repeated
// calls (store, gate, onboarding) share one session + one auth listener.
export function getSupabase(): SupabaseClient | null {
  if (resolved) return client
  resolved = true
  const url = endpointUrl('SUPABASE_URL')
  const anonKey = endpointUrl('SUPABASE_ANON_KEY')
  if (!url || !anonKey) return (client = null)
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Parse the magic-link tokens Supabase appends to the redirect URL.
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })
  return client
}

// Test seam: drop the memoized client so a suite can reconfigure runtime config
// and get a fresh client (or null).
export function resetSupabaseForTests(): void {
  client = null
  resolved = false
}
