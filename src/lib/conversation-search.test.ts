import { describe, expect, it } from 'vitest'
import { searchSidebarConversations } from './conversation-search'
import type { HistoryConversation } from './harness/chat-history'

function chat(
  id: string,
  title: string,
  updatedAt: number,
  texts: string[] = [],
): HistoryConversation {
  return {
    id,
    title,
    updatedAt,
    messages: texts.map((content, i) => ({
      id: `${id}-${i}`,
      role: 'user' as const,
      parts: [{ type: 'text' as const, content }],
    })),
  }
}

describe('searchSidebarConversations', () => {
  const chats = [
    chat('a', 'Cooking', 1, ['How to bake  sourdough\nbread?']),
    chat('b', 'Sourdough tips', 2),
    chat('c', 'Other', 3, ['nothing here']),
  ]

  it('returns nothing for a blank query', () => {
    expect(searchSidebarConversations(chats, '   ')).toEqual([])
  })

  it('matches title and message text case-insensitively, newest first', () => {
    const out = searchSidebarConversations(chats, 'SOURDOUGH')
    expect(out.map((r) => r.id)).toEqual(['b', 'a'])
    expect(out[0].snippet).toBeUndefined()
    expect(out[1].snippet).toEqual({
      before: 'How to bake ',
      match: 'sourdough',
      after: ' bread?',
    })
  })

  it('truncates long snippets with ellipses', () => {
    const long = `${'x'.repeat(100)}needle${'y'.repeat(100)}`
    const [hit] = searchSidebarConversations(
      [chat('d', 't', 1, [long])],
      'needle',
    )
    expect(hit.snippet?.before.startsWith('…')).toBe(true)
    expect(hit.snippet?.after.endsWith('…')).toBe(true)
    expect(hit.snippet?.match).toBe('needle')
  })
})

describe('search message ids', () => {
  it('reports the message holding the snippet', () => {
    const out = searchSidebarConversations(
      [
        {
          id: 'c1',
          title: 'Chat',
          updatedAt: 1,
          messages: [
            {
              id: 'm1',
              role: 'user',
              parts: [{ type: 'text', content: 'hello' }],
            },
            {
              id: 'm2',
              role: 'assistant',
              parts: [{ type: 'text', content: 'needle here' }],
            },
          ],
        },
      ] as never,
      'needle',
    )
    expect(out[0].messageId).toBe('m2')
  })
})
