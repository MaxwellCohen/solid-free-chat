import { Store } from '@tanstack/store'
import type { UIMessage } from '@tanstack/ai-solid'
import { DEFAULT_CHAT_MODEL } from '../lib/chat-models'

export interface ChatConversation {
  id: string
  title: string
  updatedAt: number
  messages: UIMessage[]
}

export interface ChatAppState {
  conversations: ChatConversation[]
  currentConversationId: string | null
  selectedModel: string
}

export const NEW_CHAT_TITLE = 'New chat'

const emptyState = (): ChatAppState => ({
  conversations: [],
  currentConversationId: null,
  selectedModel: DEFAULT_CHAT_MODEL,
})

export const chatStore = new Store<ChatAppState>(emptyState())

function newConversationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const chatActions = {
  resetToEmpty() {
    chatStore.setState(() => emptyState())
  },

  hydrate(state: ChatAppState) {
    chatStore.setState(() => ({
      ...state,
      selectedModel: state.selectedModel || DEFAULT_CHAT_MODEL,
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
