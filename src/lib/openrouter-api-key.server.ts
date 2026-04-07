/** Read OpenRouter key from env; trims whitespace and a mistaken `Bearer ` prefix. */
export function readOpenRouterApiKey(): string | undefined {
  const raw = process.env.OPENROUTER_API_KEY
  if (raw == null) return undefined
  let k = raw.trim()
  if (k.startsWith('Bearer ')) {
    k = k.slice(7).trim()
  }
  return k.length > 0 ? k : undefined
}
