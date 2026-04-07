import type { ChatAppState } from '../store/chat.store'
import { chatStore } from '../store/chat.store'

export const CHAT_STORAGE_KEY = 'solid-free-chat:v1'

const DEBOUNCE_MS = 280

let saveTimer: ReturnType<typeof setTimeout> | null = null

function serialize(state: ChatAppState): string {
  return JSON.stringify(state, (_, v) =>
    v instanceof Date ? v.toISOString() : v,
  )
}

export function loadChatState(): ChatAppState | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(CHAT_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    if (!Array.isArray((parsed as { conversations?: unknown }).conversations)) {
      return null
    }
    return reviveChatState(parsed as ChatAppState)
  } catch {
    return null
  }
}

function reviveChatState(state: ChatAppState): ChatAppState {
  return {
    ...state,
    conversations: state.conversations.map((c) => ({
      ...c,
      messages: (Array.isArray(c.messages) ? c.messages : []).map((m) => ({
        ...m,
        createdAt:
          m.createdAt != null
            ? new Date(m.createdAt as unknown as string | number)
            : undefined,
      })),
    })),
  }
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
