import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHAT_STORAGE_KEY,
  LEGACY_CHAT_STORAGE_KEY,
  loadChatState,
  persistChatStateNow,
} from './chat-persistence'
import { chatActions, chatStore } from '../store/chat.store'

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  }
}

describe('chat persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('returns null when nothing is stored', () => {
    expect(loadChatState()).toBeNull()
  })

  it('skips malformed entries and falls back to the legacy key', () => {
    localStorage.setItem(CHAT_STORAGE_KEY, '{not json')
    localStorage.setItem(
      LEGACY_CHAT_STORAGE_KEY,
      JSON.stringify({ conversations: [], selectedModel: 'm/legacy' }),
    )
    const state = loadChatState()
    expect(state?.selectedModel).toBe('m/legacy')
    expect(state?.conversationOrder).toEqual([])
  })

  it('returns null for unrecognised shapes', () => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ foo: 1 }))
    expect(loadChatState()).toBeNull()
  })

  it('round-trips the store through persist and load', () => {
    chatActions.resetToEmpty()
    chatActions.ensureDefaultConversation()
    persistChatStateNow()
    const raw = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY)!)
    expect(Object.keys(raw).sort()).toEqual(
      [
        'conversationOrder',
        'conversationsById',
        'currentConversationId',
        'enabledToolIds',
        'messagesByConversationId',
        'projects',
        'selectedModel',
        'skills',
      ].sort(),
    )
    const loaded = loadChatState()
    expect(loaded?.conversationOrder).toEqual(chatStore.state.conversationOrder)
  })
})
