import type { ChatAppState, ChatSkill } from '../store/chat.store'
import { normalizeChatAppState } from '../store/chat.store'
import { mergeProjects } from './chat-projects'
import { lookup, maybe } from './nullable'

export const EXPORT_FORMAT = 'solid-free-chat'
export const EXPORT_VERSION = 1
/** Reject import files larger than this (bytes). */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024

export type ChatImportResult =
  { ok: true; state: ChatAppState } | { ok: false; error: string }

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function serializeState(state: ChatAppState, now: number): string {
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date(now).toISOString(),
      conversationOrder: state.conversationOrder,
      conversationsById: state.conversationsById,
      messagesByConversationId: state.messagesByConversationId,
      currentConversationId: state.currentConversationId,
      selectedModel: state.selectedModel,
      skills: state.skills,
      projects: state.projects,
      enabledToolIds: state.enabledToolIds,
    },
    null,
    2,
  )
}

/** JSON backup of every chat (and skills). */
export function serializeAllChats(
  state: ChatAppState,
  now = Date.now(),
): string {
  return serializeState(state, now)
}

/** JSON for one chat; returns null when the chat does not exist. */
export function serializeChat(
  state: ChatAppState,
  id: string,
  now = Date.now(),
): string | null {
  const conversation = lookup(state.conversationsById, id)
  if (!conversation) return null
  const skills = state.skills.filter((s) =>
    conversation.skillIds.includes(s.id),
  )
  return serializeState(
    {
      ...state,
      conversationOrder: [id],
      conversationsById: { [id]: conversation },
      messagesByConversationId: {
        [id]: state.messagesByConversationId[id] ?? [],
      },
      currentConversationId: id,
      skills,
      projects: state.projects.filter((p) => p.id === conversation.projectId),
    },
    now,
  )
}

/** Markdown transcript of one chat (text parts only); null when the chat does not exist. */
export function chatToMarkdown(state: ChatAppState, id: string): string | null {
  const conversation = lookup(state.conversationsById, id)
  if (!conversation) return null
  const lines = [`# ${conversation.title}`, '']
  for (const message of state.messagesByConversationId[id] ?? []) {
    const text = (maybe(message.parts) ?? [])
      .flatMap((p) =>
        p.type === 'text' && typeof p.content === 'string' ? [p.content] : [],
      )
      .join('\n\n')
      .trim()
    if (!text) continue
    const label =
      message.role === 'user'
        ? 'User'
        : message.role === 'assistant'
          ? 'Assistant'
          : 'System'
    lines.push(`## ${label}`, '', text, '')
  }
  return lines.join('\n')
}

/** Safe file name stem from a chat title. */
export function exportFileName(title: string, ext: string): string {
  const stem =
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'chat'
  return `${stem}.${ext}`
}

/** Parse + validate + normalize an import file's text. */
export function parseChatImport(text: string): ChatImportResult {
  if (text.length > MAX_IMPORT_BYTES)
    return { ok: false, error: 'File is too large.' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'File is not valid JSON.' }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Unrecognized file format.' }
  }
  const format = (raw as Record<string, unknown>).format
  if (format !== undefined && format !== EXPORT_FORMAT) {
    return { ok: false, error: 'Unrecognized file format.' }
  }
  const state = normalizeChatAppState(raw)
  if (!state) return { ok: false, error: 'No chats found in file.' }
  if (state.conversationOrder.length === 0) {
    return { ok: false, error: 'No chats found in file.' }
  }
  return { ok: true, state }
}

/**
 * Add imported chats to `current` without overwriting anything: colliding
 * conversation/skill ids get fresh ids. Selected model and tools are kept.
 */
export function mergeImportedChats(
  current: ChatAppState,
  imported: ChatAppState,
  genId: () => string = newId,
): { state: ChatAppState; addedIds: string[] } {
  const skills = [...current.skills]
  const skillIdMap = new Map<string, string>()
  const usedSkillIds = new Set(skills.map((s) => s.id))
  for (const skill of imported.skills) {
    const existing = skills.find((s) => s.id === skill.id)
    if (
      existing &&
      existing.name === skill.name &&
      existing.instructions === skill.instructions
    ) {
      continue
    }
    if (!usedSkillIds.has(skill.id)) {
      usedSkillIds.add(skill.id)
      skills.push(skill)
      continue
    }
    let id = genId()
    while (usedSkillIds.has(id)) id = genId()
    usedSkillIds.add(id)
    skillIdMap.set(skill.id, id)
    skills.push({ ...skill, id } satisfies ChatSkill)
  }

  const { projects, idMap: projectIdMap } = mergeProjects(
    current.projects,
    imported.projects,
    genId,
  )

  const conversationsById = { ...current.conversationsById }
  const messagesByConversationId = { ...current.messagesByConversationId }
  const addedIds: string[] = []
  for (const oldId of imported.conversationOrder) {
    const conversation = lookup(imported.conversationsById, oldId)
    if (!conversation) continue
    let id = oldId
    while (id in conversationsById) id = genId()
    conversationsById[id] = {
      ...conversation,
      id,
      skillIds: conversation.skillIds.map((s) => skillIdMap.get(s) ?? s),
    }
    if (conversation.projectId) {
      const projectId =
        projectIdMap.get(conversation.projectId) ?? conversation.projectId
      if (projects.some((p) => p.id === projectId)) {
        conversationsById[id].projectId = projectId
      } else delete conversationsById[id].projectId
    }
    messagesByConversationId[id] =
      imported.messagesByConversationId[oldId] ?? []
    addedIds.push(id)
  }

  return {
    addedIds,
    state: {
      ...current,
      skills,
      projects,
      conversationOrder: [...addedIds, ...current.conversationOrder],
      conversationsById,
      messagesByConversationId,
      currentConversationId: addedIds[0] ?? current.currentConversationId,
    },
  }
}
