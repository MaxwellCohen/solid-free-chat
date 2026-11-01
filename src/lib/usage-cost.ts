/** USD per token, from OpenRouter `pricing` (string values per token). */
export interface ModelPricing {
  prompt: number
  completion: number
}

export const COST_THRESHOLD_STORAGE_KEY = 'solid-free-chat:cost-threshold'

function toNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function parseModelPricing(pricing: unknown): ModelPricing | undefined {
  if (!pricing || typeof pricing !== 'object') return undefined
  const o = pricing as Record<string, unknown>
  const prompt = toNumber(o.prompt)
  const completion = toNumber(o.completion)
  if (prompt === null || completion === null) return undefined
  return { prompt, completion }
}

/** Provider-reported cost wins; otherwise compute from pricing; undefined when unknown. */
export function computeUsageCost(
  usage: { promptTokens: number; completionTokens: number; cost?: number },
  pricing?: ModelPricing,
): number | undefined {
  const reported = toNumber(usage.cost)
  if (reported !== null) return reported
  if (!pricing) return undefined
  return usage.promptTokens * pricing.prompt + usage.completionTokens * pricing.completion
}

export function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '$0'
  if (usd < 0.0001) return '<$0.0001'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

/** Sum of known per-message costs (messages without a cost are skipped). */
export function totalCost(
  items: ReadonlyArray<{ tokenUsage?: { cost?: number } }>,
): number {
  let sum = 0
  for (const item of items) {
    const c = item.tokenUsage?.cost
    if (typeof c === 'number' && Number.isFinite(c)) sum += c
  }
  return sum
}

/** Parses user input; empty/invalid/non-positive means "no threshold". */
export function parseCostThreshold(raw: string | null | undefined): number | null {
  if (!raw) return null
  const n = parseFloat(raw.replace(/^\$/, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function isOverThreshold(total: number, threshold: number | null): boolean {
  return threshold !== null && total >= threshold
}

export function loadCostThreshold(): number | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return parseCostThreshold(localStorage.getItem(COST_THRESHOLD_STORAGE_KEY))
  } catch {
    return null
  }
}

export function saveCostThreshold(value: number | null) {
  if (typeof localStorage === 'undefined') return
  try {
    if (value === null) localStorage.removeItem(COST_THRESHOLD_STORAGE_KEY)
    else localStorage.setItem(COST_THRESHOLD_STORAGE_KEY, String(value))
  } catch {
    /* ignore quota/privacy-mode errors */
  }
}
