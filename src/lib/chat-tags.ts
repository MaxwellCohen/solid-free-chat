export const MAX_TAGS = 5
export const MAX_TAG_LENGTH = 20

/** Lowercases, trims and collapses one tag; '' when nothing is left. */
export function cleanTag(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TAG_LENGTH)
    .replace(/-+$/, '')
}

/** Cleaned, de-duplicated tags capped at MAX_TAGS; tolerates unknown input. */
export function normalizeTags(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,\n]/)
      : []
  const out: string[] = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    const tag = cleanTag(item)
    if (tag && !out.includes(tag)) out.push(tag)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

/** Adds a tag (no-op when empty, duplicate, or at the limit). */
export function addTag(tags: readonly string[], raw: string): string[] {
  return normalizeTags([...tags, ...raw.split(',')])
}

export function removeTag(tags: readonly string[], tag: string): string[] {
  return tags.filter((t) => t !== tag)
}

/** Every tag in use with its chat count, most used first then alphabetical. */
export function collectTags(
  conversations: ReadonlyArray<{ tags?: readonly string[] }>,
): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>()
  for (const c of conversations) {
    for (const t of c.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/** Conversations carrying `tag`; all of them when `tag` is null. */
export function filterByTag<T extends { tags?: readonly string[] }>(
  conversations: readonly T[],
  tag: string | null,
): T[] {
  if (!tag) return [...conversations]
  return conversations.filter((c) => c.tags?.includes(tag))
}

/** Click a tag to filter, click the active one to clear. */
export function toggleTagFilter(
  active: string | null,
  tag: string,
): string | null {
  return active === tag ? null : tag
}
