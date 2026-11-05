import { describe, expect, it } from 'vitest'
import { leaderboard, loadArenaWins, recordArenaWin } from './arena-stats'
import { normalizeTargets, runArena } from './arena'
import type { ArenaChunk, ArenaColumn, ArenaRunner } from './arena'

const a = { providerId: 'openrouter', modelId: 'a' }
const b = { providerId: 'openrouter', modelId: 'b' }
const c = { providerId: 'openrouter', modelId: 'c' }

function memStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  }
}

describe('runArena', () => {
  it('runs in parallel; one failure does not affect others', async () => {
    const runner: ArenaRunner = async function* (
      t,
    ): AsyncGenerator<ArenaChunk> {
      if (t.modelId === 'b') throw new Error('boom')
      if (t.modelId === 'c') throw new Error('429 rate limit')
      yield { type: 'text', delta: 'he' }
      yield { type: 'text', delta: 'llo' }
      yield { type: 'usage', totalTokens: 7 }
    }
    const updates: number[] = []
    const res = await runArena({
      prompt: 'hi',
      targets: [a, b, c],
      runner,
      signal: new AbortController().signal,
      onUpdate: (i) => updates.push(i),
    })
    expect(res[0]).toMatchObject({
      status: 'done',
      text: 'hello',
      totalTokens: 7,
    })
    expect(res[1].status).toBe('error')
    expect(res[2].status).toBe('rate-limited')
    expect(res[2].error).toMatch(/retry/i)
    expect(new Set(updates)).toEqual(new Set([0, 1, 2]))
  })

  it('marks columns stopped on abort', async () => {
    const ac = new AbortController()
    const runner: ArenaRunner = async function* (_t, _p, signal) {
      yield { type: 'text', delta: 'x' }
      ac.abort()
      if (signal.aborted) throw new Error('aborted')
    }
    const last: ArenaColumn[] = []
    const res = await runArena({
      prompt: 'p',
      targets: [a, b],
      runner,
      signal: ac.signal,
      onUpdate: (i, col) => (last[i] = col),
    })
    expect(res.map((r) => r.status)).toEqual(['stopped', 'stopped'])
    expect(last[0].status).toBe('stopped')
  })

  it('tracks elapsed time with an injected clock', async () => {
    let t = 0
    const runner: ArenaRunner = async function* () {
      t += 500
      yield { type: 'text', delta: 'x' }
    }
    const [r] = await runArena({
      prompt: 'p',
      targets: [a],
      runner,
      signal: new AbortController().signal,
      onUpdate: () => {},
      now: () => t,
    })
    expect(r.elapsedMs).toBe(500)
  })
})

describe('normalizeTargets', () => {
  it('dedupes and caps at 3', () => {
    expect(normalizeTargets([a, a, b, c, { ...c, modelId: 'd' }])).toEqual([
      a,
      b,
      c,
    ])
  })
})

describe('arena stats', () => {
  it('records wins and ranks them', () => {
    const s = memStorage()
    recordArenaWin('x', s)
    recordArenaWin('y', s)
    recordArenaWin('y', s)
    expect(leaderboard(loadArenaWins(s))).toEqual([
      { modelId: 'y', wins: 2 },
      { modelId: 'x', wins: 1 },
    ])
  })
  it('tolerates corrupt data', () => {
    expect(loadArenaWins({ getItem: () => '[1' })).toEqual({})
  })
})
