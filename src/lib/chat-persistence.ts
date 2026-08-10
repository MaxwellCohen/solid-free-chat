import type { ChatAppState } from '../store/chat.store'
import { chatStore, normalizeChatAppState } from '../store/chat.store'

export const CHAT_STORAGE_KEY = 'solid-free-chat:v2'
export const LEGACY_CHAT_STORAGE_KEY = 'solid-free-chat:v1'

const DEBOUNCE_MS = 280

let saveTimer: ReturnType<typeof setTimeout> | null = null

function serialize(state: ChatAppState): string {
  return JSON.stringify(toPersistedChatState(state), (_, v) =>
    v instanceof Date ? v.toISOString() : v,
  )
}

function toPersistedChatState(state: ChatAppState): ChatAppState {
  return {
    conversationOrder: state.conversationOrder,
    conversationsById: state.conversationsById,
    messagesByConversationId: state.messagesByConversationId,
    currentConversationId: state.currentConversationId,
    selectedModel: state.selectedModel,
    skills: state.skills,
  }
}

export function loadChatState(): ChatAppState | null {
  if (typeof localStorage === 'undefined') return null
  const candidates = [
    localStorage.getItem(CHAT_STORAGE_KEY),
    localStorage.getItem(LEGACY_CHAT_STORAGE_KEY),
  ]
  for (const raw of candidates) {
    if (!raw) continue
    try {
      const parsed: unknown = JSON.parse(raw)
      const normalized = normalizeChatAppState(parsed)
      if (normalized) return normalized
    } catch {
      /* ignore malformed entry and try fallback */
    }
  }
  return null
}

export function persistChatStateNow() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, serialize(chatStore.state))
  } catch (e) {
    console.warn('chat persistence failed', e)
  }
}

/** Subscribe and debounce-save; returns unsubscribe. Client-only. */
export function startChatPersistence(): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }
  const sub = chatStore.subscribe(() => {
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      persistChatStateNow()
      saveTimer = null
    }, DEBOUNCE_MS)
  })
  return () => {
    sub.unsubscribe()
    if (saveTimer !== null) clearTimeout(saveTimer)
    persistChatStateNow()
  }
}
