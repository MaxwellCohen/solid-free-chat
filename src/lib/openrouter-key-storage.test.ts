import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadStoredApiKey, storeApiKey } from './openrouter-key-storage'

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  }
}

describe('openrouter key storage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    vi.stubGlobal('sessionStorage', memoryStorage())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('returns empty when nothing stored', () => {
    expect(loadStoredApiKey()).toEqual({ key: '', remember: false })
  })

  it('stores in sessionStorage by default', () => {
    storeApiKey({ key: 'k1', remember: false })
    expect(loadStoredApiKey()).toEqual({ key: 'k1', remember: false })
    expect(localStorage.length).toBe(0)
  })

  it('stores in localStorage when remembered and clears the other', () => {
    storeApiKey({ key: 'k1', remember: false })
    storeApiKey({ key: 'k2', remember: true })
    expect(loadStoredApiKey()).toEqual({ key: 'k2', remember: true })
    expect(sessionStorage.length).toBe(0)
  })

  it('clears everything for an empty key', () => {
    storeApiKey({ key: 'k', remember: true })
    storeApiKey({ key: '', remember: true })
    expect(loadStoredApiKey().key).toBe('')
  })

  it('swallows storage errors', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
    })
    expect(loadStoredApiKey()).toEqual({ key: '', remember: false })
    expect(() => storeApiKey({ key: 'k', remember: true })).not.toThrow()
  })
})
