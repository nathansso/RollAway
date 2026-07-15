// @vitest-environment jsdom
// sendMagicLink needs both localStorage (intent) and window.location (redirect).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthMessageError, sendMagicLink, takeIntent } from './auth'
import { getSupabase } from './supabase'

vi.mock('./supabase', () => ({ getSupabase: vi.fn() }))

const signInWithOtp = vi.fn()

function mockClient() {
  vi.mocked(getSupabase).mockReturnValue({
    auth: { signInWithOtp },
  } as unknown as ReturnType<typeof getSupabase>)
}

// An error as supabase-js surfaces it: a plain object with code/message/status.
function otpError(error: { code?: string; message?: string; status?: number }) {
  signInWithOtp.mockResolvedValue({ error })
}

beforeEach(() => {
  localStorage.clear()
  signInWithOtp.mockReset()
  mockClient()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('sendMagicLink', () => {
  it('creates the user only for the register intent', async () => {
    signInWithOtp.mockResolvedValue({ error: null })

    await sendMagicLink('new@example.com', 'register')
    expect(signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(true)

    await sendMagicLink('back@example.com', 'signin')
    expect(signInWithOtp.mock.calls[1][0].options.shouldCreateUser).toBe(false)
  })

  it('tells an unknown sign-in email to register instead', async () => {
    otpError({ code: 'otp_disabled', message: 'Signups not allowed for otp', status: 422 })

    await expect(sendMagicLink('ghost@example.com', 'signin')).rejects.toBeInstanceOf(
      AuthMessageError,
    )
    await expect(sendMagicLink('ghost@example.com', 'signin')).rejects.toThrow(/create account/i)
  })

  it('does not claim a missing account when the register intent hits otp_disabled', async () => {
    otpError({ code: 'otp_disabled', message: 'Signups not allowed for otp', status: 422 })
    // Registration is genuinely disabled here — that is not "no account yet".
    await expect(sendMagicLink('new@example.com', 'register')).rejects.not.toBeInstanceOf(
      AuthMessageError,
    )
  })

  it('translates the email rate limit', async () => {
    otpError({ code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded', status: 429 })
    await expect(sendMagicLink('spam@example.com', 'register')).rejects.toThrow(/too many/i)
  })

  it('remembers the intent only after the link is sent', async () => {
    otpError({ code: 'over_email_send_rate_limit', status: 429 })
    await expect(sendMagicLink('spam@example.com', 'register')).rejects.toThrow()
    expect(takeIntent()).toBeNull()

    signInWithOtp.mockResolvedValue({ error: null })
    await sendMagicLink('ok@example.com', 'signin')
    expect(takeIntent()).toBe('signin')
  })

  it('reports a clear message when accounts are not configured', async () => {
    vi.mocked(getSupabase).mockReturnValue(null)
    await expect(sendMagicLink('a@example.com', 'signin')).rejects.toBeInstanceOf(AuthMessageError)
  })
})
