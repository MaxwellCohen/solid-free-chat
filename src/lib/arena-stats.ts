const KEY = 'solid-free-chat-arena-wins'

export type ArenaWins = Record<string, number>

export function loadArenaWins(
  storage: Pick<Storage, 'getItem'> = localStorage,
): ArenaWins {
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return {}
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: ArenaWins = {}
    for (const [k, n] of Object.entries(v)) {
      if (typeof n === 'number' && Number.isFinite(n) && n > 0)
        out[k] = Math.floor(n)
    }
    return out
  } catch {
    return {}
  }
}

/** Adds one win for `modelId` and persists; returns the new tally. */
export function recordArenaWin(
  modelId: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): ArenaWins {
  const wins = loadArenaWins(storage)
  wins[modelId] = (wins[modelId] ?? 0) + 1
  try {
    storage.setItem(KEY, JSON.stringify(wins))
  } catch {
    /* ignore */
  }
  return wins
}

export function leaderboard(
  wins: ArenaWins,
  limit = 10,
): Array<{ modelId: string; wins: number }> {
  return Object.entries(wins)
    .map(([modelId, n]) => ({ modelId, wins: n }))
    .sort((a, b) => b.wins - a.wins || a.modelId.localeCompare(b.modelId))
    .slice(0, limit)
}
