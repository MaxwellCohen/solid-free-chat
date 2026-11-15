import { messageText } from './harness/chat-history'
import type { HistoryConversation } from './harness/chat-history'

export interface ConversationSearchResult {
  id: string
  title: string
  /** Message holding the snippet match, when there is one. */
  messageId?: string
  /** Excerpt split around the first match; absent when only the title matched. */
  snippet?: { before: string; match: string; after: string }
}

const SNIPPET_RADIUS = 40

function excerpt(text: string, at: number, length: number) {
  const start = Math.max(0, at - SNIPPET_RADIUS)
  const end = Math.min(text.length, at + length + SNIPPET_RADIUS)
  return {
    before: `${start > 0 ? '…' : ''}${text.slice(start, at)}`,
    match: text.slice(at, at + length),
    after: `${text.slice(at + length, end)}${end < text.length ? '…' : ''}`,
  }
}

/**
 * Case-insensitive substring search over titles and message text, newest chats first.
 * A blank query returns no results.
 */
export function searchSidebarConversations(
  conversations: readonly HistoryConversation[],
  query: string,
): ConversationSearchResult[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const results: ConversationSearchResult[] = []
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
  for (const conversation of sorted) {
    const titleMatch = conversation.title.toLowerCase().includes(needle)
    let snippet: ConversationSearchResult['snippet']
    let messageId: string | undefined
    for (const message of conversation.messages) {
      // Collapse whitespace so snippets stay on one line.
      const text = messageText(message).replace(/\s+/g, ' ')
      const at = text.toLowerCase().indexOf(needle)
      if (at !== -1) {
        snippet = excerpt(text, at, needle.length)
        messageId = message.id
        break
      }
    }
    if (titleMatch || snippet) {
      results.push({
        id: conversation.id,
        title: conversation.title,
        snippet,
        messageId,
      })
    }
  }
  return results
}
