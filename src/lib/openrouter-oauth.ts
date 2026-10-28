import { openRouterApiUrl } from './openrouter-api'

/**
 * "Sign in with OpenRouter" via OAuth PKCE. The whole exchange happens in the
 * browser: openrouter.ai redirects back with a one-time `code`, which we trade
 * (with the verifier only this tab knows) for a user-controlled API key.
 */
const PKCE_VERIFIER_SS_KEY = 'solid-free-chat-openrouter-pkce-verifier'
const PKCE_REMEMBER_SS_KEY = 'solid-free-chat-openrouter-pkce-remember'

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  )
  return base64Url(new Uint8Array(digest))
}

function callbackUrl(): string {
  return `${location.origin}${location.pathname}`
}

/** Redirects to openrouter.ai; `remember` is restored when the user comes back. */
export async function startOpenRouterLogin(remember: boolean): Promise<void> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)))
  sessionStorage.setItem(PKCE_VERIFIER_SS_KEY, verifier)
  sessionStorage.setItem(PKCE_REMEMBER_SS_KEY, remember ? '1' : '0')
  const url = new URL('https://openrouter.ai/auth')
  url.searchParams.set('callback_url', callbackUrl())
  url.searchParams.set('code_challenge', await sha256Base64Url(verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  location.assign(url)
}

/**
 * If this page load is an OAuth callback, removes `?code=` from the address bar
 * (so it doesn't linger in history or error reports) and returns it.
 */
export function takeOpenRouterCallbackCode(): string | null {
  const url = new URL(location.href)
  const code = url.searchParams.get('code')
  if (!code) return null
  url.searchParams.delete('code')
  history.replaceState(history.state, '', url)
  return code
}

/** Exchanges the callback code for an API key. */
export async function completeOpenRouterLogin(
  code: string,
): Promise<{ key: string; remember: boolean }> {
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_SS_KEY)
  const remember = sessionStorage.getItem(PKCE_REMEMBER_SS_KEY) === '1'
  sessionStorage.removeItem(PKCE_VERIFIER_SS_KEY)
  sessionStorage.removeItem(PKCE_REMEMBER_SS_KEY)
  if (!verifier) {
    throw new Error('Sign-in expired — start it again from this tab.')
  }
  const res = await fetch(openRouterApiUrl('/auth/keys'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      code_challenge_method: 'S256',
    }),
  })
  const json = (await res.json().catch(() => null)) as { key?: unknown } | null
  if (!res.ok || typeof json?.key !== 'string' || !json.key) {
    throw new Error(`OpenRouter sign-in failed (${res.status}).`)
  }
  return { key: json.key, remember }
}
