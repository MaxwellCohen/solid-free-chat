import type { UIMessage } from '@tanstack/ai-client'

/** One saved chat as seen by the history tools. */
export interface HistoryConversation {
  id: string
  title: string
  updatedAt: number
  messages: readonly UIMessage[]
}

export interface ChatSearchHit {
  chat_id: string
  title: string
  updated_at: string
  /** Short excerpts around the matched terms, newest-first within the chat. */
  snippets: { role: UIMessage['role']; text: string }[]
}

const SNIPPET_RADIUS = 120
const MAX_SNIPPETS_PER_CHAT = 3

/** Plain text of a message (text parts only; tool calls, files, and reasoning are skipped). */
export function messageText(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === 'text' ? part.content : ''))
    .filter(Boolean)
    .join('\n')
}

function searchTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))]
}

function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - SNIPPET_RADIUS)
  const end = Math.min(text.length, index + length + SNIPPET_RADIUS)
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`
}

/**
 * Keyword search across chats. A chat matches when every term appears in its
 * title or messages (case-insensitive). Ranked by term hits, then recency.
 * An empty query lists the most recently updated chats.
 */
export function searchConversations(
  conversations: readonly HistoryConversation[],
  query: string,
  limit: number,
): ChatSearchHit[] {
  const terms = searchTerms(query)
  const toHit = (
    conversation: HistoryConversation,
    snippets: ChatSearchHit['snippets'],
  ) => ({
    chat_id: conversation.id,
    title: conversation.title,
    updated_at: new Date(conversation.updatedAt).toISOString(),
    snippets,
  })
  const byRecency = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)

  if (terms.length === 0) {
    return byRecency
      .slice(0, limit)
      .map((conversation) => toHit(conversation, []))
  }

  const scored: { hit: ChatSearchHit; score: number; updatedAt: number }[] = []
  for (const conversation of byRecency) {
    const title = conversation.title.toLowerCase()
    const texts = conversation.messages.map((message) => ({
      role: message.role,
      text: messageText(message),
    }))
    const lowered = texts.map((entry) => entry.text.toLowerCase())
    const found = terms.every(
      (term) =>
        title.includes(term) || lowered.some((text) => text.includes(term)),
    )
    if (!found) continue

    let score = 0
    const snippets: ChatSearchHit['snippets'] = []
    for (let i = texts.length - 1; i >= 0; i--) {
      const text = lowered[i]
      let first = -1
      let firstTerm = ''
      for (const term of terms) {
        let at = text.indexOf(term)
        if (at !== -1 && (first === -1 || at < first)) {
          first = at
          firstTerm = term
        }
        while (at !== -1) {
          score++
          at = text.indexOf(term, at + term.length)
        }
      }
      if (first !== -1 && snippets.length < MAX_SNIPPETS_PER_CHAT) {
        snippets.push({
          role: texts[i].role,
          text: snippetAround(texts[i].text, first, firstTerm.length),
        })
      }
    }
    score += terms.filter((term) => title.includes(term)).length * 5
    scored.push({
      hit: toHit(conversation, snippets),
      score,
      updatedAt: conversation.updatedAt,
    })
  }

  return scored
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map((entry) => entry.hit)
}

/** Transcript of one chat as `role: text` blocks, keeping the newest messages within `maxChars`. */
export function conversationTranscript(
  conversation: HistoryConversation,
  maxChars: number,
): { transcript: string; omitted_messages: number } {
  const blocks = conversation.messages
    .map((message) => ({
      role: message.role,
      text: messageText(message).trim(),
    }))
    .filter((entry) => entry.text)
    .map((entry) => `${entry.role}: ${entry.text}`)

  const kept: string[] = []
  let used = 0
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]
    if (used + block.length > maxChars) {
      if (kept.length === 0)
        kept.push(`…${block.slice(block.length - maxChars)}`)
      break
    }
    kept.unshift(block)
    used += block.length + 2
  }
  return {
    transcript: kept.join('\n\n'),
    omitted_messages: blocks.length - kept.length,
  }
}
