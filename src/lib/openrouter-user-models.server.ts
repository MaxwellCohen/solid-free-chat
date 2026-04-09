import { startSpan } from '@sentry/core'
import type {
  ChatModelOption,
  OpenRouterModelPricing,
  OpenRouterUserModelRow,
} from './chat-models'
import {
  DEFAULT_CHAT_MODEL,
  FREE_MODELS_ROUTER_ID,
  ensureFreeModelsRouterInOptions,
  toFreeTextChatOptions,
} from './chat-models'

const OPENROUTER_MODELS_USER_URL = 'https://openrouter.ai/api/v1/models/user'
const OPENROUTER_MODELS_PUBLIC_URL = 'https://openrouter.ai/api/v1/models'

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

/** Per-key cache so switching browser keys does not reuse another key's model list. */
const cacheByApiKey = new Map<string, CacheEntry>()

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

function parseModelsDataArray(json: unknown): OpenRouterUserModelRow[] {
  if (!json || typeof json !== 'object' || !('data' in json)) {
    throw new Error('OpenRouter models: invalid response shape')
  }
  const data = (json as { data: unknown }).data
  if (!Array.isArray(data)) {
    throw new Error('OpenRouter models: expected data array')
  }
  const rows: OpenRouterUserModelRow[] = []
  for (const item of data) {
    const row = parseUserModelRow(item)
    if (row) rows.push(row)
  }
  return rows
}

/**
 * Unauthenticated catalog — used when `/models/user` fails (e.g. invalid key) so the
 * UI can still list free models. Chat requests still require a valid API key.
 */
async function fetchPublicFreeTextModelOptions(): Promise<ChatModelOption[]> {
  return startSpan(
    { name: 'OpenRouter GET /api/v1/models (public fallback)', op: 'http.client' },
    async () => {
      const res = await fetch(OPENROUTER_MODELS_PUBLIC_URL, {
        headers: { Accept: 'application/json' },
      })
      const json: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        const detail = formatOpenRouterErrorBody(json, res.statusText)
        throw new Error(
          `OpenRouter public models failed (${res.status}): ${detail}`,
        )
      }
      const rows = parseModelsDataArray(json)
      return ensureFreeModelsRouterInOptions(toFreeTextChatOptions(rows))
    },
  )
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
        try {
          const publicOpts = await fetchPublicFreeTextModelOptions()
          if (publicOpts.length > 0) {
            return publicOpts
          }
        } catch {
          /* fall through to key-specific error */
        }
        const hint401 =
          res.status === 401
            ? ' Invalid or expired API key — update it in the app (see https://openrouter.ai/keys).'
            : ''
        throw new Error(
          `OpenRouter models/user failed (${res.status}): ${detail}.${hint401}`,
        )
      }

      const rows = parseModelsDataArray(json)
      return ensureFreeModelsRouterInOptions(toFreeTextChatOptions(rows))
    },
  )

  const ids = new Set(options.map((o) => o.id))
  const entry: CacheEntry = {
    options,
    ids,
    expires: Date.now() + CACHE_TTL_MS,
  }
  return entry
}

/** Returns free text-chat models for the user key; reuses in-memory cache for ~5 minutes. */
export async function getFreeTextChatModelOptionsCached(
  apiKey: string,
): Promise<ChatModelOption[]> {
  const hit = cacheByApiKey.get(apiKey)
  if (hit && Date.now() < hit.expires) {
    return hit.options
  }
  const next = await refreshCache(apiKey)
  cacheByApiKey.set(apiKey, next)
  return next.options
}

export type ResolveModelResult =
  | { ok: true; model: string }
  | { ok: false; error: string; status: number }

/**
 * Resolves the model for chat requests: explicit ids must be allowlisted;
 * when omitted, uses DEFAULT_CHAT_MODEL or the first free model if needed.
 */
function looksLikeOpenRouterModelId(id: string): boolean {
  return id.includes('/') && id.length > 2 && !id.includes(' ')
}

export async function resolveAllowedChatModel(
  apiKey: string,
  explicitModel: string | undefined,
): Promise<ResolveModelResult> {
  let options: ChatModelOption[]
  try {
    options = await getFreeTextChatModelOptionsCached(apiKey)
  } catch {
    const explicit =
      typeof explicitModel === 'string' ? explicitModel.trim() : ''
    if (
      explicit === DEFAULT_CHAT_MODEL ||
      explicit === FREE_MODELS_ROUTER_ID
    ) {
      return { ok: true, model: DEFAULT_CHAT_MODEL }
    }
    if (explicit.length > 0 && looksLikeOpenRouterModelId(explicit)) {
      return { ok: true, model: explicit }
    }
    return {
      ok: false,
      error:
        'Could not load the model list (check API key and network). Pick Free Models Router or enter a valid model id.',
      status: 503,
    }
  }
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
