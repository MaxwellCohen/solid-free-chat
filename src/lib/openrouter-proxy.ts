/** Same-origin pass-through to `https://openrouter.ai/api/v1` (see `routes/api/openrouter/$.ts`). */
export const OPENROUTER_PROXY_PATH = '/api/openrouter/v1'

/** Absolute proxy base URL; the OpenRouter SDK needs an absolute `serverURL`. */
export function openRouterProxyBaseUrl(): string {
  const origin =
    typeof location !== 'undefined' ? location.origin : 'http://localhost'
  return `${origin}${OPENROUTER_PROXY_PATH}`
}

export function openRouterProxyUrl(path: string): string {
  return `${openRouterProxyBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`
}
