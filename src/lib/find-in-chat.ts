export type FindItem = { id: string; text: string }
export type FindMatch = { messageId: string; occurrence: number }

/** Case-insensitive, non-overlapping occurrences of `query` in each message. */
export function findInMessages(items: FindItem[], query: string): FindMatch[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: FindMatch[] = []
  for (const item of items) {
    const hay = item.text.toLowerCase()
    let from = 0
    let occurrence = 0
    for (;;) {
      const at = hay.indexOf(q, from)
      if (at === -1) break
      out.push({ messageId: item.id, occurrence })
      occurrence++
      from = at + q.length
    }
  }
  return out
}

/** Wrap-around step through `count` matches; -1 when there are none. */
export function stepMatch(current: number, count: number, dir: 1 | -1): number {
  if (count <= 0) return -1
  if (current < 0) return dir === 1 ? 0 : count - 1
  return (current + dir + count) % count
}
