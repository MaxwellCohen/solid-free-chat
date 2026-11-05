import { describe, expect, it } from 'vitest'
import { fuzzyScore, rankPaletteItems } from './command-palette'

describe('fuzzyScore', () => {
  it('matches subsequences case-insensitively', () => {
    expect(fuzzyScore('nct', 'New chat')).not.toBeNull()
    expect(fuzzyScore('NEW', 'new chat')).not.toBeNull()
  })
  it('returns null on mismatch', () => {
    expect(fuzzyScore('xyz', 'New chat')).toBeNull()
  })
  it('scores empty query as 0', () => {
    expect(fuzzyScore('  ', 'anything')).toBe(0)
  })
})

describe('rankPaletteItems', () => {
  const items = [
    { id: 'a', label: 'Toggle sidebar' },
    { id: 'b', label: 'New chat' },
    { id: 'c', label: 'Switch theme', keywords: 'dark light' },
  ]
  it('keeps order for empty query', () => {
    expect(rankPaletteItems(items, '').map((i) => i.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })
  it('ranks prefix matches first', () => {
    expect(rankPaletteItems(items, 'new')[0]?.id).toBe('b')
  })
  it('searches keywords', () => {
    expect(rankPaletteItems(items, 'dark').map((i) => i.id)).toEqual(['c'])
  })
  it('filters non-matches', () => {
    expect(rankPaletteItems(items, 'zzz')).toEqual([])
  })
})
