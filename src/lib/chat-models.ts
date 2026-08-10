/** OpenRouter Free Models Router — picks a capable free model per request. */
export const FREE_MODELS_ROUTER_ID = 'openrouter/free'

/** Fallback when the free-model list cannot be loaded. */
export const FALLBACK_DEFAULT_MODEL = FREE_MODELS_ROUTER_ID

export const DEFAULT_CHAT_MODEL: string = FALLBACK_DEFAULT_MODEL

export interface OpenRouterModelArchitecture {
  input_modalities?: string[]
  output_modalities?: string[]
}

/** OpenRouter `pricing` object; values are compared as a set (all must match one free scalar). */
export type OpenRouterModelPricing = Record<string, unknown>

export interface OpenRouterUserModelRow {
  id: string
  name: string
  pricing: OpenRouterModelPricing
  architecture: OpenRouterModelArchitecture
}

export interface ChatModelOption {
  id: string
  name: string
  /** From OpenRouter `architecture.input_modalities`; controls upload UI. */
  inputModalities?: string[]
}

function coercePricingScalar(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (Array.isArray(v)) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * Free when every scalar field in `pricing` parses to the same number and that number is `0`.
 * Values are normalized so `0` and `"0"` (and duplicate keys) don’t split the Set.
 */
export function isFreePricing(pricing: OpenRouterModelPricing): boolean {
  const nums: number[] = []
  for (const v of Object.values(pricing)) {
    const n = coercePricingScalar(v)
    if (n === null) return false
    nums.push(n)
  }
  if (nums.length === 0) return false
  const tier = new Set(nums)
  if (tier.size !== 1) return false
  return [...tier][0] === 0
}

/** Text chat: include text in/out when listed; if modalities are omitted, don’t drop the model. */
export function isTextChatModel(
  architecture: OpenRouterModelArchitecture,
): boolean {
  const inputs = architecture.input_modalities
  const outputs = architecture.output_modalities
  const inOk = !inputs?.length || inputs.includes('text')
  const outOk = !outputs?.length || outputs.includes('text')
  return inOk && outOk
}

export function isFreeTextChatModel(model: OpenRouterUserModelRow): boolean {
  return isFreePricing(model.pricing) && isTextChatModel(model.architecture)
}

export function toFreeTextChatOptions(
  models: OpenRouterUserModelRow[],
): ChatModelOption[] {
  const filtered = models.filter(isFreeTextChatModel)
  const options: ChatModelOption[] = filtered.map((m) => ({
    id: m.id,
    name: m.name,
    inputModalities: m.architecture.input_modalities,
  }))
  options.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
  return options
}

/** Puts Free Models Router first; adds it if the user-models API omits it. */
export function ensureFreeModelsRouterInOptions(
  options: ChatModelOption[],
): ChatModelOption[] {
  const fromApi = options.find((o) => o.id === FREE_MODELS_ROUTER_ID)
  const rest = options.filter((o) => o.id !== FREE_MODELS_ROUTER_ID)
  return [
    fromApi ?? {
      id: FREE_MODELS_ROUTER_ID,
      name: 'Free Models Router',
      inputModalities: ['text'],
    },
    ...rest,
  ]
}

export function modelSupportsImageInput(
  inputModalities: string[] | undefined,
): boolean {
  // Undefined = metadata missing (e.g. synthetic `<select>` option). Allow UI;
  // OpenRouter still enforces what the model accepts.
  if (inputModalities === undefined) return true
  return inputModalities.includes('image')
}

export function modelSupportsDocumentInput(
  inputModalities: string[] | undefined,
): boolean {
  if (inputModalities === undefined) return true
  return inputModalities.includes('document')
}
