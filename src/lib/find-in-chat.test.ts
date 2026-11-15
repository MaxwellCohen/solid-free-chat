import { describe, expect, it } from 'vitest'
import { findInMessages, stepMatch } from './find-in-chat'

describe('findInMessages', () => {
  const items = [
    { id: 'a', text: 'Hello hello world' },
    { id: 'b', text: 'nothing' },
    { id: 'c', text: 'HELLO' },
  ]
  it('finds case-insensitive occurrences in order', () => {
    expect(findInMessages(items, 'hello')).toEqual([
      { messageId: 'a', occurrence: 0 },
      { messageId: 'a', occurrence: 1 },
      { messageId: 'c', occurrence: 0 },
    ])
  })
  it('ignores empty queries', () => {
    expect(findInMessages(items, '  ')).toEqual([])
  })
  it('does not overlap', () => {
    expect(findInMessages([{ id: 'x', text: 'aaaa' }], 'aa')).toHaveLength(2)
  })
})

describe('stepMatch', () => {
  it('wraps', () => {
    expect(stepMatch(2, 3, 1)).toBe(0)
    expect(stepMatch(0, 3, -1)).toBe(2)
    expect(stepMatch(-1, 3, -1)).toBe(2)
    expect(stepMatch(-1, 0, 1)).toBe(-1)
  })
})
