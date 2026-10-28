/**
 * The browser talks to OpenRouter directly (it allows CORS), so the user's API
 * key never passes through this app's server.
 */
export const OPENROUTER_API_BASE_URL = 'https://openrouter.ai/api/v1'

export const OPENROUTER_APP_TITLE = 'Solid Free Chat'

export function openRouterApiUrl(path: string): string {
  return `${OPENROUTER_API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}
