import { describe, expect, it } from 'vitest'
import {
  buildCompactMessages,
  contextUsage,
  estimateConversationTokens,
  estimateTokens,
  splitForCompact,
  summaryMessageText,
} from './context-meter'

const msgs = (roles: string[]) => roles.map((role, i) => ({ role, id: `${i}` }))

describe('context meter', () => {
  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('abcdefgh')).toBe(2)
    expect(estimateTokens('')).toBe(0)
    expect(estimateConversationTokens(['abcd', 'abcd'])).toBe(10)
  })

  it('shifts level at 70% and 90%', () => {
    expect(contextUsage(600, 1000)?.level).toBe('ok')
    expect(contextUsage(700, 1000)?.level).toBe('warn')
    expect(contextUsage(900, 1000)?.level).toBe('critical')
  })

  it('offers compaction only above 80%', () => {
    expect(contextUsage(800, 1000)?.canCompact).toBe(false)
    expect(contextUsage(801, 1000)?.canCompact).toBe(true)
  })

  it('returns null without a context length', () => {
    expect(contextUsage(10, undefined)).toBeNull()
    expect(contextUsage(10, 0)).toBeNull()
  })

  it('keeps the last 4 messages and starts the tail on a user turn', () => {
    const m = msgs([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
    ])
    const s = splitForCompact(m)!
    expect(s.recent).toHaveLength(4)
    expect(s.older).toHaveLength(4)
    const odd = msgs([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
      'assistant',
      'assistant',
      'assistant',
    ])
    const t = splitForCompact(odd)!
    expect(t.recent[0].role).toBe('user')
    expect(t.older.length + t.recent.length).toBe(odd.length)
  })

  it('returns null when there is nothing to compact', () => {
    expect(
      splitForCompact(msgs(['user', 'assistant', 'user', 'assistant'])),
    ).toBeNull()
    expect(splitForCompact(msgs(['user', 'assistant']))).toBeNull()
  })

  it('builds prompt and summary text', () => {
    const [p] = buildCompactMessages([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'yo' },
    ])
    expect(p.content).toContain('User: hi')
    expect(p.content).toContain('Assistant: yo')
    expect(summaryMessageText(' x ')).toBe(
      '[Summary of earlier conversation]\n\nx',
    )
  })
})
