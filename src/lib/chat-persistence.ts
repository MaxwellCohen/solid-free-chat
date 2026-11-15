import type { ChatAppState, ChatUIMessage } from '../store/chat.store'
import { chatStore, normalizeChatAppState } from '../store/chat.store'
import type { AttachmentBackend } from './attachment-store'
import {
  ATTACHMENT_REF_PREFIX,
  attachmentCache,
  attachmentKey,
  attachmentKeyFromRef,
  attachmentRef,
  isAttachmentRef,
  openAttachmentBackend,
  rememberAttachmentKey,
} from './attachment-store'

export const CHAT_STORAGE_KEY = 'solid-free-chat:v2'
export const LEGACY_CHAT_STORAGE_KEY = 'solid-free-chat:v1'

const DEBOUNCE_MS = 280

let saveTimer: ReturnType<typeof setTimeout> | null = null

type PersistErrorListener = (error: unknown) => void
const persistErrorListeners = new Set<PersistErrorListener>()
let persistFailing = false

/**
 * Notifies when saving starts failing (e.g. storage quota exceeded). Fires once
 * per failure streak, not on every save. Returns unsubscribe.
 */
export function onChatPersistenceError(
  listener: PersistErrorListener,
): () => void {
  persistErrorListeners.add(listener)
  return () => persistErrorListeners.delete(listener)
}

let backend: AttachmentBackend | null = null
/** Keys known to be in IndexedDB, being written, or whose write failed. */
const stored = new Set<string>()
const pending = new Set<string>()
const inlineOnly = new Set<string>()

/** Sets the IndexedDB backend (null = keep attachments inline in localStorage). */
export function setAttachmentBackend(next: AttachmentBackend | null) {
  backend = next
  stored.clear()
  pending.clear()
  inlineOnly.clear()
  attachmentCache.clear()
}

/** Opens IndexedDB; resolves whether attachments will be stored there. */
export async function initAttachmentBackend(): Promise<boolean> {
  setAttachmentBackend(await openAttachmentBackend())
  return backend !== null
}

interface DataSource {
  type: 'data'
  value: string
  mimeType?: string
}

function dataSourceOf(part: unknown): DataSource | null {
  const source = (part as { source?: Partial<DataSource> } | null)?.source
  return source?.type === 'data' && typeof source.value === 'string'
    ? (source as DataSource)
    : null
}

function trackAttachment(key: string, value: string, queue: boolean) {
  attachmentCache.set(key, value)
  if (!queue || !backend || stored.has(key) || pending.has(key)) return
  const target = backend
  pending.add(key)
  void (async () => target.put(key, value))().then(
    () => {
      pending.delete(key)
      stored.add(key)
    },
    (e) => {
      console.warn('attachment storage failed; keeping it inline', e)
      pending.delete(key)
      inlineOnly.add(key)
      persistChatStateNow()
    },
  )
}

/** Copy of `message` with data payloads swapped for refs (never mutates it). */
function withAttachmentRefs(
  message: ChatUIMessage,
  queue: boolean,
): ChatUIMessage {
  let parts: ChatUIMessage['parts'] | undefined
  message.parts.forEach((part, i) => {
    // A placeholder goes back to storage as the ref it stands in for, so a
    // failed restore never destroys the reference (the next load retries).
    const unresolved = (part as UnresolvedPart).unresolvedAttachment
    if (unresolved) {
      parts ??= message.parts.slice()
      parts[i] = unresolved
      return
    }
    const source = backend ? dataSourceOf(part) : null
    if (!source?.value || isAttachmentRef(source.value)) return
    const key = attachmentKey(source)
    if (inlineOnly.has(key)) return
    trackAttachment(key, source.value, queue)
    parts ??= message.parts.slice()
    parts[i] = {
      ...part,
      source: { ...source, value: attachmentRef(key) },
    } as typeof part
  })
  return parts ? { ...message, parts } : message
}

function persistedMessages(
  byConversation: ChatAppState['messagesByConversationId'],
  queue: boolean,
): ChatAppState['messagesByConversationId'] {
  let out: ChatAppState['messagesByConversationId'] | undefined
  for (const [id, messages] of Object.entries(byConversation)) {
    let next: ChatUIMessage[] | undefined
    messages.forEach((message, i) => {
      const updated = withAttachmentRefs(message, queue)
      if (updated === message) return
      next ??= messages.slice()
      next[i] = updated
    })
    if (next) (out ??= { ...byConversation })[id] = next
  }
  return out ?? byConversation
}

/** `queue` also schedules IndexedDB writes; only real saves should pass it. */
function serialize(state: ChatAppState, queue = false): string {
  return JSON.stringify(toPersistedChatState(state, queue))
}

function toPersistedChatState(
  state: ChatAppState,
  queue: boolean,
): ChatAppState {
  return {
    conversationOrder: state.conversationOrder,
    conversationsById: state.conversationsById,
    messagesByConversationId: persistedMessages(
      state.messagesByConversationId,
      queue,
    ),
    currentConversationId: state.currentConversationId,
    selectedModel: state.selectedModel,
    skills: state.skills,
    enabledToolIds: state.enabledToolIds,
  }
}

function backupCorruptState(raw: string) {
  try {
    localStorage.setItem(`${CHAT_STORAGE_KEY}:corrupt-${Date.now()}`, raw)
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadChatState(): ChatAppState | null {
  if (typeof localStorage === 'undefined') return null
  const candidates = [
    localStorage.getItem(CHAT_STORAGE_KEY),
    localStorage.getItem(LEGACY_CHAT_STORAGE_KEY),
  ]
  for (const [index, raw] of candidates.entries()) {
    if (!raw) continue
    try {
      const parsed: unknown = JSON.parse(raw)
      const normalized = normalizeChatAppState(parsed)
      if (normalized) return normalized
    } catch {
      /* ignore malformed entry and try fallback */
    }
    if (index === 0) backupCorruptState(raw)
  }
  return null
}

const UNAVAILABLE_TEXT = '[attachment unavailable]'

type MessagePart = ChatUIMessage['parts'][number]
type UnresolvedPart = { unresolvedAttachment?: MessagePart }

/** Inlines every `idb:` ref; `missing` counts refs that could not be resolved. */
async function resolveAttachments(
  state: ChatAppState,
): Promise<{ state: ChatAppState; missing: number }> {
  const wanted = new Set<string>()
  for (const messages of Object.values(state.messagesByConversationId)) {
    for (const message of messages) {
      for (const part of message.parts) {
        const value = dataSourceOf(part)?.value
        if (isAttachmentRef(value)) wanted.add(attachmentKeyFromRef(value))
      }
    }
  }
  if (wanted.size === 0) return { state, missing: 0 }

  const values = new Map<string, string>()
  const toLoad: string[] = []
  for (const key of wanted) {
    const cached = attachmentCache.get(key)
    if (cached === undefined) toLoad.push(key)
    else {
      values.set(key, cached)
      // Cached and not in flight / failed means it is already in IndexedDB.
      if (!pending.has(key) && !inlineOnly.has(key)) stored.add(key)
    }
  }
  if (toLoad.length > 0 && backend) {
    try {
      for (const [key, value] of await backend.getMany(toLoad)) {
        values.set(key, value)
        attachmentCache.set(key, value)
        stored.add(key)
      }
    } catch (e) {
      console.warn('attachment restore failed', e)
    }
  }

  let missing = 0
  const messagesByConversationId: ChatAppState['messagesByConversationId'] = {}
  for (const [id, messages] of Object.entries(state.messagesByConversationId)) {
    messagesByConversationId[id] = messages.map((message) => {
      let parts: ChatUIMessage['parts'] | undefined
      message.parts.forEach((part, i) => {
        const source = dataSourceOf(part)
        if (!isAttachmentRef(source?.value)) return
        const key = attachmentKeyFromRef(source.value)
        const value = values.get(key)
        parts ??= message.parts.slice()
        if (value === undefined) {
          missing++
          parts[i] = {
            type: 'text',
            content: UNAVAILABLE_TEXT,
            unresolvedAttachment: part,
          } as MessagePart
          return
        }
        const restored = { ...source, value }
        rememberAttachmentKey(restored, key)
        parts[i] = { ...part, source: restored } as typeof part
      })
      return parts ? { ...message, parts } : message
    })
  }
  return { state: { ...state, messagesByConversationId }, missing }
}

/** Resolves attachment refs in a state from `loadChatState()`. */
export async function restoreAttachments(
  state: ChatAppState,
): Promise<ChatAppState> {
  return (await resolveAttachments(state)).state
}

/**
 * Deletes IndexedDB payloads the saved JSON no longer references. Run once
 * after startup restore; skipped unless a valid v2 state is in localStorage.
 */
export async function garbageCollectAttachments(): Promise<void> {
  try {
    if (!backend || typeof localStorage === 'undefined') return
    const raw = localStorage.getItem(CHAT_STORAGE_KEY)
    if (!raw) return
    JSON.parse(raw)
    const referenced = new Set<string>()
    const pattern = new RegExp(`${ATTACHMENT_REF_PREFIX}([^"\\\\]+)`, 'g')
    // Corrupt-state backups (`…:v2:corrupt-*`) may still reference payloads.
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i)
      if (!name?.startsWith(CHAT_STORAGE_KEY)) continue
      const text = localStorage.getItem(name) ?? ''
      for (const match of text.matchAll(pattern)) referenced.add(match[1])
    }
    const stale = (await backend.keys()).filter(
      (key) => !referenced.has(key) && !stored.has(key) && !pending.has(key),
    )
    if (stale.length > 0) await backend.deleteMany(stale)
  } catch {
    /* best effort */
  }
}

/** Remote tab's state, keeping this tab's model and (if it still exists) open chat. */
export function mergeRemoteChatState(
  local: ChatAppState,
  incoming: ChatAppState,
): ChatAppState {
  return {
    ...incoming,
    selectedModel: local.selectedModel,
    currentConversationId:
      local.currentConversationId !== null &&
      Object.hasOwn(incoming.conversationsById, local.currentConversationId)
        ? local.currentConversationId
        : incoming.currentConversationId,
  }
}

let remoteSyncBlocked = false
let deferredRemoteRaw: string | null = null
let applyDeferredRemote: (() => void) | null = null

/** Call with true while a reply is streaming so cross-tab updates don't clobber it. */
export function setChatRemoteSyncBlocked(blocked: boolean) {
  remoteSyncBlocked = blocked
  if (!blocked && deferredRemoteRaw !== null) applyDeferredRemote?.()
}

export function persistChatStateNow() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, serialize(chatStore.state, true))
    persistFailing = false
  } catch (e) {
    console.warn('chat persistence failed', e)
    if (persistFailing) return
    persistFailing = true
    for (const listener of persistErrorListeners) listener(e)
  }
}

/** Subscribe and debounce-save; returns unsubscribe. Client-only. */
export function startChatPersistence(): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }
  let remoteSerialized: string | null = null
  const sub = chatStore.subscribe(() => {
    if (remoteSerialized !== null) {
      if (serialize(chatStore.state) === remoteSerialized) return
      remoteSerialized = null
    }
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      persistChatStateNow()
      saveTimer = null
    }, DEBOUNCE_MS)
  })

  let remoteSeq = 0
  let stopped = false
  const applyMerged = (incoming: ChatAppState) => {
    const merged = mergeRemoteChatState(chatStore.state, incoming)
    remoteSerialized = serialize(merged)
    chatStore.setState(() => merged)
  }
  const applyRemote = (raw: string) => {
    const seq = ++remoteSeq
    if (saveTimer !== null) return
    if (remoteSyncBlocked) {
      deferredRemoteRaw = raw
      return
    }
    deferredRemoteRaw = null
    let normalized: ChatAppState | null
    try {
      normalized = normalizeChatAppState(JSON.parse(raw))
    } catch {
      return
    }
    if (!normalized) return
    if (!raw.includes(`"${ATTACHMENT_REF_PREFIX}`)) {
      applyMerged(normalized)
      return
    }
    const incoming = normalized
    void (async () => {
      // The other tab may still be writing the payloads; retry briefly.
      let restored: ChatAppState | null = null
      for (let attempt = 0; attempt < 4 && !restored; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 250))
        if (stopped || seq !== remoteSeq) return
        const result = await resolveAttachments(incoming)
        if (result.missing === 0) restored = result.state
      }
      if (!restored || stopped || seq !== remoteSeq) return
      if (saveTimer !== null) return
      if (remoteSyncBlocked) {
        deferredRemoteRaw = raw
        return
      }
      applyMerged(restored)
    })()
  }
  applyDeferredRemote = () => {
    if (deferredRemoteRaw !== null) applyRemote(deferredRemoteRaw)
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== CHAT_STORAGE_KEY || event.newValue === null) return
    applyRemote(event.newValue)
  }
  const onPageHide = () => persistChatStateNow()
  window.addEventListener('storage', onStorage)
  window.addEventListener('pagehide', onPageHide)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('pagehide', onPageHide)
    stopped = true
    applyDeferredRemote = null
    sub.unsubscribe()
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = null
    persistChatStateNow()
  }
}
