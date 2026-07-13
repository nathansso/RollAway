import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  endpointUrl,
  initRuntimeConfig,
  parseRuntimeConfig,
  setRuntimeConfigForTests,
} from './config'

function jsonResponse(body: unknown, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': contentType },
  })
}

afterEach(() => {
  setRuntimeConfigForTests({})
  vi.unstubAllGlobals()
})

describe('parseRuntimeConfig', () => {
  it('keeps only known string keys and trims values', () => {
    expect(
      parseRuntimeConfig({
        RECOMMEND_SPOTS_URL: ' https://api.example/recommend ',
        VENDORS_URL: '',
        CLOSURES_URL: 42,
        UNKNOWN_KEY: 'https://evil.example',
      }),
    ).toEqual({ RECOMMEND_SPOTS_URL: 'https://api.example/recommend' })
  })

  it('returns empty config for non-object bodies', () => {
    expect(parseRuntimeConfig(null)).toEqual({})
    expect(parseRuntimeConfig(['a'])).toEqual({})
    expect(parseRuntimeConfig('str')).toEqual({})
  })
})

describe('initRuntimeConfig', () => {
  it('loads endpoint URLs from /config.json', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ VENDORS_URL: 'https://api.example/vendors' })),
    )
    await initRuntimeConfig()
    expect(endpointUrl('VENDORS_URL')).toBe('https://api.example/vendors')
  })

  it('ignores an HTML SPA fallback response (dev server, static hosts)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<!doctype html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })),
    )
    await initRuntimeConfig()
    expect(endpointUrl('VENDORS_URL')).toBe(
      String(import.meta.env.VITE_VENDORS_URL ?? ''),
    )
  })

  it('survives a network error and keeps env fallbacks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    await expect(initRuntimeConfig()).resolves.toBeDefined()
    expect(endpointUrl('RECOMMEND_SPOTS_URL')).toBe(
      String(import.meta.env.VITE_RECOMMEND_SPOTS_URL ?? ''),
    )
  })
})

describe('endpointUrl', () => {
  it('prefers runtime config over the build-time env', () => {
    setRuntimeConfigForTests({ FORM_PDF_URL: 'https://api.example/form_pdf' })
    expect(endpointUrl('FORM_PDF_URL')).toBe('https://api.example/form_pdf')
  })

  it('falls back to the build-time env when the key is absent', () => {
    setRuntimeConfigForTests({})
    expect(endpointUrl('CLOSURES_URL')).toBe(
      String(import.meta.env.VITE_CLOSURES_URL ?? ''),
    )
  })
})
