export interface ChatSettings {
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
}

export const MIN_TEMPERATURE = 0
export const MAX_TEMPERATURE = 2
export const MAX_MAX_TOKENS = 1_000_000

export function clampTemperature(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const clamped = Math.min(MAX_TEMPERATURE, Math.max(MIN_TEMPERATURE, value))
  return Math.round(clamped * 100) / 100
}

export function clampMaxTokens(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const n = Math.floor(value)
  if (n < 1) return undefined
  return Math.min(MAX_MAX_TOKENS, n)
}

/** Returns undefined when every field is default. */
export function normalizeChatSettings(raw: unknown): ChatSettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const systemPrompt =
    typeof o.systemPrompt === 'string' && o.systemPrompt.trim()
      ? o.systemPrompt.trim()
      : undefined
  const temperature = clampTemperature(o.temperature)
  const maxTokens = clampMaxTokens(o.maxTokens)
  if (
    systemPrompt === undefined &&
    temperature === undefined &&
    maxTokens === undefined
  ) {
    return undefined
  }
  return {
    ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
  }
}

/** Merge a patch (a key set to undefined clears it) and normalize. */
export function mergeChatSettings(
  current: ChatSettings | undefined,
  patch: Partial<Record<keyof ChatSettings, unknown>>,
): ChatSettings | undefined {
  return normalizeChatSettings({ ...current, ...patch })
}
