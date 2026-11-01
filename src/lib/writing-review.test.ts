import { describe, expect, it } from 'vitest'

import {
  applySuggestion,
  parseReviewComments,
  segmentText,
} from './writing-review'

describe('writing-review', () => {
  it('parses a JSON array wrapped in prose and drops malformed items', () => {
    const raw =
      'Here: [{"kind":"grammar","quote":"teh","comment":"typo","suggestion":"the"},{"quote":1},{"kind":"bogus","quote":"x","comment":"c"}] done'
    const out = parseReviewComments(raw)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ kind: 'grammar', suggestion: 'the' })
    expect(out[1].kind).toBe('style')
  })

  it('returns [] for unparseable output', () => {
    expect(parseReviewComments('no json')).toEqual([])
    expect(parseReviewComments('[oops]')).toEqual([])
  })

  it('segments text and reports unmatched/overlapping quotes', () => {
    const comments = parseReviewComments(
      '[{"quote":"hello world","comment":"a"},{"quote":"world","comment":"b"},{"quote":"nope","comment":"c"}]',
    )
    const { segments, unmatched } = segmentText('say hello world now', comments)
    expect(segments.map((s) => s.type)).toEqual(['text', 'mark', 'text'])
    expect(unmatched).toHaveLength(2)
  })

  it('applies a suggestion', () => {
    const [c] = parseReviewComments(
      '[{"quote":"teh","comment":"typo","suggestion":"the"}]',
    )
    expect(applySuggestion('fix teh typo', c)).toBe('fix the typo')
  })
})
