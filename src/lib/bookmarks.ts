import type { ChatAppState, ChatUIMessage } from '../store/chat.store'
import { lookup } from './nullable'
import { messageToPlainText } from '../components/chat/chat-thread-utils'

export interface SavedMessage {
  conversationId: string
  conversationTitle: string
  messageId: string
  role: 'user' | 'assistant' | 'system'
  text: string
  message: ChatUIMessage
}

/** All bookmarked messages, in sidebar chat order then message order. */
export function collectBookmarks(
  state: Pick<
    ChatAppState,
    'conversationOrder' | 'conversationsById' | 'messagesByConversationId'
  >,
): SavedMessage[] {
  const out: SavedMessage[] = []
  for (const conversationId of state.conversationOrder) {
    const conversation = lookup(state.conversationsById, conversationId)
    if (!conversation) continue
    const messages = lookup(state.messagesByConversationId, conversationId)
    for (const message of messages ?? []) {
      if (!message.bookmarked) continue
      out.push({
        conversationId,
        conversationTitle: conversation.title,
        messageId: message.id,
        role: message.role,
        text: messageToPlainText(message),
        message,
      })
    }
  }
  return out
}

/** One-line preview of a message body. */
export function snippet(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}
