import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHAT_STORAGE_KEY,
  LEGACY_CHAT_STORAGE_KEY,
  loadChatState,
  mergeRemoteChatState,
  persistChatStateNow,
  startChatPersistence,
} from './chat-persistence'
import { chatActions, chatStore } from '../store/chat.store'

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    keys: () => [...m.keys()],
    get length() {
      return m.size
    },
    key: (i: number) => [...m.keys()][i] ?? null,
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

  it('backs up an unparseable v2 entry before falling back', () => {
    localStorage.setItem(CHAT_STORAGE_KEY, '{not json')
    expect(loadChatState()).toBeNull()
    const backup = (localStorage as unknown as ReturnType<typeof memoryStorage>)
      .keys()
      .find((k) => k.startsWith(`${CHAT_STORAGE_KEY}:corrupt-`))
    expect(backup).toBeDefined()
    expect(localStorage.getItem(backup!)).toBe('{not json')
  })

  it('backs up a v2 entry that fails normalization', () => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ foo: 1 }))
    loadChatState()
    const keys = (
      localStorage as unknown as ReturnType<typeof memoryStorage>
    ).keys()
    expect(keys.some((k) => k.startsWith(`${CHAT_STORAGE_KEY}:corrupt-`))).toBe(
      true,
    )
  })

  it('does not back up valid state', () => {
    chatActions.resetToEmpty()
    chatActions.ensureDefaultConversation()
    persistChatStateNow()
    loadChatState()
    const keys = (
      localStorage as unknown as ReturnType<typeof memoryStorage>
    ).keys()
    expect(keys).toEqual([CHAT_STORAGE_KEY])
  })
})

describe('mergeRemoteChatState', () => {
  const base = () => {
    chatActions.resetToEmpty()
    chatActions.ensureDefaultConversation()
    return structuredClone(chatStore.state)
  }

  it('keeps local model and current chat when it still exists', () => {
    const local = base()
    const id = local.currentConversationId!
    const incoming = {
      ...local,
      selectedModel: 'm/remote',
      currentConversationId: null,
    }
    const merged = mergeRemoteChatState(
      { ...local, selectedModel: 'm/local' },
      incoming,
    )
    expect(merged.selectedModel).toBe('m/local')
    expect(merged.currentConversationId).toBe(id)
  })

  it('falls back to the remote current chat when the local one is gone', () => {
    const local = base()
    const incoming = {
      ...local,
      conversationsById: {},
      conversationOrder: [],
      currentConversationId: null,
    }
    const merged = mergeRemoteChatState(local, incoming)
    expect(merged.currentConversationId).toBeNull()
  })
})

describe('startChatPersistence cross-tab sync', () => {
  let channels: Array<{ onmessage: (() => void) | null }>
  beforeEach(() => {
    vi.useFakeTimers()
    channels = []
    vi.stubGlobal('localStorage', memoryStorage())
    vi.stubGlobal('window', new EventTarget())
    vi.stubGlobal('document', new EventTarget())
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        onmessage: (() => void) | null = null
        constructor() {
          channels.push(this)
        }
        postMessage() {}
        close() {}
      },
    )
    chatActions.resetToEmpty()
    chatActions.ensureDefaultConversation()
    chatStore.setState((s) => ({ ...s, selectedModel: 'm/local' }))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function remoteRaw(title: string) {
    const state = structuredClone(chatStore.state)
    const id = state.currentConversationId!
    state.conversationsById[id] = { ...state.conversationsById[id], title }
    state.selectedModel = 'm/remote'
    return JSON.stringify(state)
  }
  async function remoteSave(raw: string) {
    localStorage.setItem(CHAT_STORAGE_KEY, raw)
    channels.at(-1)?.onmessage?.()
    await vi.advanceTimersByTimeAsync(0)
  }
  const title = () =>
    chatStore.state.conversationsById[chatStore.state.currentConversationId!]
      .title

  it('applies remote state without saving it back, keeping the local model', async () => {
    const stop = startChatPersistence()
    const raw = remoteRaw('From other tab')
    await remoteSave(raw)
    expect(title()).toBe('From other tab')
    expect(chatStore.state.selectedModel).toBe('m/local')
    await vi.advanceTimersByTimeAsync(1000)
    expect(localStorage.getItem(CHAT_STORAGE_KEY)).toBe(raw)
    stop()
  })
})
