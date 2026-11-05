export const MAX_FOLLOW_UPS = 3
const MAX_CONTEXT_CHARS = 2000
const MAX_FOLLOW_UP_CHARS = 140

export const FOLLOW_UP_SYSTEM_PROMPT =
  'You suggest follow-up questions. Reply ONLY with a JSON array of exactly 3 short questions (each under 80 characters) the user might ask next. No other text.'

/** Messages for the single small follow-up request. */
export function buildFollowUpMessages(
  userText: string,
  assistantText: string,
): Array<{ role: 'user'; content: string }> {
  const clip = (s: string) =>
    s.length > MAX_CONTEXT_CHARS ? s.slice(0, MAX_CONTEXT_CHARS) + '…' : s
  return [
    {
      role: 'user',
      content: `User asked:\n${clip(userText.trim())}\n\nAssistant answered:\n${clip(assistantText.trim())}\n\nSuggest 3 follow-up questions as a JSON array of strings.`,
    },
  ]
}

function clean(line: string): string {
  return line
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
    .replace(/^["'`]+|["'`,]+$/g, '')
    .trim()
}

/** Tolerant parse: JSON array (optionally fenced / embedded) or a line list. */
export function parseFollowUps(raw: string): string[] {
  const text = raw.trim()
  if (!text) return []
  let items: string[] | null = null
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(text.slice(start, end + 1))
      if (Array.isArray(parsed)) {
        items = parsed.filter((x): x is string => typeof x === 'string')
      }
    } catch {
      /* fall through to line list */
    }
  }
  items ??= text
    .split('\n')
    .filter((l) => !/^\s*(```|\[|\])/.test(l))
    .map((l) => l)
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const q = clean(item)
    if (!q || q.length > MAX_FOLLOW_UP_CHARS) continue
    const key = q.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(q)
    if (out.length === MAX_FOLLOW_UPS) break
  }
  return out
}
