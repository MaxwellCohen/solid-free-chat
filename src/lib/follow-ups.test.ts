import { describe, expect, it } from 'vitest'

import { buildFollowUpMessages, parseFollowUps } from './follow-ups'

describe('parseFollowUps', () => {
  it('parses a JSON array and caps at 3', () => {
    expect(parseFollowUps('["a?","b?","c?","d?"]')).toEqual(['a?', 'b?', 'c?'])
  })
  it('tolerates fences and prose around JSON', () => {
    expect(parseFollowUps('Sure:\n```json\n["One?", "Two?"]\n```')).toEqual([
      'One?',
      'Two?',
    ])
  })
  it('falls back to bullet / numbered lines and dedupes', () => {
    expect(parseFollowUps('1. Why?\n- How?\n* "Why?"\n2) When?')).toEqual([
      'Why?',
      'How?',
      'When?',
    ])
  })
  it('returns empty for junk', () => {
    expect(parseFollowUps('')).toEqual([])
    expect(parseFollowUps('[1,2]')).toEqual([])
  })
})

describe('buildFollowUpMessages', () => {
  it('includes both turns and clips long text', () => {
    const [m] = buildFollowUpMessages('hi', 'x'.repeat(5000))
    expect(m.role).toBe('user')
    expect(m.content).toContain('hi')
    expect(m.content.length).toBeLessThan(2500)
  })
})
