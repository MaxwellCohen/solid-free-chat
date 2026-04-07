import { useStore } from '@tanstack/solid-store'
import { chatStore, chatActions, chatSelectors } from './chat.store'

export type { ChatAppState, ChatConversation } from './chat.store'

export function useChatStore() {
  return useStore(chatStore)
}

export function useChatActions() {
  return chatActions
}

export function useChatSelectors() {
  return chatSelectors
}
