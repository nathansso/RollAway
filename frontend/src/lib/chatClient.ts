/**
 * The ONLY network layer in the app. Everything the UI renders comes through here.
 *
 * VITE_USE_FIXTURES=true  -> answer from local fixtures (keyword-routed, 800ms delay)
 * otherwise               -> POST to the real Gradient routed endpoint (Person 2)
 *
 * Flipping to production is env-vars only — zero code changes.
 */

import type { ChatRequest, ChatResponse } from '../types/contract'
import { isApiError } from '../types/contract'
import spotFixture from '../fixtures/chat.spot.json'
import permitFixture from '../fixtures/chat.permit.json'

const USE_FIXTURES =
  (import.meta.env.VITE_USE_FIXTURES ?? 'true').toLowerCase() !== 'false'
const ENDPOINT: string = import.meta.env.VITE_CHAT_ENDPOINT ?? ''

const PERMIT_KEYWORDS =
  /\b(permit|license|licence|fire|legal|checklist|health|dmv|registration|treasurer|paperwork|inspection)\b/i

const FIXTURE_DELAY_MS = 800

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sendFixture(req: ChatRequest): Promise<ChatResponse> {
  await delay(FIXTURE_DELAY_MS)
  const fixture = PERMIT_KEYWORDS.test(req.message) ? permitFixture : spotFixture
  // Deep-clone so UI mutations (e.g. checklist toggles) never touch the module cache
  return structuredClone(fixture) as ChatResponse
}

export class ChatClientError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'ChatClientError'
  }
}

async function sendReal(req: ChatRequest): Promise<ChatResponse> {
  if (!ENDPOINT) {
    throw new ChatClientError(
      'BAD_INPUT',
      'No chat endpoint configured. Set VITE_CHAT_ENDPOINT or enable fixture mode.',
    )
  }
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  } catch {
    throw new ChatClientError(
      'UPSTREAM_TIMEOUT',
      "Couldn't reach the copilot. Check your connection and try again.",
    )
  }
  const body: unknown = await res.json().catch(() => null)
  if (isApiError(body)) {
    throw new ChatClientError(body.error.code, body.error.message)
  }
  if (!res.ok || body === null) {
    throw new ChatClientError(
      'UPSTREAM_TIMEOUT',
      'The copilot had trouble answering. Try again in a moment.',
    )
  }
  return body as ChatResponse
}

export function sendChat(req: ChatRequest): Promise<ChatResponse> {
  return USE_FIXTURES ? sendFixture(req) : sendReal(req)
}
