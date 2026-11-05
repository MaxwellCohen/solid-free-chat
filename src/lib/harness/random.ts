/** Seedable RNG + dice / coin / pick helpers. */

export type Rng = () => number

/** mulberry32: small deterministic PRNG returning [0, 1). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MAX_DICE = 100
const MAX_SIDES = 1000

export type RollResult =
  | {
      ok: true
      expression: string
      rolls: number[]
      modifier: number
      total: number
    }
  | { ok: false; error: string }

export function rollDice(
  expression: string,
  rng: Rng = Math.random,
): RollResult {
  const m = /^\s*(\d*)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i.exec(expression)
  if (!m)
    return {
      ok: false,
      error: `Invalid dice expression "${expression}". Use e.g. "d20", "2d6+1".`,
    }
  const count = m[1] === '' ? 1 : Number(m[1])
  const sides = Number(m[2])
  const modifier = m[3] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0
  if (count < 1 || count > MAX_DICE)
    return { ok: false, error: `Dice count must be 1-${MAX_DICE}` }
  if (sides < 2 || sides > MAX_SIDES)
    return { ok: false, error: `Sides must be 2-${MAX_SIDES}` }
  const rolls = Array.from(
    { length: count },
    () => Math.floor(rng() * sides) + 1,
  )
  return {
    ok: true,
    expression: `${count}d${sides}${modifier ? (modifier > 0 ? '+' : '') + modifier : ''}`,
    rolls,
    modifier,
    total: rolls.reduce((s, r) => s + r, 0) + modifier,
  }
}

export function flipCoin(rng: Rng = Math.random): 'heads' | 'tails' {
  return rng() < 0.5 ? 'heads' : 'tails'
}

export function pickFrom(
  options: readonly string[],
  count = 1,
  rng: Rng = Math.random,
): { ok: true; picks: string[] } | { ok: false; error: string } {
  if (!Array.isArray(options) || options.length === 0) {
    return { ok: false, error: 'options must be a non-empty list' }
  }
  const n = Math.floor(count)
  if (!Number.isFinite(n) || n < 1 || n > options.length) {
    return { ok: false, error: `count must be between 1 and ${options.length}` }
  }
  // Partial Fisher-Yates: distinct picks.
  const pool = [...options]
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return { ok: true, picks: pool.slice(0, n) }
}
