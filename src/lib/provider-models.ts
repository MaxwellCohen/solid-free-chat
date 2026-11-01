import type { ChatModelOption } from './chat-models'
import type { Provider } from './providers'

export const NON_CHAT =
  /embed|whisper|tts|orpheus|playai|speech|voice|audio|transcri|moderation|guard|safeguard|rerank|image|diffusion|ocr/i

const cache = new Map<string, { options: ChatModelOption[]; expires: number }>()
const CACHE_TTL_MS = 5 * 60_000

/** Lists chat models from an OpenAI-compatible `/models` endpoint. */
export async function getProviderModelOptionsCached(
  provider: Provider,
  apiKey: string,
): Promise<ChatModelOption[]> {
  const cacheKey = `${provider.id}:${apiKey}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() < hit.expires) return hit.options
  if (!apiKey) return []

  const res = await fetch(`${provider.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const hint = res.status === 401 ? ' Invalid or expired API key.' : ''
    throw new Error(`${provider.name} models failed (${res.status}).${hint}`)
  }
  const data =
    json && typeof json === 'object' && 'data' in json
      ? (json as { data: unknown }).data
      : json
  if (!Array.isArray(data)) {
    throw new Error(`${provider.name} models: unexpected response shape`)
  }
  const options: ChatModelOption[] = []
  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const id = (item as { id?: unknown }).id
    if (typeof id !== 'string' || NON_CHAT.test(id)) continue
    // Mistral reports chat support explicitly.
    const caps = (item as { capabilities?: { completion_chat?: unknown } })
      .capabilities
    if (caps?.completion_chat === false) continue
    options.push({ id, name: id })
  }
  options.sort((a, b) => a.id.localeCompare(b.id))
  cache.set(cacheKey, { options, expires: Date.now() + CACHE_TTL_MS })
  return options
}
