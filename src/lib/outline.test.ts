import { describe, expect, it } from 'vitest'
import {
  activeOutlineKey,
  buildOutline,
  parseHeadings,
  pickActiveMessage,
  truncateOutlineText,
} from './outline'

const msg = (id: string, role: string, content: string) => ({
  id,
  role,
  parts: [{ type: 'text', content }],
})

describe('parseHeadings', () => {
  it('finds h1-h3 and ignores h4+', () => {
    expect(parseHeadings('# A\n## B\n### C\n#### D\ntext')).toEqual([
      { level: 1, text: 'A' },
      { level: 2, text: 'B' },
      { level: 3, text: 'C' },
    ])
  })
  it('ignores headings inside code fences', () => {
    const md = '# Real\n```sh\n# comment\n```\n~~~\n## nope\n~~~\n## Also real'
    expect(parseHeadings(md).map((h) => h.text)).toEqual(['Real', 'Also real'])
  })
  it('requires a space and strips inline markdown and closing hashes', () => {
    expect(parseHeadings('#nospace\n## **Bold** `code` ##')).toEqual([
      { level: 2, text: 'Bold code' },
    ])
  })
})

describe('buildOutline', () => {
  it('lists user messages and assistant headings in order', () => {
    const items = buildOutline([
      msg('u1', 'user', 'How do I sort?'),
      msg('a1', 'assistant', '## Sorting\ntext\n### Stable'),
      msg('s', 'system', '# ignored'),
      msg('u2', 'user', 'x'.repeat(100)),
    ])
    expect(items.map((i) => [i.kind, i.level, i.messageIndex])).toEqual([
      ['user', 0, 0],
      ['heading', 2, 1],
      ['heading', 3, 1],
      ['user', 0, 3],
    ])
    expect(items[3].text.length).toBeLessThanOrEqual(60)
    expect(items[3].text.endsWith('…')).toBe(true)
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length)
  })
  it('handles attachment-only user messages', () => {
    const items = buildOutline([{ id: 'u', role: 'user', parts: [] }])
    expect(items[0].text).toBe('(attachment)')
  })
})

describe('truncateOutlineText', () => {
  it('collapses whitespace', () => {
    expect(truncateOutlineText('a \n  b')).toBe('a b')
  })
})

describe('pickActiveMessage', () => {
  const tops = [
    { id: 'a', top: -300 },
    { id: 'b', top: -10 },
    { id: 'c', top: 200 },
  ]
  it('picks the last message starting above the offset', () => {
    expect(pickActiveMessage(tops)).toBe('b')
  })
  it('falls back to the first and handles empty', () => {
    expect(pickActiveMessage([{ id: 'c', top: 200 }])).toBe('c')
    expect(pickActiveMessage([])).toBeNull()
  })
})

describe('activeOutlineKey', () => {
  const items = buildOutline([
    msg('u1', 'user', 'hi'),
    msg('a1', 'assistant', 'plain'),
    msg('u2', 'user', 'again'),
    msg('a2', 'assistant', '# T'),
  ])
  it('maps a message without items to the previous item', () => {
    expect(activeOutlineKey(items, 1)).toBe('u1:u')
    expect(activeOutlineKey(items, 3)).toBe('a2:h0')
    expect(activeOutlineKey(items, null)).toBeNull()
  })
})
