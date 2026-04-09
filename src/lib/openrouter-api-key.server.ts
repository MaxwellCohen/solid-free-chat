/** Trims whitespace and a mistaken `Bearer ` prefix. */
export function normalizeOpenRouterApiKey(
  raw: string | undefined | null,
): string | undefined {
  if (raw == null) return undefined
  let k = raw.trim()
  if (k.startsWith('Bearer ')) {
    k = k.slice(7).trim()
  }
  return k.length > 0 ? k : undefined
}

/** Optional fallback: `OPENROUTER_API_KEY` in `.env.local` (local dev only). */
export function readOpenRouterApiKey(): string | undefined {
  return normalizeOpenRouterApiKey(process.env.OPENROUTER_API_KEY)
}

/** Prefer client-provided key; otherwise optional env fallback. */
export function resolveOpenRouterApiKey(
  clientProvided?: string | null,
): string | undefined {
  return normalizeOpenRouterApiKey(clientProvided ?? undefined) ?? readOpenRouterApiKey()
}

/**
 * Production path: key from the client (JSON body or `Authorization: Bearer …`).
 * Falls back to `OPENROUTER_API_KEY` only when neither is set (e.g. local dev).
 */
export function resolveOpenRouterApiKeyFromRequest(
  request: Request,
  clientProvided?: string | null,
): string | undefined {
  const fromClient = normalizeOpenRouterApiKey(clientProvided ?? undefined)
  const fromHeader = normalizeOpenRouterApiKey(
    request.headers.get('authorization') ?? undefined,
  )
  return fromClient ?? fromHeader ?? readOpenRouterApiKey()
}
