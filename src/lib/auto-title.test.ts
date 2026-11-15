import { describe, expect, it } from 'vitest'
import {
  buildAutoTitleMessages,
  localTitle,
  parseAutoTitle,
  shouldGenerateTitle,
} from './auto-title'

describe('auto-title', () => {
  it('parses and cleans model titles', () => {
    expect(parseAutoTitle('"Planning a Rust CLI tool."')).toBe(
      'Planning a Rust CLI tool',
    )
    expect(parseAutoTitle('Title: Fixing flaky tests')).toBe(
      'Fixing flaky tests',
    )
    expect(parseAutoTitle('one two three four five six seven eight')).toBe(
      'one two three four five six',
    )
    expect(parseAutoTitle('  \n  ')).toBeNull()
    expect(parseAutoTitle('""')).toBeNull()
  })
  it('builds a single user message', () => {
    const m = buildAutoTitleMessages('hi', 'hello')
    expect(m).toHaveLength(1)
    expect(m[0].content).toContain('hello')
  })
  it('local fallback uses the first words', () => {
    expect(
      localTitle('how do I `reverse` a list in python quickly please'),
    ).toBe('How do I reverse a list')
    expect(localTitle('   ')).toBeNull()
  })
  it('gates on first exchange, lock and toggle', () => {
    const base = { enabled: true, titleLocked: false, messageCount: 2 }
    expect(shouldGenerateTitle(base)).toBe(true)
    expect(shouldGenerateTitle({ ...base, enabled: false })).toBe(false)
    expect(shouldGenerateTitle({ ...base, titleLocked: true })).toBe(false)
    expect(shouldGenerateTitle({ ...base, messageCount: 4 })).toBe(false)
  })
})
