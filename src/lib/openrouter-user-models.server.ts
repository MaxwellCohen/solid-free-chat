import { startSpan } from '@sentry/core'
import type {
  ChatModelOption,
  OpenRouterModelPricing,
  OpenRouterUserModelRow,
} from './chat-models'
import { DEFAULT_CHAT_MODEL, toFreeTextChatOptions } from './chat-models'

const OPENROUTER_MODELS_USER_URL = 'https://openrouter.ai/api/v1/models/user'

function formatOpenRouterErrorBody(json: unknown, fallback: string): string {
  if (!json || typeof json !== 'object') return fallback
  const o = json as Record<string, unknown>
  if ('message' in o && typeof o.message === 'string') return o.message
  if ('error' in o) {
    const err = o.error
    if (typeof err === 'string') return err
    if (err && typeof err === 'object' && 'message' in err) {
      const m = (err as { message: unknown }).message
      if (typeof m === 'string') return m
    }
    try {
      return JSON.stringify(err)
    } catch {
      return fallback
    }
  }
  return fallback
}
const CACHE_TTL_MS = 5 * 60_000

type CacheEntry = {
  options: ChatModelOption[]
  ids: Set<string>
  expires: number
}

let cache: CacheEntry | null = null

function parseUserModelRow(raw: unknown): OpenRouterUserModelRow | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null
  const pricing = o.pricing
  const architecture = o.architecture
  if (!pricing || typeof pricing !== 'object') return null
  if (!architecture || typeof architecture !== 'object') return null
  const arch = architecture as Record<string, unknown>
  const input_modalities = Array.isArray(arch.input_modalities)
    ? arch.input_modalities.filter((x): x is string => typeof x === 'string')
    : undefined
  const output_modalities = Array.isArray(arch.output_modalities)
    ? arch.output_modalities.filter((x): x is string => typeof x === 'string')
    : undefined
  return {
    id: o.id,
    name: o.name,
    pricing: pricing as OpenRouterModelPricing,
    architecture: { input_modalities, output_modalities },
  }
}

async function refreshCache(apiKey: string): Promise<CacheEntry> {
  const options = await startSpan(
    { name: 'OpenRouter GET /api/v1/models/user', op: 'http.client' },
    async () => {
      const res = await fetch(OPENROUTER_MODELS_USER_URL, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })

      const json: unknown = await res.json().catch(() => null)

      if (!res.ok) {
        const detail = formatOpenRouterErrorBody(json, res.statusText)
        const hint =
          res.status === 401
            ? ' Check OPENROUTER_API_KEY in .env.local (create a key at https://openrouter.ai/keys).'
            : ''
        throw new Error(
          `OpenRouter models/user failed (${res.status}): ${detail}.${hint}`,
        )
      }

      if (!json || typeof json !== 'object' || !('data' in json)) {
        throw new Error('OpenRouter models/user: invalid response shape')
      }
      const data = (json as { data: unknown }).data
      if (!Array.isArray(data)) {
        throw new Error('OpenRouter models/user: expected data array')
      }

      const rows: OpenRouterUserModelRow[] = []
      for (const item of data) {
        const row = parseUserModelRow(item)
        if (row) rows.push(row)
      }
      return toFreeTextChatOptions(rows)
    },
  )

  const ids = new Set(options.map((o) => o.id))
  const entry: CacheEntry = {
    options,
    ids,
    expires: Date.now() + CACHE_TTL_MS,
  }
  cache = entry
  return entry
}

/** Returns free text-chat models for the user key; reuses in-memory cache for ~5 minutes. */
export async function getFreeTextChatModelOptionsCached(
  apiKey: string,
): Promise<ChatModelOption[]> {
  if (cache && Date.now() < cache.expires) {
    return cache.options
  }
  const next = await refreshCache(apiKey)
  return next.options
}

export type ResolveModelResult =
  | { ok: true; model: string }
  | { ok: false; error: string; status: number }

/**
 * Resolves the model for chat requests: explicit ids must be allowlisted;
 * when omitted, uses DEFAULT_CHAT_MODEL or the first free model if needed.
 */
export async function resolveAllowedChatModel(
  apiKey: string,
  explicitModel: string | undefined,
): Promise<ResolveModelResult> {
  const options = await getFreeTextChatModelOptionsCached(apiKey)
  if (options.length === 0) {
    return {
      ok: false,
      error: 'No free text chat models available for this API key.',
      status: 503,
    }
  }
  const ids = new Set(options.map((o) => o.id))
  const explicit = typeof explicitModel === 'string' && explicitModel.length > 0

  if (!explicit) {
    const first = options[0]
    const model = ids.has(DEFAULT_CHAT_MODEL) ? DEFAULT_CHAT_MODEL : first.id
    return { ok: true, model }
  }

  if (ids.has(explicitModel)) {
    return { ok: true, model: explicitModel }
  }
  return { ok: false, error: 'Unknown or disallowed model', status: 400 }
}
