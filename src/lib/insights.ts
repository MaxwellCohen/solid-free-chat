import type { ChatAppState } from '../store/chat.store'

export interface DayCount {
  /** Local date, YYYY-MM-DD. */
  day: string
  count: number
}

export interface ChatTokenRow {
  id: string
  title: string
  tokens: number
  messages: number
}

export interface Insights {
  chats: number
  messages: number
  tokens: number
  cost: number
  perDay: DayCount[]
  topByTokens: ChatTokenRow[]
  longest: ChatTokenRow[]
  activeDays: number
  currentStreak: number
  longestStreak: number
}

export function dayKey(ms: number): string {
  const d = new Date(ms)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + delta).getTime())
}

function messageTime(
  message: { createdAt?: Date | string | number; tokenUsage?: { recordedAt: number } },
  fallback: number,
): number {
  const raw = message.createdAt
  if (raw != null) {
    const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime()
    if (Number.isFinite(t)) return t
  }
  return message.tokenUsage?.recordedAt ?? fallback
}

export function computeInsights(
  state: Pick<
    ChatAppState,
    'conversationOrder' | 'conversationsById' | 'messagesByConversationId'
  >,
  now = Date.now(),
  days = 30,
  topN = 8,
): Insights {
  const counts = new Map<string, number>()
  const rows: ChatTokenRow[] = []
  let messages = 0
  let tokens = 0
  let cost = 0
  for (const id of state.conversationOrder) {
    const convo = state.conversationsById[id]!
    const list = state.messagesByConversationId[id] ?? []
    let chatTokens = 0
    let chatCost = 0
    for (const m of list) {
      const key = dayKey(messageTime(m, convo.updatedAt))
      counts.set(key, (counts.get(key) ?? 0) + 1)
      chatTokens += m.tokenUsage?.totalTokens ?? 0
      chatCost += m.tokenUsage?.cost ?? 0
    }
    chatTokens = Math.max(chatTokens, convo.sessionTotalTokens ?? 0)
    chatCost = Math.max(chatCost, convo.sessionTotalCost ?? 0)
    messages += list.length
    tokens += chatTokens
    cost += chatCost
    rows.push({ id, title: convo.title || 'Untitled chat', tokens: chatTokens, messages: list.length })
  }

  const today = dayKey(now)
  const perDay: DayCount[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = shiftDay(today, -i)
    perDay.push({ day, count: counts.get(day) ?? 0 })
  }

  const active = [...counts.keys()].sort()
  let longestStreak = 0
  let run = 0
  let prev: string | null = null
  for (const day of active) {
    run = prev && shiftDay(prev, 1) === day ? run + 1 : 1
    longestStreak = Math.max(longestStreak, run)
    prev = day
  }
  // Streak may end today or yesterday.
  let currentStreak = 0
  let cursor = counts.has(today) ? today : shiftDay(today, -1)
  while (counts.has(cursor)) {
    currentStreak++
    cursor = shiftDay(cursor, -1)
  }

  return {
    chats: rows.length,
    messages,
    tokens,
    cost,
    perDay,
    topByTokens: rows
      .filter((r) => r.tokens > 0)
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, topN),
    longest: [...rows].sort((a, b) => b.messages - a.messages).slice(0, 5),
    activeDays: active.length,
    currentStreak,
    longestStreak,
  }
}
