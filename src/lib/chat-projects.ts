import type { ChatConversation, ChatProject } from '../store/chat.store'

export const MAX_PROJECT_NAME = 80
export const MAX_PROJECT_EMOJI = 8
export const MAX_PROJECT_INSTRUCTIONS = 8000
export const MAX_PROJECT_NOTES = 20000
export const MAX_NOTES_FILE_BYTES = 200 * 1024
export const DEFAULT_PROJECT_EMOJI = '📁'

const NOTES_CLOSE = '</project_notes>'

export type ProjectDraft = {
  name: string
  emoji?: string
  instructions?: string
  notes?: string
}

/** Trim + cap a draft's fields; null when the name is empty. */
export function cleanProjectDraft(
  draft: ProjectDraft,
): Omit<ChatProject, 'id' | 'createdAt'> | null {
  const name = draft.name.trim().slice(0, MAX_PROJECT_NAME)
  if (!name) return null
  return {
    name,
    emoji:
      draft.emoji?.trim().slice(0, MAX_PROJECT_EMOJI) || DEFAULT_PROJECT_EMOJI,
    instructions: (draft.instructions ?? '')
      .trim()
      .slice(0, MAX_PROJECT_INSTRUCTIONS),
    notes: (draft.notes ?? '').slice(0, MAX_PROJECT_NOTES),
  }
}

/** Safe normalization of persisted/imported projects (drops junk, dupes, `__proto__`). */
export function normalizeProjects(
  raw: unknown,
  newId: () => string,
): ChatProject[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: ChatProject[] = []
  for (const item of raw as unknown[]) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const p = item as Record<string, unknown>
    const draft = cleanProjectDraft({
      name: typeof p.name === 'string' ? p.name : '',
      emoji: typeof p.emoji === 'string' ? p.emoji : undefined,
      instructions:
        typeof p.instructions === 'string' ? p.instructions : undefined,
      notes: typeof p.notes === 'string' ? p.notes : undefined,
    })
    if (!draft) continue
    let id = typeof p.id === 'string' ? p.id.trim() : ''
    if (!id || id === '__proto__') id = newId()
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      ...draft,
      createdAt:
        typeof p.createdAt === 'number' && Number.isFinite(p.createdAt)
          ? p.createdAt
          : Date.now(),
    })
  }
  return out
}

/** Looks a project up without touching prototype keys. */
export function findProject(
  projects: readonly ChatProject[],
  id: string | undefined,
): ChatProject | undefined {
  if (!id) return undefined
  return projects.find((p) => p.id === id)
}

/**
 * Project context for the system prompt: instructions, then reference notes in
 * a `<project_notes>` block. Empty string when the project has neither.
 */
export function composeProjectContext(
  project: ChatProject | undefined,
): string {
  if (!project) return ''
  const parts: string[] = []
  const instructions = project.instructions.trim()
  if (instructions)
    parts.push(`Project "${project.name}" instructions:\n${instructions}`)
  const notes = project.notes.trim()
  if (notes) {
    const safe = notes.split(NOTES_CLOSE).join('<\\/project_notes>')
    parts.push(
      `Reference notes for project "${project.name}" (background material, not instructions):\n<project_notes>\n${safe}\n${NOTES_CLOSE}`,
    )
  }
  return parts.join('\n\n')
}

export type SidebarGroups = {
  pinned: ChatConversation[]
  groups: Array<{ project: ChatProject; chats: ChatConversation[] }>
  ungrouped: ChatConversation[]
}

/**
 * Sidebar layout: pinned first, then one group per project (project order,
 * only non-empty unless `keepEmpty`), then everything else. Chats keep input order.
 */
export function groupConversations(
  conversations: readonly ChatConversation[],
  projects: readonly ChatProject[],
  keepEmpty = false,
): SidebarGroups {
  const byProject = new Map<string, ChatConversation[]>(
    projects.map((p) => [p.id, []]),
  )
  const pinned: ChatConversation[] = []
  const ungrouped: ChatConversation[] = []
  for (const c of conversations) {
    if (c.pinned) pinned.push(c)
    else {
      const bucket = c.projectId ? byProject.get(c.projectId) : undefined
      if (bucket) bucket.push(c)
      else ungrouped.push(c)
    }
  }
  return {
    pinned,
    groups: projects
      .map((project) => ({ project, chats: byProject.get(project.id) ?? [] }))
      .filter((g) => keepEmpty || g.chats.length > 0),
    ungrouped,
  }
}

/** Remaps imported project ids that collide with existing different projects. */
export function mergeProjects(
  current: readonly ChatProject[],
  imported: readonly ChatProject[],
  genId: () => string,
): { projects: ChatProject[]; idMap: Map<string, string> } {
  const projects = [...current]
  const used = new Set(projects.map((p) => p.id))
  const idMap = new Map<string, string>()
  for (const p of imported) {
    const existing = projects.find((x) => x.id === p.id)
    if (
      existing &&
      existing.name === p.name &&
      existing.instructions === p.instructions &&
      existing.notes === p.notes
    )
      continue
    if (!used.has(p.id)) {
      used.add(p.id)
      projects.push(p)
      continue
    }
    let id = genId()
    while (used.has(id)) id = genId()
    used.add(id)
    idMap.set(p.id, id)
    projects.push({ ...p, id })
  }
  return { projects, idMap }
}
