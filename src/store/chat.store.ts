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

export interface ChatConversation {
  id: string
  title: string
  updatedAt: number
  /** Per-chat instructions sent as a system message on each model request (server-injected). */
  customSystemMessage: string
  messages: UIMessage[]
  /** Most recent usage reported by the API for this chat. */
  lastUsage?: TokenUsageSnapshot
  /** Sum of `totalTokens` from each completed run in this chat (approx. session usage). */
  sessionTotalTokens?: number
}

/** Reusable system prompt templates (browser-local). */
export interface SavedSystemPrompt {
  id: string
  name: string
  text: string
  updatedAt: number
}

export interface ChatAppState {
  conversations: ChatConversation[]
  currentConversationId: string | null
  selectedModel: string
  savedSystemPrompts: SavedSystemPrompt[]
}

export const NEW_CHAT_TITLE = 'New chat'

const emptyState = (): ChatAppState => ({
  conversations: [],
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

export const chatActions = {
  resetToEmpty() {
    chatStore.setState(() => emptyState())
  },

  hydrate(state: ChatAppState) {
    chatStore.setState(() => ({
      ...state,
      selectedModel: state.selectedModel || DEFAULT_CHAT_MODEL,
      savedSystemPrompts: normalizeSavedSystemPrompts(state.savedSystemPrompts),
      conversations: state.conversations.map((c) => ({
        ...c,
        customSystemMessage:
          typeof c.customSystemMessage === 'string' ? c.customSystemMessage : '',
        lastUsage: normalizeTokenUsageSnapshot(c.lastUsage),
        sessionTotalTokens:
          typeof c.sessionTotalTokens === 'number' &&
          Number.isFinite(c.sessionTotalTokens)
            ? c.sessionTotalTokens
            : undefined,
      })),
    }))
  },

  ensureDefaultConversation() {
    chatStore.setState((s) => {
      if (s.conversations.length > 0) {
        if (!s.currentConversationId) {
          return {
            ...s,
            currentConversationId: s.conversations[0].id,
          }
        }
        return s
      }
      const id = newConversationId()
      const conv: ChatConversation = {
        id,
        title: NEW_CHAT_TITLE,
        updatedAt: Date.now(),
        customSystemMessage: '',
        messages: [],
      }
      return {
        ...s,
        conversations: [conv],
        currentConversationId: id,
      }
    })
  },

  createConversation() {
    const id = newConversationId()
    const conv: ChatConversation = {
      id,
      title: NEW_CHAT_TITLE,
      updatedAt: Date.now(),
      customSystemMessage: '',
      messages: [],
    }
    chatStore.setState((s) => ({
      ...s,
      conversations: [conv, ...s.conversations],
      currentConversationId: id,
    }))
    return id
  },

  setCurrentConversationId(id: string | null) {
    chatStore.setState((s) => ({ ...s, currentConversationId: id }))
  },

  setSelectedModel(model: string) {
    chatStore.setState((s) => ({ ...s, selectedModel: model }))
  },

  setConversationCustomSystemMessage(conversationId: string, value: string) {
    chatStore.setState((s) => ({
      ...s,
      conversations: s.conversations.map((c) =>
        c.id !== conversationId
          ? c
          : { ...c, customSystemMessage: value, updatedAt: Date.now() },
      ),
    }))
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
      const conversations = s.conversations.filter((c) => c.id !== id)
      let currentConversationId = s.currentConversationId
      if (currentConversationId === id) {
        currentConversationId = conversations[0]?.id ?? null
      }
      return { ...s, conversations, currentConversationId }
    })
  },

  recordConversationTokenUsage(
    conversationId: string,
    usage: Omit<TokenUsageSnapshot, 'recordedAt'>,
  ) {
    const recordedAt = Date.now()
    chatStore.setState((s) => ({
      ...s,
      conversations: s.conversations.map((c) => {
        if (c.id !== conversationId) return c
        const prevSession = c.sessionTotalTokens ?? 0
        return {
          ...c,
          lastUsage: { ...usage, recordedAt },
          sessionTotalTokens: prevSession + usage.totalTokens,
          updatedAt: Date.now(),
        }
      }),
    }))
  },

  /** Replace messages for a conversation (from live useChat sync). */
  setConversationMessages(conversationId: string, messages: UIMessage[]) {
    chatStore.setState((s) => {
      const titleHint = deriveTitleFromMessages(messages)
      return {
        ...s,
        conversations: s.conversations.map((c) => {
          if (c.id !== conversationId) return c
          let title = c.title
          if (c.title === NEW_CHAT_TITLE && titleHint) {
            title = truncate(titleHint, 52)
          }
          return {
            ...c,
            messages,
            title,
            updatedAt: Date.now(),
          }
        }),
      }
    })
  },
}

export const chatSelectors = {
  currentConversation(state: ChatAppState): ChatConversation | undefined {
    const id = state.currentConversationId
    if (!id) return undefined
    return state.conversations.find((c) => c.id === id)
  },
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
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
