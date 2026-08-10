import { describe, expect, it } from 'vitest'
import { DEFAULT_CHAT_MODEL } from '../lib/chat-models'
import { normalizeChatAppState } from './chat.store'

describe('normalizeChatAppState', () => {
  it('returns null for non-objects', () => {
    expect(normalizeChatAppState(null)).toBeNull()
    expect(normalizeChatAppState('x')).toBeNull()
  })

  it('migrates legacy conversations array and customSystemMessage to skills', () => {
    const state = normalizeChatAppState({
      conversations: [
        {
          id: 'c1',
          title: 'Hello',
          updatedAt: 100,
          customSystemMessage: 'Be terse.',
          messages: [
            {
              id: 'm1',
              role: 'user',
              parts: [{ type: 'text', content: 'Hi' }],
            },
          ],
        },
      ],
      currentConversationId: 'c1',
      selectedModel: 'openrouter/free',
      savedSystemPrompts: [
        {
          id: 'p1',
          name: 'Saved',
          text: 'Always cite sources.',
          updatedAt: 50,
        },
      ],
    })

    expect(state).not.toBeNull()
    expect(state!.conversationOrder).toEqual(['c1'])
    expect(state!.conversationsById.c1.title).toBe('Hello')
    expect(state!.messagesByConversationId.c1).toHaveLength(1)

    const saved = state!.skills.find((s) => s.id === 'p1')
    expect(saved?.instructions).toBe('Always cite sources.')

    const migrated = state!.skills.find((s) => s.instructions === 'Be terse.')
    expect(migrated).toBeDefined()
    expect(state!.conversationsById.c1.skillIds).toEqual([migrated!.id])
    expect(state!.selectedModel).toBe('openrouter/free')
  })

  it('loads v2 persisted shape with skills and skillIds', () => {
    const state = normalizeChatAppState({
      conversationOrder: ['c2'],
      conversationsById: {
        c2: {
          id: 'c2',
          title: 'Skills chat',
          updatedAt: 200,
          skillIds: ['skill-a'],
        },
      },
      messagesByConversationId: {
        c2: [],
      },
      currentConversationId: 'c2',
      selectedModel: 'provider/model',
      skills: [
        {
          id: 'skill-a',
          name: 'A',
          instructions: 'Do A.',
          updatedAt: 1,
        },
      ],
    })

    expect(state).not.toBeNull()
    expect(state!.skills).toHaveLength(1)
    expect(state!.conversationsById.c2.skillIds).toEqual(['skill-a'])
    expect(state!.selectedModel).toBe('provider/model')
  })

  it('drops unknown skillIds and falls back to default model', () => {
    const state = normalizeChatAppState({
      conversationOrder: ['c3'],
      conversationsById: {
        c3: {
          id: 'c3',
          title: 'Orphan ids',
          updatedAt: 1,
          skillIds: ['gone'],
        },
      },
      messagesByConversationId: {},
      currentConversationId: 'c3',
      selectedModel: '   ',
      skills: [],
    })

    expect(state).not.toBeNull()
    expect(state!.conversationsById.c3.skillIds).toEqual([])
    expect(state!.selectedModel).toBe(DEFAULT_CHAT_MODEL)
  })
})
