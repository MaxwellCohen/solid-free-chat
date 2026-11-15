import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHAT_STORAGE_KEY,
  LEGACY_CHAT_STORAGE_KEY,
  garbageCollectAttachments,
  loadChatState,
  mergeRemoteChatState,
  persistChatStateNow,
  restoreAttachments,
  setAttachmentBackend,
  startChatPersistence,
} from './chat-persistence'
import { createMemoryAttachmentBackend } from './attachment-store'
import type { ChatUIMessage } from '../store/chat.store'
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
  let win: EventTarget
  beforeEach(() => {
    vi.useFakeTimers()
    win = new EventTarget()
    vi.stubGlobal('localStorage', memoryStorage())
    vi.stubGlobal('window', win)
    chatActions.resetToEmpty()
    chatActions.ensureDefaultConversation()
    chatStore.setState((s) => ({ ...s, selectedModel: 'm/local' }))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function remoteRaw(title: string) {
    const state = structuredClone(chatStore.state)
    const id = state.currentConversationId!
    state.conversationsById[id] = { ...state.conversationsById[id], title }
    state.selectedModel = 'm/remote'
    return JSON.stringify(state)
  }
  function storageEvent(newValue: string | null, key = CHAT_STORAGE_KEY) {
    return Object.assign(new Event('storage'), { key, newValue })
  }

  it('applies remote state without saving it back, keeping the local model', () => {
    const stop = startChatPersistence()
    win.dispatchEvent(storageEvent(remoteRaw('From other tab')))
    const id = chatStore.state.currentConversationId!
    expect(chatStore.state.conversationsById[id].title).toBe('From other tab')
    expect(chatStore.state.selectedModel).toBe('m/local')
    vi.advanceTimersByTime(1000)
    expect(localStorage.getItem(CHAT_STORAGE_KEY)).toBeNull()
    stop()
  })

  it('ignores other keys and null values', () => {
    const stop = startChatPersistence()
    win.dispatchEvent(storageEvent(remoteRaw('x'), 'other'))
    win.dispatchEvent(storageEvent(null))
    const id = chatStore.state.currentConversationId!
    expect(chatStore.state.conversationsById[id].title).not.toBe('x')
    stop()
  })

  it('skips remote state while a local save is pending', () => {
    const stop = startChatPersistence()
    chatStore.setState((s) => ({ ...s, selectedModel: 'm/edited' }))
    win.dispatchEvent(storageEvent(remoteRaw('Remote')))
    const id = chatStore.state.currentConversationId!
    expect(chatStore.state.conversationsById[id].title).not.toBe('Remote')
    stop()
  })
})

describe('attachment persistence', () => {
  const PAYLOAD = 'QUJDREVGRw=='
  const PDF = 'JVBERi0xLjQK'
  let backend: ReturnType<typeof createMemoryAttachmentBackend>
  const flush = () => new Promise((r) => setTimeout(r, 0))
  const raw = () => localStorage.getItem(CHAT_STORAGE_KEY)!

  function seed() {
    chatActions.resetToEmpty()
    chatActions.ensureDefaultConversation()
    const id = chatStore.state.currentConversationId!
    const messages = [
      {
        id: 'm1',
        role: 'user',
        parts: [
          { type: 'text', content: 'hi' },
          {
            type: 'image',
            source: { type: 'data', value: PAYLOAD, mimeType: 'image/png' },
          },
          {
            type: 'document',
            source: { type: 'data', value: PDF, mimeType: 'application/pdf' },
            metadata: { filename: 'a.pdf' },
          },
        ],
      },
      { id: 'm2', role: 'assistant', parts: [{ type: 'text', content: 'ok' }] },
    ] as ChatUIMessage[]
    chatActions.setConversationMessages(id, messages)
    return id
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    backend = createMemoryAttachmentBackend()
    setAttachmentBackend(backend)
  })
  afterEach(() => {
    setAttachmentBackend(null)
    vi.unstubAllGlobals()
  })

  it('saves refs instead of payloads without mutating the store', async () => {
    const id = seed()
    const before = chatStore.state.messagesByConversationId[id]
    persistChatStateNow()
    expect(raw()).not.toContain(PAYLOAD)
    expect(raw()).not.toContain(PDF)
    expect(raw()).toContain('"idb:image/png:')
    expect(raw()).toContain('"idb:application/pdf:')
    expect(chatStore.state.messagesByConversationId[id]).toBe(before)
    expect(JSON.stringify(before)).toContain(PAYLOAD)
    await flush()
    expect([...backend.data.values()].sort()).toEqual([PDF, PAYLOAD].sort())
  })

  it('round-trips save, load and restore', async () => {
    const id = seed()
    const original = structuredClone(
      chatStore.state.messagesByConversationId[id],
    )
    persistChatStateNow()
    await flush()
    setAttachmentBackend(backend) // fresh tab: empty caches, same IndexedDB
    const loaded = loadChatState()!
    expect(JSON.stringify(loaded)).not.toContain(PAYLOAD)
    const restored = await restoreAttachments(loaded)
    expect(restored.messagesByConversationId[id]).toEqual(original)
  })

  it('replaces unresolved refs with a text placeholder', async () => {
    const id = seed()
    persistChatStateNow()
    await flush()
    backend.data.clear()
    setAttachmentBackend(backend)
    const saved = raw()
    const restored = await restoreAttachments(loadChatState()!)
    expect(restored.messagesByConversationId[id][0].parts).toMatchObject([
      { type: 'text', content: 'hi' },
      { type: 'text', content: '[attachment unavailable]' },
      { type: 'text', content: '[attachment unavailable]' },
    ])

    // Saving the placeholders writes the original refs back, with or without
    // a backend, so a later load can retry.
    chatActions.hydrate(restored)
    persistChatStateNow()
    expect(raw()).toBe(saved)
    setAttachmentBackend(null)
    persistChatStateNow()
    expect(raw()).toBe(saved)
  })

  it('keeps payloads referenced by a corrupt-state backup', async () => {
    seed()
    persistChatStateNow()
    await flush()
    localStorage.setItem(`${CHAT_STORAGE_KEY}:corrupt-1`, raw())
    chatActions.resetToEmpty()
    persistChatStateNow()
    setAttachmentBackend(backend) // fresh tab: nothing tracked as in use
    backend.data.set('stale:1:x', 'x')
    await garbageCollectAttachments()
    expect([...backend.data.values()].sort()).toEqual([PDF, PAYLOAD].sort())
  })

  it('keeps a payload inline when its put fails', async () => {
    seed()
    backend.put = (key, value) =>
      value === PAYLOAD
        ? Promise.reject(new Error('quota'))
        : (backend.data.set(key, value), Promise.resolve())
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    persistChatStateNow()
    expect(raw()).not.toContain(PAYLOAD)
    await flush()
    expect(raw()).toContain(PAYLOAD)
    expect(raw()).not.toContain(PDF)
  })

  it('persists inline when there is no backend', () => {
    seed()
    setAttachmentBackend(null)
    persistChatStateNow()
    expect(raw()).toContain(PAYLOAD)
    expect(raw()).not.toContain('idb:')
  })

  it('garbage-collects only unreferenced keys', async () => {
    seed()
    persistChatStateNow()
    await flush()
    backend.data.set('stale:1:x', 'old')
    setAttachmentBackend(backend)
    await garbageCollectAttachments()
    expect(backend.data.has('stale:1:x')).toBe(false)
    expect([...backend.data.values()].sort()).toEqual([PDF, PAYLOAD].sort())
  })

  it('skips garbage collection without a saved v2 state', async () => {
    backend.data.set('stale:1:x', 'old')
    await garbageCollectAttachments()
    expect(backend.data.has('stale:1:x')).toBe(true)
    localStorage.setItem(CHAT_STORAGE_KEY, '{not json')
    await garbageCollectAttachments()
    expect(backend.data.has('stale:1:x')).toBe(true)
  })
})
