import { useState, type FormEvent } from 'react'
import BrandMark from '../common/BrandMark'
import { useAppStore } from '../../store'
import type { AuthIntent } from '../../lib/auth'

// Wave 2 (#39/#50): the dedicated sign-in / register page. Passwordless magic
// link, with a clear register-vs-sign-in split. After the link is followed,
// the store routes new users to onboarding and returning users to the map.
export default function AuthPage() {
  const sendLink = useAppStore((s) => s.sendAuthMagicLink)
  const authError = useAppStore((s) => s.authError)
  const clearAuthError = useAppStore((s) => s.clearAuthError)
  const [mode, setMode] = useState<AuthIntent>('register')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      await sendLink(trimmed, mode)
      setSentTo(trimmed)
    } catch {
      /* authError is surfaced from the store */
    } finally {
      setSubmitting(false)
    }
  }

  if (sentTo) {
    return (
      <div className="onboarding-page flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <BrandMark className="mb-6 h-10 w-auto" />
        <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-6 shadow-sm">
          <h1 className="text-lg font-bold text-foreground">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a sign-in link to <span className="font-semibold text-foreground">{sentTo}</span>.
            Open it on this device to {mode === 'register' ? 'finish setting up your account' : 'sign in'}.
          </p>
          <button
            type="button"
            className="mt-5 text-sm font-semibold text-primary underline"
            onClick={() => setSentTo(null)}
          >
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="onboarding-page flex min-h-dvh flex-col items-center justify-center px-6">
      <BrandMark className="mb-6 h-10 w-auto" />
      <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-6 shadow-sm">
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Account">
          {(['register', 'signin'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => {
                setMode(value)
                clearAuthError()
              }}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                mode === value ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {value === 'register' ? 'Create account' : 'Sign in'}
            </button>
          ))}
        </div>

        <h1 className="text-lg font-bold text-foreground">
          {mode === 'register' ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'register'
            ? 'We’ll email you a secure link — no password to remember.'
            : 'Enter your email and we’ll send a sign-in link.'}
        </p>

        <form onSubmit={submit} className="mt-4">
          <label className="block text-sm">
            <span className="text-muted-foreground">Email</span>
            <input
              className="form-input mt-1"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {authError && (
            <p className="mt-2 text-sm font-medium text-destructive" role="status">
              {authError}
            </p>
          )}
          <button type="submit" className="primary-button mt-4 w-full" disabled={submitting}>
            {submitting
              ? 'Sending…'
              : mode === 'register'
                ? 'Send my sign-up link'
                : 'Send my sign-in link'}
          </button>
        </form>
      </div>
      <p className="mt-4 max-w-sm text-center text-xs text-muted-foreground">
        {mode === 'register'
          ? 'New here? Creating an account walks you through setup.'
          : 'Returning? Signing in takes you straight to your map.'}
      </p>
    </div>
  )
}
