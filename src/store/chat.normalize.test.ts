import { describe, expect, it } from 'vitest'
import { DEFAULT_CHAT_MODEL } from '../lib/chat-models'
import { DEFAULT_ENABLED_TOOL_IDS } from '../lib/harness/tools'
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

  it('defaults enabled tools for older saves and drops unknown tool ids', () => {
    const base = {
      conversationOrder: [],
      conversationsById: {},
      messagesByConversationId: {},
      currentConversationId: null,
      selectedModel: DEFAULT_CHAT_MODEL,
      skills: [],
    }

    expect(normalizeChatAppState(base)!.enabledToolIds).toEqual(
      DEFAULT_ENABLED_TOOL_IDS,
    )
    expect(
      normalizeChatAppState({
        ...base,
        enabledToolIds: ['run_javascript', 'removed_tool', 'run_javascript'],
      })!.enabledToolIds,
    ).toEqual(['run_javascript'])
    expect(
      normalizeChatAppState({ ...base, enabledToolIds: [] })!.enabledToolIds,
    ).toEqual([])
  })

  describe('message validation', () => {
    const conv = { id: 'c1', title: 'T', updatedAt: 1, skillIds: [] }
    const load = (messages: unknown[], messageKey = 'c1') =>
      normalizeChatAppState({
        conversationsById: { c1: conv },
        messagesByConversationId: { [messageKey]: messages },
      })!.messagesByConversationId.c1

    it('drops messages with bad id, role or parts', () => {
      const good = {
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', content: 'a' }],
      }
      const out = load([
        good,
        { id: 2, role: 'user', parts: [] },
        { id: 'm3', role: 'robot', parts: [] },
        { id: 'm4', role: 'user' },
        { id: 'm5', role: 'user', parts: 'nope' },
        null,
      ])
      expect(out.map((m) => m.id)).toEqual(['m1'])
    })

    it('filters parts without a string type', () => {
      const out = load([
        {
          id: 'm1',
          role: 'assistant',
          parts: [
            { type: 'text', content: 'a' },
            null,
            { content: 'x' },
            { type: 5 },
            'str',
          ],
        },
      ])
      expect(out[0].parts).toEqual([{ type: 'text', content: 'a' }])
    })

    it('drops an invalid createdAt and keeps a valid one', () => {
      const out = load([
        { id: 'm1', role: 'user', parts: [], createdAt: 'garbage' },
        { id: 'm2', role: 'user', parts: [], createdAt: 1000 },
      ])
      expect(out[0].createdAt).toBeUndefined()
      expect(out[1].createdAt).toEqual(new Date(1000))
    })

    it('looks up messages by record key before the normalized id', () => {
      const out = normalizeChatAppState({
        conversationsById: { ' k1 ': { title: 'T', updatedAt: 1 } },
        messagesByConversationId: {
          ' k1 ': [{ id: 'm1', role: 'user', parts: [] }],
        },
      })!
      const id = out.conversationOrder[0]
      expect(out.messagesByConversationId[id].map((m) => m.id)).toEqual(['m1'])
    })
  })
})
