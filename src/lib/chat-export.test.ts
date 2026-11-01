import { describe, expect, it } from 'vitest'
import type { ChatAppState } from '../store/chat.store'
import {
  chatToMarkdown,
  exportFileName,
  mergeImportedChats,
  parseChatImport,
  serializeAllChats,
  serializeChat,
} from './chat-export'

function makeState(): ChatAppState {
  return {
    conversationOrder: ['a', 'b'],
    conversationsById: {
      a: { id: 'a', title: 'Alpha', updatedAt: 1, skillIds: ['s1'] },
      b: { id: 'b', title: 'Beta', updatedAt: 2, skillIds: [] },
    },
    messagesByConversationId: {
      a: [
        { id: 'm1', role: 'user', parts: [{ type: 'text', content: 'Hi' }] },
        {
          id: 'm2',
          role: 'assistant',
          parts: [
            { type: 'thinking', content: 'hmm' },
            { type: 'text', content: 'Hello' },
          ],
          createdAt: new Date(5),
        },
      ],
      b: [],
    },
    currentConversationId: 'a',
    selectedModel: 'x/y',
    skills: [
      { id: 's1', name: 'S', instructions: 'do', updatedAt: 1 },
      { id: 's2', name: 'T', instructions: 'no', updatedAt: 1 },
    ],
    enabledToolIds: [],
  }
}

describe('export', () => {
  it('markdown includes text only', () => {
    const md = chatToMarkdown(makeState(), 'a')!
    expect(md).toContain('# Alpha')
    expect(md).toContain('## User\n\nHi')
    expect(md).toContain('## Assistant\n\nHello')
    expect(md).not.toContain('hmm')
    expect(chatToMarkdown(makeState(), 'zzz')).toBeNull()
  })

  it('single chat JSON round-trips with only attached skills', () => {
    const json = serializeChat(makeState(), 'a')!
    const parsed = parseChatImport(json)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.state.conversationOrder).toEqual(['a'])
    expect(parsed.state.skills.map((s) => s.id)).toEqual(['s1'])
    expect(parsed.state.messagesByConversationId.a).toHaveLength(2)
    expect(serializeChat(makeState(), 'nope')).toBeNull()
  })

  it('backup round-trips all chats', () => {
    const parsed = parseChatImport(serializeAllChats(makeState()))
    expect(parsed.ok && parsed.state.conversationOrder).toEqual(['a', 'b'])
  })

  it('builds safe file names', () => {
    expect(exportFileName(' Hello, World! ', 'md')).toBe('hello-world.md')
    expect(exportFileName('???', 'json')).toBe('chat.json')
  })
})

describe('parseChatImport', () => {
  it.each([
    ['not json', 'Not JSON'],
    ['null', 'null'],
    ['array', '[]'],
    ['number', '5'],
    ['empty object', '{}'],
    ['wrong format', '{"format":"other","conversationsById":{}}'],
    ['no chats', '{"conversationsById":{}}'],
    ['bad conversationsById', '{"conversationsById":[1]}'],
  ])('rejects %s', (_, text) => {
    expect(parseChatImport(text).ok).toBe(false)
  })

  it('normalizes sloppy records and ignores bad messages', () => {
    const r = parseChatImport(
      JSON.stringify({
        conversationsById: { x: { title: 5 }, y: null },
        messagesByConversationId: { x: [null, 3, { id: 'm', role: 'user', parts: [] }] },
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.conversationsById.x.title).toBe('New chat')
    expect(r.state.messagesByConversationId.x).toHaveLength(1)
  })
})

describe('mergeImportedChats', () => {
  it('assigns fresh ids on collision and never overwrites', () => {
    const current = makeState()
    const imported = makeState()
    imported.conversationsById.a.title = 'Imported'
    imported.skills[0] = { id: 's1', name: 'Other', instructions: 'x', updatedAt: 9 }
    let n = 0
    const { state, addedIds } = mergeImportedChats(current, imported, () => `n${++n}`)
    expect(addedIds).toHaveLength(2)
    expect(addedIds.every((id) => id !== 'a' && id !== 'b')).toBe(true)
    expect(state.conversationsById.a.title).toBe('Alpha')
    expect(state.conversationOrder).toHaveLength(4)
    expect(state.currentConversationId).toBe(addedIds[0])
    const copy = state.conversationsById[addedIds[0]]
    expect(copy.title).toBe('Imported')
    expect(state.messagesByConversationId[addedIds[0]]).toHaveLength(2)
    // conflicting skill remapped, identical skill reused
    expect(state.skills).toHaveLength(3)
    expect(state.skills.find((s) => s.id === 's1')!.name).toBe('S')
    expect(copy.skillIds[0]).not.toBe('s1')
    expect(state.skills.find((s) => s.id === copy.skillIds[0])!.name).toBe('Other')
  })

  it('keeps ids when no collision', () => {
    const current = makeState()
    const imported = makeState()
    imported.conversationOrder = ['c']
    imported.conversationsById = { c: { id: 'c', title: 'C', updatedAt: 1, skillIds: [] } }
    imported.messagesByConversationId = { c: [] }
    const { state, addedIds } = mergeImportedChats(current, imported)
    expect(addedIds).toEqual(['c'])
    expect(state.conversationOrder).toEqual(['c', 'a', 'b'])
  })
})
