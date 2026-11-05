import { describe, expect, it } from 'vitest'
import { stepMessageIndex, threadKeyAction } from './message-nav'

const key = (k: string, extra: Record<string, boolean> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
  ...extra,
})

describe('stepMessageIndex', () => {
  it('starts at the first (j) or last (k) message', () => {
    expect(stepMessageIndex(null, 4, 1)).toBe(0)
    expect(stepMessageIndex(null, 4, -1)).toBe(3)
  })
  it('moves and clamps', () => {
    expect(stepMessageIndex(1, 4, 1)).toBe(2)
    expect(stepMessageIndex(3, 4, 1)).toBe(3)
    expect(stepMessageIndex(0, 4, -1)).toBe(0)
  })
  it('handles empty and stale indexes', () => {
    expect(stepMessageIndex(2, 0, 1)).toBeNull()
    expect(stepMessageIndex(9, 3, 1)).toBe(0)
  })
})

describe('threadKeyAction', () => {
  it('maps bare keys', () => {
    expect(threadKeyAction(key('j'), false)).toBe('next')
    expect(threadKeyAction(key('k'), false)).toBe('prev')
    expect(threadKeyAction(key('c'), false)).toBe('copy')
    expect(threadKeyAction(key('b'), false)).toBe('bookmark')
    expect(threadKeyAction(key('Escape'), false)).toBe('clear')
    expect(threadKeyAction(key('x'), false)).toBeNull()
  })
  it('never fires while typing, composing, or with modifiers', () => {
    expect(threadKeyAction(key('j'), true)).toBeNull()
    expect(threadKeyAction(key('j', { isComposing: true }), false)).toBeNull()
    expect(threadKeyAction(key('b', { metaKey: true }), false)).toBeNull()
    expect(threadKeyAction(key('c', { ctrlKey: true }), false)).toBeNull()
    expect(threadKeyAction(key('j', { shiftKey: true }), false)).toBeNull()
  })
})
