export type PaletteItem = {
  id: string
  label: string
  /** Secondary text (e.g. group or shortcut hint). */
  hint?: string
  /** Extra searchable words. */
  keywords?: string
}

/** Subsequence score: higher is better, null when `query` does not match. */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const t = text.toLowerCase()
  let score = 0
  let ti = 0
  let prev = -2
  for (const ch of q) {
    const idx = t.indexOf(ch, ti)
    if (idx === -1) return null
    score += 1
    if (idx === prev + 1) score += 3
    if (idx === 0 || /[\s\-_/]/.test(t[idx - 1] ?? '')) score += 2
    prev = idx
    ti = idx + 1
  }
  const substr = t.indexOf(q)
  if (substr === 0) score += 10
  else if (substr > 0) score += 5
  return score - t.length * 0.01
}

/** Filters and ranks items; keeps original order when the query is empty. */
export function rankPaletteItems<T extends PaletteItem>(
  items: readonly T[],
  query: string,
): T[] {
  if (!query.trim()) return [...items]
  const scored: Array<{ item: T; score: number; index: number }> = []
  items.forEach((item, index) => {
    const label = fuzzyScore(query, item.label)
    const extra = fuzzyScore(query, `${item.label} ${item.keywords ?? ''}`)
    const best = label != null ? label + 2 : extra != null ? extra : null
    if (best != null) scored.push({ item, score: best, index })
  })
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  return scored.map((s) => s.item)
}
