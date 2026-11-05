import type { ChatAppState, ChatUIMessage } from '../store/chat.store'
import { DEFAULT_CHAT_MODEL } from './chat-models'
import { MAX_IMPORT_BYTES } from './chat-export'
import type { ChatImportResult } from './chat-export'

type GptNode = {
  id?: unknown
  parent?: unknown
  message?: {
    id?: unknown
    author?: { role?: unknown }
    create_time?: unknown
    content?: { content_type?: unknown; parts?: unknown }
  } | null
}

type GptConversation = {
  id?: unknown
  conversation_id?: unknown
  title?: unknown
  create_time?: unknown
  update_time?: unknown
  mapping?: Record<string, GptNode>
  current_node?: unknown
}

function partsText(parts: unknown): string {
  if (!Array.isArray(parts)) return ''
  return parts
    .map((p) => {
      if (typeof p === 'string') return p
      if (p && typeof p === 'object') {
        const t = (p as { text?: unknown }).text
        if (typeof t === 'string') return t
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

/** Walks `current_node` up through parents and returns user/assistant text messages in order. */
export function linearizeChatGptConversation(
  conv: GptConversation,
): ChatUIMessage[] {
  const mapping = conv.mapping
  if (!mapping || typeof mapping !== 'object') return []
  let nodeId: string | null =
    typeof conv.current_node === 'string' ? conv.current_node : null
  if (!nodeId || !(nodeId in mapping)) {
    // Fallback: a leaf (node nobody lists as parent) with latest message time.
    const parents = new Set(
      Object.values(mapping).map((n) =>
        typeof n.parent === 'string' ? n.parent : '',
      ),
    )
    const leaves = Object.entries(mapping).filter(([id]) => !parents.has(id))
    nodeId = leaves.length ? leaves[leaves.length - 1][0] : null
  }
  const chain: GptNode[] = []
  const seen = new Set<string>()
  while (nodeId && nodeId in mapping && !seen.has(nodeId)) {
    seen.add(nodeId)
    const node: GptNode = mapping[nodeId]
    chain.push(node)
    nodeId = typeof node.parent === 'string' ? node.parent : null
  }
  chain.reverse()
  const out: ChatUIMessage[] = []
  for (const node of chain) {
    const m = node.message
    const role = m?.author?.role
    if (!m || (role !== 'user' && role !== 'assistant')) continue
    if (m.content?.content_type && m.content.content_type !== 'text') continue
    const text = partsText(m.content?.parts)
    if (!text) continue
    out.push({
      id: typeof m.id === 'string' ? m.id : String(node.id ?? out.length),
      role,
      parts: [{ type: 'text', content: text }],
      ...(typeof m.create_time === 'number'
        ? { createdAt: new Date(m.create_time * 1000) }
        : {}),
    } as ChatUIMessage)
  }
  return out
}

export function isChatGptExport(raw: unknown): raw is GptConversation[] {
  return (
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw.some(
      (c) =>
        c &&
        typeof c === 'object' &&
        Boolean((c as GptConversation).mapping) &&
        typeof (c as GptConversation).mapping === 'object',
    )
  )
}

/** Parses a ChatGPT data-export `conversations.json` into app state. */
export function parseChatGptExport(text: string): ChatImportResult {
  if (text.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: 'File is too large.' }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'File is not valid JSON.' }
  }
  if (!isChatGptExport(raw)) {
    return { ok: false, error: 'Not a ChatGPT export.' }
  }
  const state: ChatAppState = {
    conversationOrder: [],
    conversationsById: {},
    messagesByConversationId: {},
    currentConversationId: null,
    selectedModel: DEFAULT_CHAT_MODEL,
    skills: [],
    projects: [],
    enabledToolIds: [],
  }
  raw.forEach((conv, i) => {
    if (typeof conv !== 'object') return
    const messages = linearizeChatGptConversation(conv)
    if (messages.length === 0) return
    const id =
      typeof conv.conversation_id === 'string'
        ? `chatgpt-${conv.conversation_id}`
        : typeof conv.id === 'string'
          ? `chatgpt-${conv.id}`
          : `chatgpt-import-${i}`
    if (id in state.conversationsById) return
    const updated =
      typeof conv.update_time === 'number'
        ? conv.update_time
        : typeof conv.create_time === 'number'
          ? conv.create_time
          : null
    const title =
      typeof conv.title === 'string' && conv.title.trim()
        ? conv.title.trim()
        : 'Imported chat'
    state.conversationsById[id] = {
      id,
      title,
      titleLocked: true,
      updatedAt: updated != null ? updated * 1000 : Date.now(),
      skillIds: [],
    }
    state.messagesByConversationId[id] = messages
    state.conversationOrder.push(id)
  })
  if (state.conversationOrder.length === 0) {
    return { ok: false, error: 'No chats found in file.' }
  }
  return { ok: true, state }
}
