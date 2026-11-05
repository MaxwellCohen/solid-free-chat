export const AUTO_TITLE_STORAGE_KEY = 'solid-free-chat-smart-titles'
const MAX_CONTEXT_CHARS = 600
const MAX_TITLE_WORDS = 6
const MAX_TITLE_CHARS = 52

export const AUTO_TITLE_SYSTEM_PROMPT =
  'You write chat titles. Reply with ONLY a title of 3 to 6 words for the conversation. No quotes, no trailing punctuation, no other text.'

/** Messages for the single small title request. */
export function buildAutoTitleMessages(
  userText: string,
  assistantText: string,
): Array<{ role: 'user'; content: string }> {
  const clip = (s: string) =>
    s.length > MAX_CONTEXT_CHARS ? s.slice(0, MAX_CONTEXT_CHARS) + '…' : s
  return [
    {
      role: 'user',
      content: `User asked:\n${clip(userText.trim())}\n\nAssistant answered:\n${clip(assistantText.trim())}\n\nWrite a 3-6 word title.`,
    },
  ]
}

/** Cleans a model reply into a short title; null when unusable. */
export function parseAutoTitle(raw: string): string | null {
  const line = raw
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('```'))
  if (!line) return null
  const words = line
    .replace(/^(?:title|chat title)\s*:\s*/i, '')
    .replace(/^["'`*#\s]+|["'`*.!?:;,\s]+$/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TITLE_WORDS)
  let title = words.join(' ')
  if (title.length > MAX_TITLE_CHARS) {
    title = title.slice(0, MAX_TITLE_CHARS - 1).trimEnd() + '…'
  }
  return title || null
}

/** Local fallback: the first few words of the user's message. */
export function localTitle(userText: string): string | null {
  const words = userText
    .replace(/[`*_#>[\]()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TITLE_WORDS)
  if (words.length === 0) return null
  let title = words.join(' ')
  if (title.length > MAX_TITLE_CHARS) {
    title = title.slice(0, MAX_TITLE_CHARS - 1).trimEnd() + '…'
  }
  return title.charAt(0).toUpperCase() + title.slice(1)
}

/** Only after the first exchange (one user + one assistant message) of an unlocked chat. */
export function shouldGenerateTitle(input: {
  enabled: boolean
  titleLocked: boolean
  messageCount: number
}): boolean {
  return input.enabled && !input.titleLocked && input.messageCount === 2
}

export function readSmartTitles(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(AUTO_TITLE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeSmartTitles(on: boolean): void {
  try {
    if (on) localStorage.setItem(AUTO_TITLE_STORAGE_KEY, '1')
    else localStorage.removeItem(AUTO_TITLE_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
