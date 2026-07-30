import { useSelector } from '@tanstack/solid-store'
import type { ChatAppState } from './chat.store'
import { chatStore, chatActions, chatSelectors } from './chat.store'

export type {
  ChatAppState,
  ChatConversation,
  ChatConversationWithMessages,
  SavedSystemPrompt,
  TokenUsageSnapshot,
} from './chat.store'

type EqualityFn<T> = (objA: T, objB: T) => boolean

export function useChatStore<TSelected = ChatAppState>(
  selector: (state: ChatAppState) => TSelected = (state) =>
    state as unknown as TSelected,
  options?: { equal?: EqualityFn<TSelected> },
) {
  return useSelector(chatStore, selector, {
    compare: options?.equal,
  })
}

export function useChatActions() {
  return chatActions
}

export function useChatSelectors() {
  return chatSelectors
}
