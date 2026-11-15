import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completeOpenRouterLogin,
  startOpenRouterLogin,
  takeOpenRouterCallbackCode,
} from './openrouter-oauth'

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    get size() {
      return m.size
    },
    entries: () => [...m.entries()],
  }
}

describe('openrouter oauth', () => {
  let ss: ReturnType<typeof memoryStorage>
  let assign: ReturnType<typeof vi.fn>
  let replaceState: ReturnType<typeof vi.fn>

  function stubLocation(href: string) {
    const u = new URL(href)
    vi.stubGlobal('location', {
      href: u.href,
      origin: u.origin,
      pathname: u.pathname,
      assign,
    })
  }

  beforeEach(() => {
    ss = memoryStorage()
    assign = vi.fn()
    replaceState = vi.fn()
    vi.stubGlobal('sessionStorage', ss)
    vi.stubGlobal('history', { state: null, replaceState })
    stubLocation('https://app.example/chat?x=1')
  })
  afterEach(() => vi.unstubAllGlobals())

  it('builds a PKCE S256 auth URL and stores verifier', async () => {
    await startOpenRouterLogin(true)
    const url = assign.mock.calls[0][0] as URL
    expect(url.origin + url.pathname).toBe('https://openrouter.ai/auth')
    expect(url.searchParams.get('callback_url')).toBe(
      'https://app.example/chat',
    )
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    const verifier = ss.entries().find(([k]) => k.endsWith('pkce-verifier'))![1]
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(verifier),
    )
    const expected = Buffer.from(digest).toString('base64url')
    expect(url.searchParams.get('code_challenge')).toBe(expected)
    expect(ss.entries().find(([k]) => k.endsWith('pkce-remember'))![1]).toBe(
      '1',
    )
  })

  it('takes the callback code out of the address bar', () => {
    stubLocation('https://app.example/chat?code=abc&x=1')
    expect(takeOpenRouterCallbackCode()).toBe('abc')
    const cleaned = replaceState.mock.calls[0][2] as URL
    expect(cleaned.search).toBe('?x=1')
  })

  it('returns null without a code', () => {
    expect(takeOpenRouterCallbackCode()).toBeNull()
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('fails when the verifier is missing', async () => {
    await expect(completeOpenRouterLogin('c')).rejects.toThrow(/expired/)
  })

  it('exchanges the code and clears pkce state', async () => {
    ss.setItem('solid-free-chat-openrouter-pkce-verifier', 'ver')
    ss.setItem('solid-free-chat-openrouter-pkce-remember', '1')
    const fetchMock = vi.fn(async () => Response.json({ key: 'sk-or-1' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(completeOpenRouterLogin('code1')).resolves.toEqual({
      key: 'sk-or-1',
      remember: true,
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe('https://openrouter.ai/api/v1/auth/keys')
    expect(JSON.parse(init.body as string)).toEqual({
      code: 'code1',
      code_verifier: 'ver',
      code_challenge_method: 'S256',
    })
    expect(ss.size).toBe(0)
  })

  it('throws with status on a failed exchange', async () => {
    ss.setItem('solid-free-chat-openrouter-pkce-verifier', 'ver')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad', { status: 400 })),
    )
    await expect(completeOpenRouterLogin('c')).rejects.toThrow('(400)')
  })
})
