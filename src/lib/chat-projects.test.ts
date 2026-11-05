import { describe, expect, it } from 'vitest'
import {
  MAX_PROJECT_NOTES,
  cleanProjectDraft,
  groupConversations,
  mergeProjects,
  normalizeProjects,
} from './chat-projects'
import type { ChatConversation, ChatProject } from '../store/chat.store'
import {
  chatActions,
  chatStore,
  normalizeChatAppState,
} from '../store/chat.store'

const proj = (id: string, name = id): ChatProject => ({
  id,
  name,
  emoji: '📁',
  instructions: '',
  notes: '',
  createdAt: 1,
})
const chat = (
  id: string,
  extra: Partial<ChatConversation> = {},
): ChatConversation => ({
  id,
  title: id,
  updatedAt: 1,
  skillIds: [],
  ...extra,
})

describe('normalizeProjects', () => {
  let n = 0
  const gen = () => `gen-${++n}`
  it('drops junk, dupes and caps notes', () => {
    const out = normalizeProjects(
      [
        { id: 'a', name: ' A ', notes: 'x'.repeat(MAX_PROJECT_NOTES + 50) },
        { id: 'a', name: 'dupe' },
        { id: '__proto__', name: 'evil' },
        { id: 'b', name: '   ' },
        null,
        'str',
      ],
      gen,
    )
    expect(out.map((p) => p.name)).toEqual(['A', 'evil'])
    expect(out[0].notes).toHaveLength(MAX_PROJECT_NOTES)
    expect(out[1].id).toMatch(/^gen-/)
    expect(out[0].emoji).toBe('📁')
  })
  it('returns [] for non-arrays', () => {
    expect(normalizeProjects({}, gen)).toEqual([])
    expect(normalizeProjects(undefined, gen)).toEqual([])
  })
  it('requires a name', () => {
    expect(cleanProjectDraft({ name: ' ' })).toBeNull()
  })
})

describe('groupConversations', () => {
  it('orders pinned, project groups, ungrouped; hides empty groups', () => {
    const g = groupConversations(
      [
        chat('p', { pinned: true, projectId: 'x' }),
        chat('a', { projectId: 'y' }),
        chat('b', { projectId: 'x' }),
        chat('c'),
        chat('d', { projectId: 'gone' }),
      ],
      [proj('x'), proj('y'), proj('empty')],
    )
    expect(g.pinned.map((c) => c.id)).toEqual(['p'])
    expect(
      g.groups.map((x) => [x.project.id, x.chats.map((c) => c.id)]),
    ).toEqual([
      ['x', ['b']],
      ['y', ['a']],
    ])
    expect(g.ungrouped.map((c) => c.id)).toEqual(['c', 'd'])
    expect(groupConversations([], [proj('e')], true).groups).toHaveLength(1)
  })
})

describe('mergeProjects', () => {
  it('remaps colliding ids and skips identical ones', () => {
    const { projects, idMap } = mergeProjects(
      [proj('a', 'Mine')],
      [proj('a', 'Theirs'), proj('b'), proj('b')],
      () => 'new',
    )
    expect(projects.map((p) => p.id)).toEqual(['a', 'new', 'b'])
    expect(idMap.get('a')).toBe('new')
  })
})

describe('project store', () => {
  it('normalizes projectId, drops dangling ones, ungroups on delete', () => {
    const state = normalizeChatAppState({
      conversationOrder: ['c1', 'c2'],
      conversationsById: {
        c1: { id: 'c1', title: 'one', updatedAt: 1, projectId: 'p1' },
        c2: { id: 'c2', title: 'two', updatedAt: 1, projectId: 'nope' },
      },
      projects: [{ id: 'p1', name: 'P' }],
    })
    expect(state?.conversationsById.c1.projectId).toBe('p1')
    expect(state?.conversationsById.c2.projectId).toBeUndefined()
    chatActions.hydrate(state)
    chatActions.deleteProject('p1')
    expect(chatStore.state.projects).toEqual([])
    expect(chatStore.state.conversationsById.c1).toBeDefined()
    expect(chatStore.state.conversationsById.c1.projectId).toBeUndefined()
  })
  it('creates, moves, and rejects unknown projects', () => {
    chatActions.resetToEmpty()
    const pid = chatActions.createProject({ name: 'Work', notes: 'n' })!
    const cid = chatActions.createConversationInProject(pid)
    expect(chatStore.state.conversationsById[cid].projectId).toBe(pid)
    chatActions.setConversationProject(cid, 'missing')
    expect(chatStore.state.conversationsById[cid].projectId).toBeUndefined()
    chatActions.setConversationProject(cid, pid)
    chatActions.updateProject(pid, { name: 'Work2' })
    expect(chatStore.state.projects[0].name).toBe('Work2')
    expect(chatActions.createProject({ name: ' ' })).toBeUndefined()
  })
})

describe('export/import with projects', () => {
  it('round-trips projects and remaps colliding ids; old files still load', async () => {
    const { serializeAllChats, parseChatImport, mergeImportedChats } =
      await import('./chat-export')
    chatActions.resetToEmpty()
    const pid = chatActions.createProject({ name: 'P', notes: 'N' })!
    const cid = chatActions.createConversationInProject(pid)
    const parsed = parseChatImport(serializeAllChats(chatStore.state))
    if (!parsed.ok) throw new Error('parse failed')
    expect(parsed.state.projects[0].notes).toBe('N')
    expect(parsed.state.conversationsById[cid].projectId).toBe(pid)
    const merged = mergeImportedChats(chatStore.state, parsed.state, () => 'x1')
    expect(merged.state.projects).toHaveLength(1)
    const id = merged.addedIds[0]
    expect(merged.state.conversationsById[id].projectId).toBe(pid)
    const old = parseChatImport(
      JSON.stringify({
        conversationsById: { a: { id: 'a', title: 't', updatedAt: 1 } },
      }),
    )
    expect(old.ok && old.state.projects).toEqual([])
  })
})
