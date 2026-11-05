import { describe, expect, it } from 'vitest'
import { DEFAULT_CHAT_MODEL } from '../lib/chat-models'
import { DEFAULT_ENABLED_TOOL_IDS } from '../lib/harness/tools'
import {
  normalizeChatAppState,
  snapshotVariants,
  switchVariantInMessages,
  withRegeneratedVariants,
} from './chat.store'
import type { ChatUIMessage } from './chat.store'

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
})

describe('reply variants', () => {
  const base = (m: unknown) => ({
    conversationOrder: ['c1'],
    conversationsById: {
      c1: { id: 'c1', title: 'T', updatedAt: 1, skillIds: [] },
    },
    messagesByConversationId: { c1: [m] },
    currentConversationId: 'c1',
    selectedModel: 'openrouter/free',
    skills: [],
    enabledToolIds: [],
  })
  const parts = (t: string) => [{ type: 'text', content: t }]

  it('keeps valid variants and clamps the index', () => {
    const state = normalizeChatAppState(
      base({
        id: 'a',
        role: 'assistant',
        parts: parts('two'),
        variants: [{ parts: parts('one') }, { parts: parts('two') }, 'junk'],
        variantIndex: 9,
      }),
    )
    const m = state?.messagesByConversationId.c1[0]
    expect(m?.variants).toHaveLength(2)
    expect(m?.variantIndex).toBe(1)
  })

  it('drops variants when fewer than two are valid (old data stays unchanged)', () => {
    const state = normalizeChatAppState(
      base({
        id: 'a',
        role: 'assistant',
        parts: parts('x'),
        variants: [{ parts: parts('x') }],
      }),
    )
    const m = state?.messagesByConversationId.c1[0]
    expect(m && 'variants' in m).toBe(false)
    expect(m && 'variantIndex' in m).toBe(false)
  })
})

describe('variant helpers', () => {
  const msg = (t: string, tokens?: number): ChatUIMessage =>
    ({
      id: 'a',
      role: 'assistant',
      parts: [{ type: 'text', content: t }],
      ...(tokens
        ? {
            tokenUsage: {
              promptTokens: 1,
              completionTokens: tokens,
              totalTokens: tokens + 1,
              recordedAt: 1,
            },
          }
        : {}),
    }) as ChatUIMessage
  const text = (m: ChatUIMessage) =>
    m.parts[0].type === 'text' ? m.parts[0].content : ''

  it('adds the regenerated reply as the active last variant', () => {
    const prev = snapshotVariants(msg('first', 3))
    const next = withRegeneratedVariants(msg('second'), prev)
    expect(next.variants?.map(text0)).toEqual(['first', 'second'])
    expect(next.variantIndex).toBe(1)
    expect(text(next)).toBe('second')
  })

  it('switching swaps parts and usage, and keeps edits to the active entry', () => {
    let next = withRegeneratedVariants(
      msg('second'),
      snapshotVariants(msg('first', 3)),
    )
    next = { ...next, tokenUsage: msg('', 7).tokenUsage }
    const [out] = switchVariantInMessages([next], 'a', 0)
    expect(text(out)).toBe('first')
    expect(out.tokenUsage?.completionTokens).toBe(3)
    expect(out.variantIndex).toBe(0)
    const [back] = switchVariantInMessages([out], 'a', 1)
    expect(text(back)).toBe('second')
    expect(back.tokenUsage?.completionTokens).toBe(7)
  })

  it('chains a third version and ignores out-of-range indexes', () => {
    const two = withRegeneratedVariants(msg('b'), snapshotVariants(msg('a')))
    const three = withRegeneratedVariants(msg('c'), snapshotVariants(two))
    expect(three.variants).toHaveLength(3)
    expect(switchVariantInMessages([three], 'a', 5)[0]).toBe(three)
  })
})

function text0(v: { parts: ChatUIMessage['parts'] }) {
  return v.parts[0].type === 'text' ? v.parts[0].content : ''
}
