import { describe, expect, it } from 'vitest'
import { computeInsights, dayKey } from './insights'

const NOW = new Date(2026, 5, 10, 12).getTime()
const DAY = 86_400_000

function msg(offsetDays: number, tokens = 0) {
  const t = NOW - offsetDays * DAY
  return {
    id: String(Math.random()),
    role: 'user',
    parts: [],
    createdAt: new Date(t),
    ...(tokens
      ? {
          tokenUsage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: tokens,
            recordedAt: t,
          },
        }
      : {}),
  } as never
}

function state(chats: Record<string, { title: string; msgs: unknown[] }>) {
  const ids = Object.keys(chats)
  return {
    conversationOrder: ids,
    conversationsById: Object.fromEntries(
      ids.map((id) => [
        id,
        { id, title: chats[id].title, updatedAt: NOW, skillIds: [] },
      ]),
    ),
    messagesByConversationId: Object.fromEntries(
      ids.map((id) => [id, chats[id].msgs]),
    ),
  } as never
}

describe('computeInsights', () => {
  it('handles empty state', () => {
    const r = computeInsights(state({}), NOW)
    expect(r.chats).toBe(0)
    expect(r.perDay).toHaveLength(30)
    expect(r.currentStreak).toBe(0)
    expect(r.topByTokens).toEqual([])
  })

  it('totals, per-day, streaks and rankings', () => {
    const r = computeInsights(
      state({
        a: { title: 'A', msgs: [msg(0, 100), msg(1, 50), msg(2)] },
        b: { title: '', msgs: [msg(10, 500)] },
      }),
      NOW,
    )
    expect(r.chats).toBe(2)
    expect(r.messages).toBe(4)
    expect(r.tokens).toBe(650)
    expect(r.perDay.at(-1)).toEqual({ day: dayKey(NOW), count: 1 })
    expect(r.activeDays).toBe(4)
    expect(r.currentStreak).toBe(3)
    expect(r.longestStreak).toBe(3)
    expect(r.topByTokens[0].title).toBe('Untitled chat')
    expect(r.longest[0].id).toBe('a')
  })

  it('streak survives an idle today', () => {
    const r = computeInsights(
      state({ a: { title: 'A', msgs: [msg(1), msg(2)] } }),
      NOW,
    )
    expect(r.currentStreak).toBe(2)
  })
})
