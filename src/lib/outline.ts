export type OutlineMessage = {
  id: string
  role: string
  parts: ReadonlyArray<{ type: string; content?: unknown }>
}

export type OutlineItem = {
  key: string
  messageId: string
  messageIndex: number
  kind: 'user' | 'heading'
  /** 0 for user messages, 1-3 for headings. */
  level: number
  text: string
}

const USER_MAX_CHARS = 60
const FENCE = /^ {0,3}(`{3,}|~{3,})/
const HEADING = /^ {0,3}(#{1,3})[ \t]+(.+?)[ \t]*#*[ \t]*$/

function stripInline(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** h1-h3 headings of a markdown string, ignoring fenced code blocks. */
export function parseHeadings(
  markdown: string,
): Array<{ level: number; text: string }> {
  const out: Array<{ level: number; text: string }> = []
  let fence: string | null = null
  for (const line of markdown.split('\n')) {
    const f = FENCE.exec(line)
    if (f) {
      const marker = f[1]
      if (fence === null) fence = marker
      else if (
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        line.trim() === marker
      ) {
        fence = null
      }
      continue
    }
    if (fence !== null) continue
    const h = HEADING.exec(line)
    if (!h) continue
    const text = stripInline(h[2])
    if (text) out.push({ level: h[1].length, text })
  }
  return out
}

export function truncateOutlineText(
  text: string,
  max = USER_MAX_CHARS,
): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

function textOf(message: OutlineMessage): string {
  return message.parts
    .filter((p) => p.type === 'text' && typeof p.content === 'string')
    .map((p) => p.content as string)
    .join('\n\n')
}

/** User messages (truncated) plus headings of assistant replies. */
export function buildOutline(
  messages: ReadonlyArray<OutlineMessage>,
): OutlineItem[] {
  const items: OutlineItem[] = []
  messages.forEach((m, messageIndex) => {
    if (m.role === 'user') {
      items.push({
        key: `${m.id}:u`,
        messageId: m.id,
        messageIndex,
        kind: 'user',
        level: 0,
        text: truncateOutlineText(textOf(m)) || '(attachment)',
      })
    } else if (m.role === 'assistant') {
      parseHeadings(textOf(m)).forEach((h, i) => {
        items.push({
          key: `${m.id}:h${i}`,
          messageId: m.id,
          messageIndex,
          kind: 'heading',
          level: h.level,
          text: truncateOutlineText(h.text),
        })
      })
    }
  })
  return items
}

/**
 * Message nearest the viewport top: the last one starting at or above `offset`,
 * else the first. `tops` are message tops relative to the viewport, in order.
 */
export function pickActiveMessage(
  tops: ReadonlyArray<{ id: string; top: number }>,
  offset = 24,
): string | null {
  if (tops.length === 0) return null
  let active = tops[0].id
  for (const t of tops) {
    if (t.top <= offset) active = t.id
    else break
  }
  return active
}

/** Key of the outline item to highlight for the active message index. */
export function activeOutlineKey(
  items: ReadonlyArray<OutlineItem>,
  activeMessageIndex: number | null,
): string | null {
  if (activeMessageIndex === null) return null
  let best: OutlineItem | null = null
  for (const item of items) {
    if (item.messageIndex > activeMessageIndex) break
    if (!best || item.messageIndex > best.messageIndex) best = item
  }
  return best?.key ?? items.at(0)?.key ?? null
}
