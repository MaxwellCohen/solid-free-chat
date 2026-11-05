import { describe, expect, it } from 'vitest'
import {
  appendQuoteToDraft,
  selectionToBlockquote,
  MAX_QUOTE_CHARS,
} from './quote'

describe('selectionToBlockquote', () => {
  it('quotes each line and ends with a blank line', () => {
    expect(selectionToBlockquote('  one\ntwo  ')).toBe('> one\n> two\n\n')
  })
  it('keeps paragraph gaps as bare >', () => {
    expect(selectionToBlockquote('a\n\nb')).toBe('> a\n>\n> b\n\n')
  })
  it('returns empty for blank input', () => {
    expect(selectionToBlockquote(' \n ')).toBe('')
  })
  it('caps length', () => {
    const out = selectionToBlockquote('x'.repeat(MAX_QUOTE_CHARS + 50))
    expect(out.startsWith('> ')).toBe(true)
    expect(out.includes('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(MAX_QUOTE_CHARS + 5)
  })
})

describe('appendQuoteToDraft', () => {
  it('uses the quote alone for an empty draft', () => {
    expect(appendQuoteToDraft('  ', '> q\n\n')).toBe('> q\n\n')
  })
  it('separates from existing text', () => {
    expect(appendQuoteToDraft('hi\n', '> q\n\n')).toBe('hi\n\n> q\n\n')
  })
})
