import type { ProviderId } from './providers'

/** One chat model on a provider's free tier, with metadata from models.dev. */
export type CatalogModel = {
  id: string
  name: string
  inputModalities: string[]
  supportsTools: boolean
  contextWindow?: number
}

export type FreeModelsCatalog = Partial<Record<ProviderId, CatalogModel[]>>

export const MODELS_DEV_URL = 'https://models.dev/api.json'

/**
 * models.dev provider ids for providers whose plans include a free tier, where
 * "free" means usable without payment (rate limited), not zero per-token price.
 * OpenRouter is excluded: its own `/models` already carries per-model pricing.
 */
const MODELS_DEV_PROVIDERS: Partial<Record<ProviderId, string>> = {
  groq: 'groq',
  cerebras: 'cerebras',
  mistral: 'mistral',
  huggingface: 'huggingface',
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((x): x is string => typeof x === 'string')
    : []
}

/** Reduces the (multi-MB) models.dev dump to text-in/text-out chat models. */
export function buildFreeModelsCatalog(raw: unknown): FreeModelsCatalog {
  const catalog: FreeModelsCatalog = {}
  if (!raw || typeof raw !== 'object') return catalog
  const providers = raw as Record<string, { models?: Record<string, unknown> }>

  for (const [providerId, devId] of Object.entries(MODELS_DEV_PROVIDERS)) {
    const models = providers[devId!]?.models
    if (!models || typeof models !== 'object') continue
    const out: CatalogModel[] = []
    for (const [key, value] of Object.entries(models)) {
      if (!value || typeof value !== 'object') continue
      const m = value as Record<string, unknown>
      const modalities = (m.modalities ?? {}) as Record<string, unknown>
      const input = strings(modalities.input)
      const output = strings(modalities.output)
      if (!input.includes('text') || !output.includes('text')) continue
      const limit = (m.limit ?? {}) as Record<string, unknown>
      out.push({
        id: typeof m.id === 'string' ? m.id : key,
        name: typeof m.name === 'string' ? m.name : key,
        inputModalities: input,
        supportsTools: m.tool_call === true,
        ...(typeof limit.context === 'number'
          ? { contextWindow: limit.context }
          : {}),
      })
    }
    out.sort((a, b) => a.id.localeCompare(b.id))
    catalog[providerId as ProviderId] = out
  }
  return catalog
}
