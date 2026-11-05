export type Snippet = { id: string; trigger: string; text: string }

export const SNIPPETS_KEY = 'solid-free-chat-snippets'
export const MAX_SNIPPETS = 50
const TRIGGER_RE = /^[;:!][A-Za-z0-9_-]{1,19}$/

export const BUILT_IN_SNIPPETS: ReadonlyArray<Omit<Snippet, 'id'>> = [
  { trigger: ';sig', text: 'Best regards,\n' },
  { trigger: ';today', text: 'Today is {{date}} and it is {{time}}.' },
  { trigger: ';quote', text: '> {{clipboard}}\n\n' },
]

export function isValidTrigger(trigger: string): boolean {
  return TRIGGER_RE.test(trigger)
}

export function parseSnippets(raw: unknown): Snippet[] {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: Snippet[] = []
  for (const v of value as unknown[]) {
    if (!v || typeof v !== 'object') continue
    const { id, trigger, text } = v as Record<string, unknown>
    if (typeof trigger !== 'string' || typeof text !== 'string') continue
    if (!isValidTrigger(trigger) || !text) continue
    const key = trigger.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: typeof id === 'string' && id ? id : `s-${out.length}-${key}`,
      trigger,
      text,
    })
    if (out.length >= MAX_SNIPPETS) break
  }
  return out
}

export function loadSnippets(): Snippet[] {
  try {
    return parseSnippets(localStorage.getItem(SNIPPETS_KEY))
  } catch {
    return []
  }
}

export function saveSnippets(snippets: Snippet[]) {
  try {
    localStorage.setItem(SNIPPETS_KEY, JSON.stringify(snippets))
  } catch {
    /* ignore quota / private mode */
  }
}

export type AddSnippetResult =
  { ok: true; snippets: Snippet[] } | { ok: false; error: string }

export function addSnippet(
  snippets: Snippet[],
  trigger: string,
  text: string,
): AddSnippetResult {
  const t = trigger.trim()
  if (!isValidTrigger(t)) {
    return {
      ok: false,
      error:
        'Trigger must start with ; : or ! followed by 1-19 letters, digits, - or _.',
    }
  }
  if (!text.trim()) return { ok: false, error: 'Expansion text is required.' }
  if (snippets.some((s) => s.trigger.toLowerCase() === t.toLowerCase())) {
    return { ok: false, error: `${t} already exists.` }
  }
  if (snippets.length >= MAX_SNIPPETS) {
    return { ok: false, error: 'Too many snippets.' }
  }
  const id = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  return { ok: true, snippets: [...snippets, { id, trigger: t, text }] }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Replaces {{date}} (YYYY-MM-DD), {{time}} (HH:MM) and {{clipboard}}. */
export function expandPlaceholders(
  text: string,
  ctx: { now: Date; clipboard?: string },
): string {
  const { now } = ctx
  return text
    .replace(
      /\{\{date\}\}/g,
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    )
    .replace(/\{\{time\}\}/g, `${pad(now.getHours())}:${pad(now.getMinutes())}`)
    .replace(/\{\{clipboard\}\}/g, () => ctx.clipboard ?? '')
}

export function usesClipboard(text: string): boolean {
  return text.includes('{{clipboard}}')
}

export type TriggerHit = {
  snippet: Snippet
  /** Index of the first char of the trigger word. */
  start: number
  /** Index just after the trigger word. */
  end: number
}

/**
 * The snippet whose trigger is the whole word ending at `caret` (word
 * boundary on the left: start of text or whitespace). Case-insensitive.
 */
export function findTriggerBeforeCaret(
  value: string,
  caret: number,
  snippets: ReadonlyArray<Snippet>,
): TriggerHit | null {
  if (snippets.length === 0) return null
  let start = caret
  while (start > 0 && !/\s/.test(value[start - 1])) start--
  const word = value.slice(start, caret).toLowerCase()
  if (!word) return null
  const snippet = snippets.find((s) => s.trigger.toLowerCase() === word)
  return snippet ? { snippet, start, end: caret } : null
}

/**
 * Trigger just typed before a space/newline at `caret - 1`: the char before
 * the caret must be whitespace and the word before it a trigger.
 */
export function findTriggerBeforeSeparator(
  value: string,
  caret: number,
  snippets: ReadonlyArray<Snippet>,
): TriggerHit | null {
  if (caret < 2 || !/[ \n]/.test(value[caret - 1])) return null
  return findTriggerBeforeCaret(value, caret - 1, snippets)
}

/** Splices `expansion` over the hit; keeps whatever follows `keepFrom`. */
export function applyExpansion(
  value: string,
  hit: TriggerHit,
  expansion: string,
  keepFrom = hit.end,
): { value: string; caret: number } {
  const head = value.slice(0, hit.start) + expansion
  return { value: head + value.slice(keepFrom), caret: head.length }
}
