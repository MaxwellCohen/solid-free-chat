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

/** Reusable skill: instructions composed into the system prompt when attached. */
export interface ChatSkill {
  id: string
  name: string
  instructions: string
  updatedAt: number
}

export interface ChatConversation {
  id: string
  title: string
  updatedAt: number
  /** Ordered skill ids attached to this chat (live links into `skills`). */
  skillIds: string[]
  /** Most recent usage reported by the API for this chat. */
  lastUsage?: TokenUsageSnapshot
  /** Sum of `totalTokens` from each completed run in this chat (approx. session usage). */
  sessionTotalTokens?: number
}

export interface ChatConversationWithMessages extends ChatConversation {
  messages: ChatUIMessage[]
}

export interface ChatAppState {
  conversationOrder: string[]
  conversationsById: Record<string, ChatConversation>
  messagesByConversationId: Record<string, ChatUIMessage[]>
  currentConversationId: string | null
  selectedModel: string
  skills: ChatSkill[]
}

type LegacyChatConversation = ChatConversationWithMessages & {
  customSystemMessage?: string
  messages?: unknown
}

type LegacyChatAppState = {
  conversations?: LegacyChatConversation[]
  currentConversationId?: string | null
  selectedModel?: string
  savedSystemPrompts?: unknown
  skills?: unknown
}

type PersistedChatState = {
  conversationOrder?: unknown
  conversationsById?: unknown
  messagesByConversationId?: unknown
  currentConversationId?: unknown
  selectedModel?: unknown
  savedSystemPrompts?: unknown
  skills?: unknown
}

export const NEW_CHAT_TITLE = 'New chat'

const emptyState = (): ChatAppState => ({
  conversationOrder: [],
  conversationsById: {},
  messagesByConversationId: {},
  currentConversationId: null,
  selectedModel: DEFAULT_CHAT_MODEL,
  skills: [],
})

export const chatStore = new Store<ChatAppState>(emptyState())

function newConversationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function newSkillId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `sk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function newConversation(now = Date.now(), id = newConversationId()): ChatConversation {
  return {
    id,
    title: NEW_CHAT_TITLE,
    updatedAt: now,
    skillIds: [],
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

function normalizeSkillIds(
  raw: unknown,
  validIds: ReadonlySet<string>,
): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const id = value.trim()
    if (!id || seen.has(id) || !validIds.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

/** Normalize skills from `skills` or migrate from legacy `savedSystemPrompts`. */
export function normalizeSkills(
  skillsRaw: unknown,
  savedSystemPromptsRaw?: unknown,
): ChatSkill[] {
  if (Array.isArray(skillsRaw)) {
    return skillsRaw
      .filter((p): p is Record<string, unknown> => p != null && typeof p === 'object')
      .map((p) => ({
        id:
          typeof p.id === 'string' && p.id.trim()
            ? p.id.trim()
            : newSkillId(),
        name:
          typeof p.name === 'string' && p.name.trim()
            ? p.name.trim().slice(0, 120)
            : 'Untitled',
        instructions:
          typeof p.instructions === 'string'
            ? p.instructions
            : typeof p.text === 'string'
              ? p.text
              : '',
        updatedAt:
          typeof p.updatedAt === 'number' && Number.isFinite(p.updatedAt)
            ? p.updatedAt
            : Date.now(),
      }))
  }

  if (!Array.isArray(savedSystemPromptsRaw)) return []
  return savedSystemPromptsRaw
    .filter((p): p is Record<string, unknown> => p != null && typeof p === 'object')
    .map((p) => ({
      id:
        typeof p.id === 'string' && p.id.trim()
          ? p.id.trim()
          : newSkillId(),
      name:
        typeof p.name === 'string' && p.name.trim()
          ? p.name.trim().slice(0, 120)
          : 'Untitled',
      instructions: typeof p.text === 'string' ? p.text : '',
      updatedAt:
        typeof p.updatedAt === 'number' && Number.isFinite(p.updatedAt)
          ? p.updatedAt
          : Date.now(),
    }))
}

function findOrCreateSkillForInstructions(
  skills: ChatSkill[],
  instructions: string,
  name = 'Migrated from chat',
): { skills: ChatSkill[]; skillId: string } {
  const trimmed = instructions.trim()
  const existing = skills.find((s) => s.instructions.trim() === trimmed)
  if (existing) return { skills, skillId: existing.id }
  const skill: ChatSkill = {
    id: newSkillId(),
    name,
    instructions: trimmed,
    updatedAt: Date.now(),
  }
  return { skills: [...skills, skill], skillId: skill.id }
}

type ConversationNormalizeResult = {
  conversation: ChatConversation
  skills: ChatSkill[]
}

function normalizeConversationRecord(
  raw: unknown,
  fallbackId: string,
  skills: ChatSkill[],
): ConversationNormalizeResult {
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
  const lastUsage = normalizeTokenUsageSnapshot(source.lastUsage)
  const sessionTotalTokens =
    typeof source.sessionTotalTokens === 'number' &&
    Number.isFinite(source.sessionTotalTokens)
      ? source.sessionTotalTokens
      : undefined

  let nextSkills = skills
  const validIds = new Set(nextSkills.map((s) => s.id))
  let skillIds = normalizeSkillIds(source.skillIds, validIds)

  const legacySystem =
    typeof source.customSystemMessage === 'string'
      ? source.customSystemMessage.trim()
      : ''

  if (skillIds.length === 0 && legacySystem) {
    const migrated = findOrCreateSkillForInstructions(nextSkills, legacySystem)
    nextSkills = migrated.skills
    skillIds = [migrated.skillId]
  }

  return {
    skills: nextSkills,
    conversation: {
      id,
      title,
      updatedAt,
      skillIds,
      ...(lastUsage ? { lastUsage } : {}),
      ...(sessionTotalTokens !== undefined ? { sessionTotalTokens } : {}),
    },
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

  let skills = normalizeSkills(source.skills, source.savedSystemPrompts)
  const conversationsById: Record<string, ChatConversation> = {}
  const messagesByConversationId: Record<string, ChatUIMessage[]> = {}

  for (const [key, value] of Object.entries(rawConversationsById)) {
    const result = normalizeConversationRecord(value, key, skills)
    skills = result.skills
    conversationsById[result.conversation.id] = result.conversation
    messagesByConversationId[result.conversation.id] = normalizeMessages(
      rawMessagesByConversationId[result.conversation.id],
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
    skills,
  }
}

function normalizeLegacyChatState(raw: LegacyChatAppState): ChatAppState | null {
  const legacyConversations = Array.isArray(raw.conversations) ? raw.conversations : null
  if (!legacyConversations) return null

  let skills = normalizeSkills(raw.skills, raw.savedSystemPrompts)
  const conversationsById: Record<string, ChatConversation> = {}
  const messagesByConversationId: Record<string, ChatUIMessage[]> = {}
  const conversationOrder: string[] = []

  for (const value of legacyConversations) {
    const result = normalizeConversationRecord(value, newConversationId(), skills)
    skills = result.skills
    if (result.conversation.id in conversationsById) continue
    conversationsById[result.conversation.id] = result.conversation
    messagesByConversationId[result.conversation.id] = normalizeMessages(
      value.messages,
    )
    conversationOrder.push(result.conversation.id)
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
    skills,
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

  addSkill(name: string, instructions: string) {
    const trimmedName = name.trim()
    const trimmedInstructions = instructions.trim()
    if (!trimmedName || !trimmedInstructions) return undefined
    const id = newSkillId()
    chatStore.setState((s) => ({
      ...s,
      skills: [
        {
          id,
          name: trimmedName.slice(0, 120),
          instructions: trimmedInstructions,
          updatedAt: Date.now(),
        },
        ...s.skills,
      ],
    }))
    return id
  },

  updateSkill(
    skillId: string,
    patch: { name?: string; instructions?: string },
  ) {
    chatStore.setState((s) => {
      const index = s.skills.findIndex((skill) => skill.id === skillId)
      if (index < 0) return s
      const current = s.skills[index]
      const nextName =
        patch.name !== undefined ? patch.name.trim().slice(0, 120) : current.name
      const nextInstructions =
        patch.instructions !== undefined
          ? patch.instructions.trim()
          : current.instructions
      if (!nextName || !nextInstructions) return s
      const skills = s.skills.slice()
      skills[index] = {
        ...current,
        name: nextName,
        instructions: nextInstructions,
        updatedAt: Date.now(),
      }
      return { ...s, skills }
    })
  },

  deleteSkill(skillId: string) {
    chatStore.setState((s) => {
      const conversationsById: Record<string, ChatConversation> = {}
      for (const [id, conversation] of Object.entries(s.conversationsById)) {
        conversationsById[id] = {
          ...conversation,
          skillIds: conversation.skillIds.filter((sid) => sid !== skillId),
        }
      }
      return {
        ...s,
        skills: s.skills.filter((skill) => skill.id !== skillId),
        conversationsById,
      }
    })
  },

  setConversationSkillIds(conversationId: string, skillIds: string[]) {
    chatStore.setState((s) => {
      const current = getConversation(s, conversationId)
      if (!current) return s
      const validIds = new Set(s.skills.map((skill) => skill.id))
      return {
        ...s,
        conversationsById: {
          ...s.conversationsById,
          [conversationId]: {
            ...current,
            skillIds: normalizeSkillIds(skillIds, validIds),
            updatedAt: Date.now(),
          },
        },
      }
    })
  },

  toggleConversationSkill(conversationId: string, skillId: string) {
    chatStore.setState((s) => {
      const current = getConversation(s, conversationId)
      if (!current) return s
      if (!s.skills.some((skill) => skill.id === skillId)) return s
      const attached = current.skillIds.includes(skillId)
      const skillIds = attached
        ? current.skillIds.filter((id) => id !== skillId)
        : [...current.skillIds, skillId]
      return {
        ...s,
        conversationsById: {
          ...s.conversationsById,
          [conversationId]: {
            ...current,
            skillIds,
            updatedAt: Date.now(),
          },
        },
      }
    })
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

  attachedSkills(
    state: ChatAppState,
    conversationId: string,
  ): ChatSkill[] {
    const conversation = getConversation(state, conversationId)
    if (!conversation) return []
    const byId = new Map(state.skills.map((skill) => [skill.id, skill]))
    return conversation.skillIds
      .map((id) => byId.get(id))
      .filter((skill): skill is ChatSkill => skill != null)
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
