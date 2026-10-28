import type { ChatModelOption, OpenRouterUserModelRow } from './chat-models'
import {
  ensureFreeModelsRouterInOptions,
  toFreeTextChatOptions,
} from './chat-models'
import { openRouterApiUrl } from './openrouter-api'

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
  expires: number
}

/** Per-key cache so switching keys does not reuse another key's model list. */
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
  const supported_parameters = Array.isArray(o.supported_parameters)
    ? o.supported_parameters.filter((x): x is string => typeof x === 'string')
    : undefined
  return {
    id: o.id,
    name: o.name,
    pricing: pricing as Record<string, unknown>,
    architecture: { input_modalities, output_modalities },
    supported_parameters,
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
  const res = await fetch(openRouterApiUrl('/models'), {
    headers: { Accept: 'application/json' },
  })
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = formatOpenRouterErrorBody(json, res.statusText)
    throw new Error(`OpenRouter public models failed (${res.status}): ${detail}`)
  }
  const rows = parseModelsDataArray(json)
  return ensureFreeModelsRouterInOptions(toFreeTextChatOptions(rows))
}

async function fetchFreeTextModelOptions(
  apiKey: string,
): Promise<ChatModelOption[]> {
  if (!apiKey) return fetchPublicFreeTextModelOptions()
  const res = await fetch(openRouterApiUrl('/models/user'), {
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
}

/** Returns free text-chat models for the user key; reuses an in-memory cache for ~5 minutes. */
export async function getFreeTextChatModelOptionsCached(
  apiKey: string,
): Promise<ChatModelOption[]> {
  const hit = cacheByApiKey.get(apiKey)
  if (hit && Date.now() < hit.expires) {
    return hit.options
  }
  const options = await fetchFreeTextModelOptions(apiKey)
  cacheByApiKey.set(apiKey, { options, expires: Date.now() + CACHE_TTL_MS })
  return options
}
