import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadJson, loadStringArray, saveJson } from './storage'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
  clear() {
    this.values.clear()
  }
  removeItem(key: string) {
    this.values.delete(key)
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: new MemoryStorage(),
})

describe('defensive local storage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('returns fallback for missing or malformed values', () => {
    expect(loadJson('missing', { ok: true })).toEqual({ ok: true })
    localStorage.setItem('broken', '{not json')
    expect(loadJson('broken', [])).toEqual([])
  })

  it('rejects non-array and non-string permit progress', () => {
    localStorage.setItem('object', JSON.stringify({ done: true }))
    localStorage.setItem('mixed', JSON.stringify(['valid', 42, null]))
    expect(loadStringArray('object')).toEqual([])
    expect(loadStringArray('mixed')).toEqual([])
  })

  it('does not throw when browser storage is unavailable', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded')
    })
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('denied')
    })

    expect(saveJson('key', { current: 'state' })).toBe(false)
    expect(loadJson('key', { current: 'state' })).toEqual({ current: 'state' })
  })
})
