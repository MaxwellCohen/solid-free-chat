import type { ChatModelOption } from './chat-models'
import { getFreeTextChatModelOptionsCached } from './openrouter-models'
import { loadStoredApiKey } from './openrouter-key-storage'
import { getProviderModelOptionsCached } from './provider-models'
import { PROVIDERS } from './providers'

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
  return { options: lists.flat() }
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
