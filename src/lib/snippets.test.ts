import { describe, expect, it } from 'vitest'
import {
  addSnippet,
  applyExpansion,
  expandPlaceholders,
  findTriggerBeforeCaret,
  findTriggerBeforeSeparator,
  isValidTrigger,
  parseSnippets,
} from './snippets'
import type { Snippet } from './snippets'

const snips: Snippet[] = [
  { id: '1', trigger: ';sig', text: 'Cheers' },
  { id: '2', trigger: ';a', text: 'A' },
]

describe('expandPlaceholders', () => {
  const now = new Date(2026, 0, 5, 9, 7)
  it('expands date, time and clipboard', () => {
    expect(
      expandPlaceholders('{{date}} {{time}} [{{clipboard}}] {{date}}', {
        now,
        clipboard: 'x$&y',
      }),
    ).toBe('2026-01-05 09:07 [x$&y] 2026-01-05')
  })
  it('uses an empty clipboard when unavailable', () => {
    expect(expandPlaceholders('a{{clipboard}}b', { now })).toBe('ab')
  })
})

describe('trigger detection', () => {
  it('matches at start and after whitespace', () => {
    expect(findTriggerBeforeCaret(';sig', 4, snips)?.snippet.id).toBe('1')
    const hit = findTriggerBeforeCaret('hi ;SIG', 7, snips)
    expect(hit).toMatchObject({ start: 3, end: 7 })
    expect(findTriggerBeforeCaret('hi\n;sig', 7, snips)).not.toBeNull()
  })
  it('does not match inside a word or a longer word', () => {
    expect(findTriggerBeforeCaret('foo;sig', 7, snips)).toBeNull()
    expect(findTriggerBeforeCaret(';signal', 7, snips)).toBeNull()
    expect(findTriggerBeforeCaret('a ;sigx', 7, snips)).toBeNull()
  })
  it('detects a trigger followed by a typed separator', () => {
    expect(findTriggerBeforeSeparator('x ;sig ', 7, snips)?.snippet.id).toBe(
      '1',
    )
    expect(findTriggerBeforeSeparator(';a\n', 3, snips)?.snippet.id).toBe('2')
    expect(findTriggerBeforeSeparator(';sig', 4, snips)).toBeNull()
    expect(findTriggerBeforeSeparator('x;sig ', 6, snips)).toBeNull()
  })
  it('never matches slash commands', () => {
    expect(isValidTrigger('/new')).toBe(false)
    expect(findTriggerBeforeCaret('/new', 4, snips)).toBeNull()
  })
})

describe('applyExpansion', () => {
  it('replaces the trigger and keeps the trailing separator', () => {
    const v = 'hi ;sig '
    const hit = findTriggerBeforeSeparator(v, v.length, snips)!
    expect(applyExpansion(v, hit, 'Cheers', hit.end)).toEqual({
      value: 'hi Cheers ',
      caret: 9,
    })
  })
  it('keeps text after the caret', () => {
    const hit = findTriggerBeforeCaret('a ;sig tail', 6, snips)!
    expect(applyExpansion('a ;sig tail', hit, 'Z').value).toBe('a Z tail')
  })
})

describe('storage helpers', () => {
  it('parses defensively and dedupes triggers', () => {
    const parsed = parseSnippets(
      JSON.stringify([
        { id: 'a', trigger: ';x', text: 'one' },
        { id: 'b', trigger: ';X', text: 'dup' },
        { trigger: 'bad', text: 'no' },
        { trigger: ';y', text: '' },
        null,
      ]),
    )
    expect(parsed.map((s) => s.trigger)).toEqual([';x'])
    expect(parseSnippets('not json')).toEqual([])
  })
  it('validates additions', () => {
    expect(addSnippet([], 'sig', 'x').ok).toBe(false)
    expect(addSnippet([], ';sig', '  ').ok).toBe(false)
    expect(addSnippet(snips, ';SIG', 'x').ok).toBe(false)
    const ok = addSnippet(snips, ';new', 'text')
    expect(ok.ok && ok.snippets).toHaveLength(3)
  })
})
