/**
 * Page CSP. The point is `connect-src`: even if hostile script ran in the page,
 * the browser refuses `fetch`/XHR/WebSocket/beacon to anywhere but this origin,
 * OpenRouter, and Sentry — so the API key cannot be quietly sent elsewhere.
 */
function sentryOrigin(): string | undefined {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (typeof dsn !== 'string' || !dsn.trim()) return undefined
  try {
    return new URL(dsn.trim()).origin
  } catch {
    return undefined
  }
}

export function contentSecurityPolicy(): string {
  const connect = ["'self'", 'https://openrouter.ai']
  const sentry = sentryOrigin()
  if (sentry) connect.push(sentry)
  // Vite HMR and TanStack devtools use local websockets / ports.
  if (import.meta.env.DEV)
    connect.push('ws://localhost:*', 'http://localhost:*')

  return [
    "default-src 'self'",
    // Inline theme bootstrap + SSR hydration scripts.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // Model-returned markdown may embed remote images.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}
