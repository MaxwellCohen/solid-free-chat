import { describe, expect, it } from 'vitest'
import { collectBookmarks, snippet } from './bookmarks'
import { toggleBookmarkInMessages } from '../store/chat.store'
import type { ChatUIMessage } from '../store/chat.store'

const msg = (id: string, bookmarked?: boolean): ChatUIMessage =>
  ({
    id,
    role: 'assistant',
    parts: [{ type: 'text', content: `text ${id}` }],
    ...(bookmarked ? { bookmarked } : {}),
  }) as ChatUIMessage

describe('bookmarks', () => {
  it('collects bookmarked messages across chats in order', () => {
    const conv = (id: string) => ({
      id,
      title: `T${id}`,
      updatedAt: 0,
      skillIds: [],
    })
    const out = collectBookmarks({
      conversationOrder: ['a', 'b', 'gone'],
      conversationsById: { a: conv('a'), b: conv('b') },
      messagesByConversationId: {
        a: [msg('1'), msg('2', true)],
        b: [msg('3', true)],
        gone: [msg('4', true)],
      },
    })
    expect(out.map((m) => [m.conversationId, m.messageId, m.text])).toEqual([
      ['a', '2', 'text 2'],
      ['b', '3', 'text 3'],
    ])
    expect(out[0].conversationTitle).toBe('Ta')
  })

  it('toggles the flag on and off', () => {
    const on = toggleBookmarkInMessages([msg('1')], '1')
    expect(on[0].bookmarked).toBe(true)
    const off = toggleBookmarkInMessages(on, '1')
    expect('bookmarked' in off[0]).toBe(false)
  })

  it('snippet flattens and truncates', () => {
    expect(snippet('a\n\n b')).toBe('a b')
    expect(snippet('x'.repeat(200), 10)).toHaveLength(10)
  })
})
