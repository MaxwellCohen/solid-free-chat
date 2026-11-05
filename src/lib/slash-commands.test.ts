import { describe, expect, it } from 'vitest'
import { findByName, matchSlashCommands, parseSlash } from './slash-commands'

describe('matchSlashCommands', () => {
  it('lists all for a bare slash', () => {
    expect(matchSlashCommands('/').length).toBeGreaterThan(10)
  })
  it('filters by prefix', () => {
    expect(matchSlashCommands('/su').map((c) => c.name)).toEqual(['summarize'])
  })
  it('is empty once a space or non-slash start is typed', () => {
    expect(matchSlashCommands('/skill x')).toEqual([])
    expect(matchSlashCommands('hi /new')).toEqual([])
  })
})

describe('parseSlash', () => {
  it('parses name and arg', () => {
    const p = parseSlash('/skill  My Skill ')
    expect(p?.command.name).toBe('skill')
    expect(p?.arg).toBe('My Skill')
  })
  it('returns null for unknown commands', () => {
    expect(parseSlash('/nope')).toBeNull()
    expect(parseSlash('hello')).toBeNull()
  })
})

describe('findByName', () => {
  const items = [
    { id: '1', name: 'Code review' },
    { id: '2', name: 'Concise' },
  ]
  it('prefers exact match', () => {
    expect(findByName(items, 'concise')?.id).toBe('2')
  })
  it('accepts unique partial', () => {
    expect(findByName(items, 'review')?.id).toBe('1')
  })
  it('rejects ambiguous', () => {
    expect(findByName(items, 'co')).toBeUndefined()
  })
})
