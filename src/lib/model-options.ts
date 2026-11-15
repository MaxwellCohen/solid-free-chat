import type { ChatModelOption } from './chat-models'
import { getFreeTextChatModelOptionsCached } from './openrouter-models'
import { loadStoredApiKey } from './openrouter-key-storage'
import { getProviderModelOptionsCached } from './provider-models'
import { PROVIDERS } from './providers'

/** Re-check interval; plus the 5-min list cache, data is never >15 min old. */
export const MODEL_REFRESH_MS = 10 * 60_000

const UNAVAILABLE_KEY = 'solid-free-chat-unavailable-models'
const UNAVAILABLE_TTL_MS = 24 * 60 * 60_000

function loadUnavailable(): Record<string, number> {
  try {
    const raw = localStorage.getItem(UNAVAILABLE_KEY)
    const v: unknown = raw ? JSON.parse(raw) : {}
    if (!v || typeof v !== 'object') return {}
    const now = Date.now()
    return Object.fromEntries(
      Object.entries(v).filter(
        (e): e is [string, number] => typeof e[1] === 'number' && e[1] > now,
      ),
    )
  } catch {
    return {}
  }
}

/** Hides a model that failed as unavailable from model lists for a day. */
export function markModelUnavailable(providerId: string, modelId: string) {
  const map = loadUnavailable()
  map[`${providerId}\n${modelId}`] = Date.now() + UNAVAILABLE_TTL_MS
  try {
    localStorage.setItem(UNAVAILABLE_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

/** Models from every provider with a saved key (OpenRouter is always included). */
export async function loadAllModelOptions(): Promise<{
  options: ChatModelOption[]
  error?: unknown
}> {
  const providers = PROVIDERS.filter(
    (p) => p.id === 'openrouter' || loadStoredApiKey(p.id).key.trim(),
  )
  const results = await Promise.allSettled(
    providers.map(async (p) => {
      const key = loadStoredApiKey(p.id).key.trim()
      const list =
        p.id === 'openrouter'
          ? await getFreeTextChatModelOptionsCached(key)
          : await getProviderModelOptionsCached(p, key)
      return list.map((m) => ({ ...m, providerId: p.id }))
    }),
  )
  const lists = results.flatMap((r) =>
    r.status === 'fulfilled' ? [r.value] : [],
  )
  if (lists.length === 0) {
    const failed = results.find((r) => r.status === 'rejected')
    return {
      options: [],
      error: failed?.status === 'rejected' ? failed.reason : undefined,
    }
  }
  const hidden = loadUnavailable()
  return {
    options: lists
      .flat()
      .filter((m) => !(`${m.providerId}\n${m.id}` in hidden)),
  }
}

const KEY = 'solid-free-chat-tool-model'

export type ModelSelection = { providerId: string; modelId: string }

export function loadToolModelSelection(): ModelSelection {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const v = JSON.parse(raw) as Partial<ModelSelection>
      if (typeof v.providerId === 'string' && typeof v.modelId === 'string')
        return v as ModelSelection
    }
  } catch {
    /* ignore */
  }
  return { providerId: 'openrouter', modelId: 'openrouter/free' }
}

export function storeToolModelSelection(v: ModelSelection) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}
