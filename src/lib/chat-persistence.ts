import type { ChatAppState } from '../store/chat.store'
import { chatStore, normalizeChatAppState } from '../store/chat.store'
import { idbAvailable, idbGet, idbSet } from './idb-kv'

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
    projects: state.projects,
    enabledToolIds: state.enabledToolIds,
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

const SYNC_CHANNEL = 'solid-free-chat:sync'

export type PersistenceStatus = 'ok' | 'storage-full' | 'failed'
const statusListeners = new Set<(s: PersistenceStatus) => void>()

export function onPersistenceStatus(fn: (s: PersistenceStatus) => void) {
  statusListeners.add(fn)
  return () => void statusListeners.delete(fn)
}

function emitStatus(s: PersistenceStatus) {
  for (const fn of statusListeners) fn(s)
}

function isQuotaError(e: unknown) {
  return (
    e instanceof DOMException &&
    (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  )
}

let channel: BroadcastChannel | null = null
/** Set while applying another tab's state so we don't echo it back. */
let applyingRemote = false

/** Prefers IndexedDB (migrating from localStorage); falls back to localStorage. */
export async function loadChatStateAsync(): Promise<ChatAppState | null> {
  if (idbAvailable()) {
    try {
      const raw = await idbGet(CHAT_STORAGE_KEY)
      if (raw) {
        const normalized = normalizeChatAppState(JSON.parse(raw))
        if (normalized) return normalized
      }
    } catch {
      /* fall through to localStorage */
    }
  }
  return loadChatState()
}

export async function persistChatStateAsync(): Promise<void> {
  const data = serialize(chatStore.state)
  if (idbAvailable()) {
    try {
      await idbSet(CHAT_STORAGE_KEY, data)
      emitStatus('ok')
      channel?.postMessage('saved')
      return
    } catch (e) {
      console.warn('indexedDB persistence failed', e)
    }
  }
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, data)
    emitStatus('ok')
    channel?.postMessage('saved')
  } catch (e) {
    emitStatus(isQuotaError(e) ? 'storage-full' : 'failed')
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

/** Subscribe and debounce-save; syncs with other tabs. Returns unsubscribe. Client-only. */
export function startChatPersistence(onRemoteChange?: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(SYNC_CHANNEL)
    channel.onmessage = () => {
      void loadChatStateAsync().then((remote) => {
        if (!remote) return
        applyingRemote = true
        try {
          chatStore.setState(() => remote)
          onRemoteChange?.()
        } finally {
          applyingRemote = false
        }
      })
    }
  }
  const sub = chatStore.subscribe(() => {
    if (applyingRemote) return
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void persistChatStateAsync()
      saveTimer = null
    }, DEBOUNCE_MS)
  })
  return () => {
    sub.unsubscribe()
    if (saveTimer !== null) clearTimeout(saveTimer)
    void persistChatStateAsync()
    channel?.close()
    channel = null
  }
}
