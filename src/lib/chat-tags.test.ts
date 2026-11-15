import { describe, expect, it } from 'vitest'
import {
  addTag,
  cleanTag,
  collectTags,
  filterByTag,
  normalizeTags,
  removeTag,
  toggleTagFilter,
} from './chat-tags'

describe('chat tags', () => {
  it('cleans tags', () => {
    expect(cleanTag('  #Work Stuff ')).toBe('work-stuff')
    expect(cleanTag('a'.repeat(30))).toHaveLength(20)
    expect(cleanTag('###')).toBe('')
  })
  it('normalizes: dedupes, caps at 5, drops junk', () => {
    expect(normalizeTags(['A', 'a', 3, '', 'b', 'c', 'd', 'e', 'f'])).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ])
    expect(normalizeTags('x, y')).toEqual(['x', 'y'])
    expect(normalizeTags(undefined)).toEqual([])
  })
  it('adds and removes', () => {
    expect(addTag(['a'], 'B, a')).toEqual(['a', 'b'])
    expect(addTag(['a', 'b', 'c', 'd', 'e'], 'f')).toHaveLength(5)
    expect(removeTag(['a', 'b'], 'a')).toEqual(['b'])
  })
  it('collects counts and filters', () => {
    const cs = [{ tags: ['a', 'b'] }, { tags: ['b'] }, {}]
    expect(collectTags(cs)).toEqual([
      { tag: 'b', count: 2 },
      { tag: 'a', count: 1 },
    ])
    expect(filterByTag(cs, 'a')).toHaveLength(1)
    expect(filterByTag(cs, null)).toHaveLength(3)
  })
  it('toggles the filter', () => {
    expect(toggleTagFilter(null, 'a')).toBe('a')
    expect(toggleTagFilter('a', 'a')).toBeNull()
    expect(toggleTagFilter('a', 'b')).toBe('b')
  })
})
