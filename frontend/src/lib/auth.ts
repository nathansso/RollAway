import type { VendorProfile } from '../types/contract'
import { getSupabase } from './supabase'

// Wave 2 auth helpers (#39/#50). Thin wrappers over the Supabase client that
// keep Supabase specifics out of the store. Magic-link (passwordless) sign-in
// with a register-vs-sign-in split; new/returning routing is decided by whether
// a `profiles` row exists (see store.resolveAuthRouting).

export type AuthIntent = 'signin' | 'register'

const INTENT_KEY = 'rollaway.auth.intent'

// The magic link returns the user to /app; Supabase appends the tokens there and
// detectSessionInUrl consumes them.
function redirectTo(): string {
  return `${window.location.origin}/app`
}

export function rememberIntent(intent: AuthIntent): void {
  try {
    localStorage.setItem(INTENT_KEY, intent)
  } catch {
    /* private mode / storage disabled — routing still falls back to the profiles row */
  }
}

export function takeIntent(): AuthIntent | null {
  try {
    const value = localStorage.getItem(INTENT_KEY)
    if (value) localStorage.removeItem(INTENT_KEY)
    return value === 'signin' || value === 'register' ? value : null
  } catch {
    return null
  }
}

// Carries a message that is safe and useful to show the user verbatim. Raw
// Supabase errors are NOT shown (the store falls back to a generic string), so
// anything worth reading has to be translated into one of these.
export class AuthMessageError extends Error {}

// With shouldCreateUser=false, Supabase rejects an unknown email as
// `otp_disabled` / "Signups not allowed for otp" — which reads as a config
// problem rather than "you don't have an account yet". Translate the cases the
// register/sign-in split depends on into something actionable.
function translateOtpError(error: unknown, intent: AuthIntent): unknown {
  const { code, message, status } = (error ?? {}) as {
    code?: string
    message?: string
    status?: number
  }
  const text = message ?? ''

  if (intent === 'signin' && (code === 'otp_disabled' || /signups not allowed/i.test(text))) {
    return new AuthMessageError(
      'We couldn’t find an account for that email. Switch to Create account to get started.',
    )
  }
  if (code === 'over_email_send_rate_limit' || status === 429) {
    return new AuthMessageError('Too many link requests. Wait a minute and try again.')
  }
  if (code === 'validation_failed' || /invalid.*email/i.test(text)) {
    return new AuthMessageError('That email address doesn’t look right.')
  }
  return error
}

// Send a magic link. `register` creates the user if absent; `signin` does not,
// so an unknown email is told to register instead of silently making an account.
export async function sendMagicLink(email: string, intent: AuthIntent): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new AuthMessageError('Accounts are not configured.')
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      emailRedirectTo: redirectTo(),
      shouldCreateUser: intent === 'register',
    },
  })
  if (error) throw translateOtpError(error, intent)
  // Only remember the intent once the link is actually on its way, so a failed
  // attempt can't leave a stale intent behind for the next redirect to consume.
  rememberIntent(intent)
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase()
  if (supabase) await supabase.auth.signOut()
}

// The minimal columns the `profiles` table stores (0003_users.sql). This is the
// new/returning SIGNAL plus a few reusable defaults — not the full VendorProfile
// (cuisine/menu/contact stay in the localStorage profile).
export interface ProfileRow {
  id: string
  vendor_type: string | null
  max_travel_minutes: number | null
  travel_mode: string | null
  home_lat: number | null
  home_lng: number | null
}

export async function getProfileRow(userId: string): Promise<ProfileRow | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('id, vendor_type, max_travel_minutes, travel_mode, home_lat, home_lng')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as ProfileRow | null) ?? null
}

// Best-effort upsert of the profile subset. RLS scopes the row to auth.uid();
// failures never block the local save (the localStorage profile is the cache).
export async function upsertProfileRow(userId: string, profile: VendorProfile): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const point = profile.home_base?.point ?? null
  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    vendor_type: profile.vendor_type,
    max_travel_minutes: profile.max_travel?.unit === 'minutes' ? profile.max_travel.value : null,
    travel_mode: (profile as { travel_mode?: string }).travel_mode ?? null,
    home_lat: point?.lat ?? null,
    home_lng: point?.lng ?? null,
  })
  if (error) throw error
}
