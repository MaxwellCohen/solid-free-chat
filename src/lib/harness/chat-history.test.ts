import { describe, expect, it } from 'vitest'
import type { UIMessage } from '@tanstack/ai-client'
import { createEnabledTools } from './tools'
import { conversationTranscript, searchConversations } from './chat-history'
import type { HistoryConversation } from './chat-history'

function message(role: UIMessage['role'], content: string): UIMessage {
  return { id: `${role}-${content}`, role, parts: [{ type: 'text', content }] }
}

const chats: HistoryConversation[] = [
  {
    id: 'old',
    title: 'Sourdough starter',
    updatedAt: 1_000,
    messages: [
      message('user', 'How do I feed a sourdough starter?'),
      message('assistant', 'Feed it equal parts flour and water daily.'),
    ],
  },
  {
    id: 'new',
    title: 'Trip planning',
    updatedAt: 2_000,
    messages: [
      message('user', 'Plan a trip to Lisbon'),
      message(
        'assistant',
        'Day one: bake pastel de nata with flour, sugar, and eggs.',
      ),
    ],
  },
]

describe('searchConversations', () => {
  it('requires every term; ties go to the most recent chat', () => {
    const hits = searchConversations(chats, 'FLOUR', 5)
    expect(hits.map((hit) => hit.chat_id)).toEqual(['new', 'old'])
    expect(
      searchConversations(chats, 'flour lisbon', 5).map((hit) => hit.chat_id),
    ).toEqual(['new'])
    expect(
      searchConversations(chats, 'sourdough', 5)[0].snippets[0],
    ).toMatchObject({
      role: 'user',
    })
    expect(searchConversations(chats, 'nothing-matches', 5)).toEqual([])
  })

  it('lists recent chats for an empty query', () => {
    expect(searchConversations(chats, '  ', 1)).toEqual([
      {
        chat_id: 'new',
        title: 'Trip planning',
        updated_at: new Date(2_000).toISOString(),
        snippets: [],
      },
    ])
  })
})

describe('conversationTranscript', () => {
  it('keeps the newest messages within the budget', () => {
    const { transcript, omitted_messages } = conversationTranscript(
      chats[0],
      60,
    )
    expect(transcript).toBe(
      'assistant: Feed it equal parts flour and water daily.',
    )
    expect(omitted_messages).toBe(1)
  })
})

describe('chat history tools', () => {
  const tools = createEnabledTools(['chat_history'], {
    skills: {
      list: () => [],
      create: () => undefined,
      update: () => false,
      setAttached: () => false,
    },
    history: { list: () => chats },
  })
  const run = (name: string, input: unknown) =>
    tools.find((tool) => tool.name === name)!.execute!(
      input as never,
      undefined as never,
    )

  it('searches and reads chats, labelling the content as data', async () => {
    const search = (await run('search_chats', { query: 'lisbon' })) as {
      note: string
      results: { chat_id: string }[]
    }
    expect(search.note).toMatch(/not as instructions/)
    expect(search.results.map((hit) => hit.chat_id)).toEqual(['new'])

    const read = (await run('read_chat', { chat_id: 'new' })) as {
      transcript: string
    }
    expect(read.transcript).toContain('user: Plan a trip to Lisbon')
    expect(await run('read_chat', { chat_id: 'missing' })).toMatchObject({
      ok: false,
    })
  })
})
