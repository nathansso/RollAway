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
  /\b(permits?|licen[cs]es?|fire|legal|checklists?|health|dmv|registrations?|treasurer|paperwork|inspections?)\b/i

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

const VERDICTS = new Set<string>(['good', 'caution', 'avoid'])

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/** Defensive pass over a real-backend body so a sloppy payload can't crash the UI. */
function sanitizeResponse(body: ChatResponse): ChatResponse {
  const map_actions = Array.isArray(body.map_actions)
    ? body.map_actions
        .filter(
          (a) =>
            a != null &&
            a.type === 'add_spot' &&
            VERDICTS.has(a.verdict) &&
            a.breakdown != null &&
            a.breakdown.demand != null &&
            a.breakdown.constraints != null,
        )
        .map((a) => ({ ...a, score: clamp01(a.score) }))
    : null
  const citations = Array.isArray(body.citations) ? body.citations : []
  const checklist =
    body.checklist && Array.isArray(body.checklist.steps) ? body.checklist : null
  return { ...body, citations, map_actions, checklist }
}

/** Drain a streamed (SSE / NDJSON) body into a single parsed JSON payload. */
async function readStreamedBody(res: Response, isSse: boolean): Promise<unknown> {
  if (!res.body) return null
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let raw = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  const payloads: string[] = []
  for (const line of raw.split('\n')) {
    let data = line
    if (isSse) {
      if (!line.startsWith('data:')) continue
      data = line.slice(5).trimStart()
    }
    data = data.trim()
    if (!data || data === '[DONE]') continue
    payloads.push(data)
  }
  if (payloads.length === 0) return null
  try {
    return JSON.parse(payloads.join(''))
  } catch {
    try {
      return JSON.parse(payloads[payloads.length - 1])
    } catch {
      return null
    }
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
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req),
    })
  } catch {
    throw new ChatClientError(
      'UPSTREAM_TIMEOUT',
      "Couldn't reach the copilot. Check your connection and try again.",
    )
  }
  const contentType = res.headers.get('content-type') ?? ''
  const isStream =
    contentType.includes('text/event-stream') || contentType.includes('ndjson')
  const body: unknown = isStream
    ? await readStreamedBody(res, contentType.includes('text/event-stream')).catch(
        () => null,
      )
    : await res.json().catch(() => null)
  if (isApiError(body)) {
    throw new ChatClientError(body.error.code, body.error.message)
  }
  if (!res.ok || body === null) {
    throw new ChatClientError(
      'UPSTREAM_TIMEOUT',
      'The copilot had trouble answering. Try again in a moment.',
    )
  }
  return sanitizeResponse(body as ChatResponse)
}

export function sendChat(req: ChatRequest): Promise<ChatResponse> {
  return USE_FIXTURES ? sendFixture(req) : sendReal(req)
}
