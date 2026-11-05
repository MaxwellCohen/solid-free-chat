import { describe, expect, it } from 'vitest'
import { flipCoin, pickFrom, rollDice, seededRng } from './random'

describe('random helpers', () => {
  it('seeded rng is deterministic and in [0,1)', () => {
    const a = seededRng(42)
    const b = seededRng(42)
    const xs = Array.from({ length: 50 }, a)
    expect(xs).toEqual(Array.from({ length: 50 }, b))
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
    expect(seededRng(1)()).not.toBe(seededRng(2)())
  })
  it('rolls dice with modifiers', () => {
    const r = rollDice('2d6+1', seededRng(7))
    expect(r).toMatchObject({ ok: true, expression: '2d6+1', modifier: 1 })
    if (r.ok) {
      expect(r.rolls).toHaveLength(2)
      expect(r.rolls.every((n) => n >= 1 && n <= 6)).toBe(true)
      expect(r.total).toBe(r.rolls[0] + r.rolls[1] + 1)
    }
    expect(rollDice('2d6+1', seededRng(7))).toEqual(r)
    expect(rollDice('D20', seededRng(1))).toMatchObject({
      ok: true,
      expression: '1d20',
    })
    const neg = rollDice('3d4-2', seededRng(3))
    if (neg.ok) expect(neg.total).toBe(neg.rolls.reduce((a, b) => a + b, 0) - 2)
  })
  it('rejects bad dice', () => {
    for (const bad of ['', 'abc', '0d6', '101d6', '2d1', '2d1001', '2d6*3'])
      expect(rollDice(bad)).toMatchObject({ ok: false })
  })
  it('flips a coin', () => {
    expect(flipCoin(() => 0.1)).toBe('heads')
    expect(flipCoin(() => 0.9)).toBe('tails')
  })
  it('picks distinct options', () => {
    const r = pickFrom(['a', 'b', 'c', 'd'], 3, seededRng(5))
    expect(r.ok && new Set(r.picks).size).toBe(3)
    expect(pickFrom(['x'], 1)).toEqual({ ok: true, picks: ['x'] })
    expect(pickFrom([], 1)).toMatchObject({ ok: false })
    expect(pickFrom(['a'], 2)).toMatchObject({ ok: false })
    expect(pickFrom(['a'], 0)).toMatchObject({ ok: false })
  })
})
