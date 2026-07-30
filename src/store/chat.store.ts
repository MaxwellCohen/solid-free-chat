import { Store } from '@tanstack/store'
import type { UIMessage } from '@tanstack/ai-solid'
import { DEFAULT_CHAT_MODEL } from '../lib/chat-models'

/** Token counts from the provider for one completed model run (see RUN_FINISHED). */
export interface TokenUsageSnapshot {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  recordedAt: number
}

/** UIMessage with optional per-reply usage (extension; persisted in local storage). */
export type ChatUIMessage = UIMessage & {
  tokenUsage?: TokenUsageSnapshot
}

export interface ChatConversation {
  id: string
  title: string
  updatedAt: number
  /** Per-chat instructions sent as a system message on each model request (server-injected). */
  customSystemMessage: string
  /** Most recent usage reported by the API for this chat. */
  lastUsage?: TokenUsageSnapshot
  /** Sum of `totalTokens` from each completed run in this chat (approx. session usage). */
  sessionTotalTokens?: number
}

export interface ChatConversationWithMessages extends ChatConversation {
  messages: ChatUIMessage[]
}

/** Reusable system prompt templates (browser-local). */
export interface SavedSystemPrompt {
  id: string
  name: string
  text: string
  updatedAt: number
}

export interface ChatAppState {
  conversationOrder: string[]
  conversationsById: Record<string, ChatConversation>
  messagesByConversationId: Record<string, ChatUIMessage[]>
  currentConversationId: string | null
  selectedModel: string
  savedSystemPrompts: SavedSystemPrompt[]
}

type LegacyChatConversation = ChatConversationWithMessages

type LegacyChatAppState = {
  conversations?: LegacyChatConversation[]
  currentConversationId?: string | null
  selectedModel?: string
  savedSystemPrompts?: unknown
}

type PersistedChatState = {
  conversationOrder?: unknown
  conversationsById?: unknown
  messagesByConversationId?: unknown
  currentConversationId?: unknown
  selectedModel?: unknown
  savedSystemPrompts?: unknown
}

export const NEW_CHAT_TITLE = 'New chat'

const emptyState = (): ChatAppState => ({
  conversationOrder: [],
  conversationsById: {},
  messagesByConversationId: {},
  currentConversationId: null,
  selectedModel: DEFAULT_CHAT_MODEL,
  savedSystemPrompts: [],
})

export const chatStore = new Store<ChatAppState>(emptyState())

function newConversationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function newSavedPromptId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `sp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function newConversation(now = Date.now(), id = newConversationId()): ChatConversation {
  return {
    id,
    title: NEW_CHAT_TITLE,
    updatedAt: now,
    customSystemMessage: '',
  }
}

export function normalizeTokenUsageSnapshot(
  raw: unknown,
): TokenUsageSnapshot | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const promptTokens = o.promptTokens
  const completionTokens = o.completionTokens
  const totalTokens = o.totalTokens
  const recordedAt = o.recordedAt
  if (
    typeof promptTokens !== 'number' ||
    typeof completionTokens !== 'number' ||
    typeof totalTokens !== 'number' ||
    !Number.isFinite(promptTokens) ||
    !Number.isFinite(completionTokens) ||
    !Number.isFinite(totalTokens)
  ) {
    return undefined
  }
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    recordedAt:
      typeof recordedAt === 'number' && Number.isFinite(recordedAt)
        ? recordedAt
        : Date.now(),
  }
}

export function normalizeSavedSystemPrompts(raw: unknown): SavedSystemPrompt[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p): p is Record<string, unknown> => p != null && typeof p === 'object')
    .map((p) => ({
      id:
        typeof p.id === 'string' && p.id.trim()
          ? p.id.trim()
          : newSavedPromptId(),
      name:
        typeof p.name === 'string' && p.name.trim()
          ? p.name.trim().slice(0, 120)
          : 'Untitled',
      text: typeof p.text === 'string' ? p.text : '',
      updatedAt:
        typeof p.updatedAt === 'number' && Number.isFinite(p.updatedAt)
          ? p.updatedAt
          : Date.now(),
    }))
}

function normalizeMessage(raw: unknown): ChatUIMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const message = raw as UIMessage & { tokenUsage?: unknown }
  const tokenUsage = normalizeTokenUsageSnapshot(message.tokenUsage)
  return {
    ...message,
    createdAt:
      message.createdAt != null
        ? new Date(message.createdAt as unknown as string | number)
        : undefined,
    ...(tokenUsage ? { tokenUsage } : {}),
  } as ChatUIMessage
}

function normalizeMessages(raw: unknown): ChatUIMessage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((message) => normalizeMessage(message))
    .filter((message): message is ChatUIMessage => message != null)
}

function normalizeConversationRecord(
  raw: unknown,
  fallbackId: string,
): ChatConversation {
  const now = Date.now()
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const id =
    typeof source.id === 'string' && source.id.trim() ? source.id.trim() : fallbackId
  const title =
    typeof source.title === 'string' && source.title.trim()
      ? source.title
      : NEW_CHAT_TITLE
  const updatedAt =
    typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt)
      ? source.updatedAt
      : now
  const customSystemMessage =
    typeof source.customSystemMessage === 'string' ? source.customSystemMessage : ''
  const lastUsage = normalizeTokenUsageSnapshot(source.lastUsage)
  const sessionTotalTokens =
    typeof source.sessionTotalTokens === 'number' &&
    Number.isFinite(source.sessionTotalTokens)
      ? source.sessionTotalTokens
      : undefined

  return {
    id,
    title,
    updatedAt,
    customSystemMessage,
    ...(lastUsage ? { lastUsage } : {}),
    ...(sessionTotalTokens !== undefined ? { sessionTotalTokens } : {}),
  }
}

function normalizeConversationOrder(
  raw: unknown,
  conversationsById: Record<string, ChatConversation>,
): string[] {
  if (!Array.isArray(raw)) return Object.keys(conversationsById)
  const seen = new Set<string>()
  const order: string[] = []
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const id = value.trim()
    if (!id || seen.has(id) || !(id in conversationsById)) continue
    seen.add(id)
    order.push(id)
  }
  for (const id of Object.keys(conversationsById)) {
    if (seen.has(id)) continue
    seen.add(id)
    order.push(id)
  }
  return order
}

function normalizePersistedChatState(raw: unknown): ChatAppState | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as PersistedChatState
  const rawConversationsById =
    source.conversationsById &&
    typeof source.conversationsById === 'object' &&
    !Array.isArray(source.conversationsById)
      ? (source.conversationsById as Record<string, unknown>)
      : null

  if (!rawConversationsById) return null

  const rawMessagesByConversationId =
    source.messagesByConversationId &&
    typeof source.messagesByConversationId === 'object' &&
    !Array.isArray(source.messagesByConversationId)
      ? (source.messagesByConversationId as Record<string, unknown>)
      : {}

  const conversationsById: Record<string, ChatConversation> = {}
  const messagesByConversationId: Record<string, ChatUIMessage[]> = {}

  for (const [key, value] of Object.entries(rawConversationsById)) {
    const conversation = normalizeConversationRecord(value, key)
    conversationsById[conversation.id] = conversation
    messagesByConversationId[conversation.id] = normalizeMessages(
      rawMessagesByConversationId[conversation.id],
    )
  }

  const conversationOrder = normalizeConversationOrder(
    source.conversationOrder,
    conversationsById,
  )
  const currentConversationId =
    typeof source.currentConversationId === 'string' &&
    source.currentConversationId in conversationsById
      ? source.currentConversationId
      : conversationOrder[0] ?? null

  return {
    conversationOrder,
    conversationsById,
    messagesByConversationId,
    currentConversationId,
    selectedModel:
      typeof source.selectedModel === 'string' && source.selectedModel.trim()
        ? source.selectedModel
        : DEFAULT_CHAT_MODEL,
    savedSystemPrompts: normalizeSavedSystemPrompts(source.savedSystemPrompts),
  }
}

function normalizeLegacyChatState(raw: LegacyChatAppState): ChatAppState | null {
  const legacyConversations = Array.isArray(raw.conversations) ? raw.conversations : null
  if (!legacyConversations) return null

  const conversationsById: Record<string, ChatConversation> = {}
  const messagesByConversationId: Record<string, ChatUIMessage[]> = {}
  const conversationOrder: string[] = []

  for (const value of legacyConversations) {
    const conversation = normalizeConversationRecord(value, newConversationId())
    if (conversation.id in conversationsById) continue
    conversationsById[conversation.id] = conversation
    messagesByConversationId[conversation.id] = normalizeMessages(value.messages)
    conversationOrder.push(conversation.id)
  }

  const currentConversationId =
    typeof raw.currentConversationId === 'string' &&
    raw.currentConversationId in conversationsById
      ? raw.currentConversationId
      : conversationOrder[0] ?? null

  return {
    conversationOrder,
    conversationsById,
    messagesByConversationId,
    currentConversationId,
    selectedModel:
      typeof raw.selectedModel === 'string' && raw.selectedModel.trim()
        ? raw.selectedModel
        : DEFAULT_CHAT_MODEL,
    savedSystemPrompts: normalizeSavedSystemPrompts(raw.savedSystemPrompts),
  }
}

export function normalizeChatAppState(raw: unknown): ChatAppState | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  if (
    'conversationOrder' in source ||
    'conversationsById' in source ||
    'messagesByConversationId' in source
  ) {
    return normalizePersistedChatState(source as PersistedChatState)
  }
  if ('conversations' in source) {
    return normalizeLegacyChatState(source as LegacyChatAppState)
  }
  return null
}

function getConversation(
  state: ChatAppState,
  conversationId: string,
): ChatConversation | undefined {
  if (!(conversationId in state.conversationsById)) return undefined
  return state.conversationsById[conversationId]
}

function getConversationMessages(state: ChatAppState, conversationId: string): ChatUIMessage[] {
  return state.messagesByConversationId[conversationId] ?? []
}

function getConversationWithMessages(
  state: ChatAppState,
  conversationId: string,
): ChatConversationWithMessages | undefined {
  const conversation = getConversation(state, conversationId)
  if (!conversation) return undefined
  return {
    ...conversation,
    messages: getConversationMessages(state, conversationId),
  }
}

export const chatActions = {
  resetToEmpty() {
    chatStore.setState(() => emptyState())
  },

  hydrate(state: unknown) {
    const normalized = normalizeChatAppState(state)
    if (!normalized) return
    chatStore.setState(() => normalized)
  },

  ensureDefaultConversation() {
    chatStore.setState((s) => {
      if (s.conversationOrder.length > 0) {
        if (!s.currentConversationId) {
          return {
            ...s,
            currentConversationId: s.conversationOrder[0],
          }
        }
        return s
      }
      const conversation = newConversation()
      return {
        ...s,
        conversationOrder: [conversation.id],
        conversationsById: {
          ...s.conversationsById,
          [conversation.id]: conversation,
        },
        messagesByConversationId: {
          ...s.messagesByConversationId,
          [conversation.id]: [],
        },
        currentConversationId: conversation.id,
      }
    })
  },

  createConversation() {
    const conversation = newConversation()
    chatStore.setState((s) => ({
      ...s,
      conversationOrder: [conversation.id, ...s.conversationOrder],
      conversationsById: {
        ...s.conversationsById,
        [conversation.id]: conversation,
      },
      messagesByConversationId: {
        ...s.messagesByConversationId,
        [conversation.id]: [],
      },
      currentConversationId: conversation.id,
    }))
    return conversation.id
  },

  setCurrentConversationId(id: string | null) {
    chatStore.setState((s) => ({
      ...s,
      currentConversationId:
        id && id in s.conversationsById ? id : (s.conversationOrder[0] ?? null),
    }))
  },

  setSelectedModel(model: string) {
    chatStore.setState((s) => ({ ...s, selectedModel: model }))
  },

  setConversationCustomSystemMessage(conversationId: string, value: string) {
    chatStore.setState((s) => {
      const current = getConversation(s, conversationId)
      if (!current) return s
      return {
        ...s,
        conversationsById: {
          ...s.conversationsById,
          [conversationId]: {
            ...current,
            customSystemMessage: value,
            updatedAt: Date.now(),
          },
        },
      }
    })
  },

  addSavedSystemPrompt(name: string, text: string) {
    const trimmedName = name.trim()
    const trimmedText = text.trim()
    if (!trimmedName || !trimmedText) return
    const id = newSavedPromptId()
    chatStore.setState((s) => ({
      ...s,
      savedSystemPrompts: [
        {
          id,
          name: trimmedName.slice(0, 120),
          text: trimmedText,
          updatedAt: Date.now(),
        },
        ...s.savedSystemPrompts,
      ],
    }))
  },

  deleteSavedSystemPrompt(promptId: string) {
    chatStore.setState((s) => ({
      ...s,
      savedSystemPrompts: s.savedSystemPrompts.filter((p) => p.id !== promptId),
    }))
  },

  deleteConversation(id: string) {
    chatStore.setState((s) => {
      if (!(id in s.conversationsById)) return s
      const { [id]: _removedConversation, ...conversationsById } = s.conversationsById
      const { [id]: _removedMessages, ...messagesByConversationId } =
        s.messagesByConversationId
      const conversationOrder = s.conversationOrder.filter(
        (conversationId) => conversationId !== id,
      )
      const currentConversationId =
        s.currentConversationId === id
          ? (conversationOrder[0] ?? null)
          : s.currentConversationId

      return {
        ...s,
        conversationOrder,
        conversationsById,
        messagesByConversationId,
        currentConversationId,
      }
    })
  },

  recordConversationTokenUsage(
    conversationId: string,
    usage: Omit<TokenUsageSnapshot, 'recordedAt'>,
  ) {
    const recordedAt = Date.now()
    chatStore.setState((s) => {
      const conversation = getConversation(s, conversationId)
      if (!conversation) return s
      const prevSession = conversation.sessionTotalTokens ?? 0
      return {
        ...s,
        conversationsById: {
          ...s.conversationsById,
          [conversationId]: {
            ...conversation,
            lastUsage: { ...usage, recordedAt },
            sessionTotalTokens: prevSession + usage.totalTokens,
            updatedAt: Date.now(),
          },
        },
      }
    })
  },

  /** Replace the committed history for one conversation. */
  setConversationMessages(conversationId: string, messages: ChatUIMessage[]) {
    chatStore.setState((s) => {
      const conversation = getConversation(s, conversationId)
      if (!conversation) return s
      const titleHint = deriveTitleFromMessages(messages)
      let title = conversation.title
      if (conversation.title === NEW_CHAT_TITLE && titleHint) {
        title = truncate(titleHint, 52)
      }
      return {
        ...s,
        conversationsById: {
          ...s.conversationsById,
          [conversationId]: {
            ...conversation,
            title,
            updatedAt: Date.now(),
          },
        },
        messagesByConversationId: {
          ...s.messagesByConversationId,
          [conversationId]: messages,
        },
      }
    })
  },
}

export const chatSelectors = {
  currentConversation(state: ChatAppState): ChatConversationWithMessages | undefined {
    const id = state.currentConversationId
    if (!id) return undefined
    return getConversationWithMessages(state, id)
  },

  conversationList(state: ChatAppState): ChatConversation[] {
    return state.conversationOrder
      .map((id) => getConversation(state, id))
      .filter((conversation): conversation is ChatConversation => conversation != null)
  },

  conversationMessages(
    state: ChatAppState,
    conversationId: string,
  ): ChatUIMessage[] {
    return getConversationMessages(state, conversationId)
  },
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

/** Attach usage to the last assistant message (the one that just finished streaming). */
export function attachTokenUsageToLastAssistantMessage(
  messages: ChatUIMessage[],
  usage: TokenUsageSnapshot,
): ChatUIMessage[] {
  const next = messages.slice()
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].role === 'assistant') {
      next[i] = { ...next[i], tokenUsage: usage }
      break
    }
  }
  return next
}

function deriveTitleFromMessages(messages: UIMessage[]): string | null {
  for (const m of messages) {
    if (m.role !== 'user') continue
    const parts = m.parts
    for (const p of parts) {
      if (p.type === 'text' && p.content.trim()) {
        return p.content.trim()
      }
    }
  }
  return null
}
