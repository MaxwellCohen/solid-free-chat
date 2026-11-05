import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_SKILLS,
  exportSkills,
  mergeSkills,
  parseSkillImport,
} from './skill-library'

const sk = (id: string, name: string, instructions = 'x') => ({
  id,
  name,
  instructions,
  updatedAt: 1,
})

describe('skill-library', () => {
  it('ships six unique built-ins', () => {
    expect(BUILT_IN_SKILLS).toHaveLength(6)
    expect(new Set(BUILT_IN_SKILLS.map((s) => s.name)).size).toBe(6)
  })

  it('round-trips export and import', () => {
    const text = exportSkills([sk('1', 'A', 'do a')])
    expect(parseSkillImport(text)).toEqual([
      { name: 'A', instructions: 'do a' },
    ])
    expect(text).not.toContain('"id"')
  })

  it('parses bare arrays and drops invalid rows', () => {
    expect(
      parseSkillImport(
        JSON.stringify([
          { name: ' B ', instructions: ' y ' },
          { name: 'c' },
          4,
        ]),
      ),
    ).toEqual([{ name: 'B', instructions: 'y' }])
    expect(parseSkillImport('nope')).toEqual([])
    expect(parseSkillImport('{"skills":5}')).toEqual([])
  })

  it('merges by name without id collisions', () => {
    let n = 0
    const makeId = () => `id${n++ < 2 ? 1 : n}` // first two collide with existing id1
    const r = mergeSkills(
      [sk('id1', 'Keep'), sk('id2', 'Edit', 'old')],
      [
        { name: 'edit', instructions: 'new' },
        { name: 'Fresh', instructions: 'f' },
        { name: 'FRESH', instructions: 'f' },
      ],
      makeId,
      5,
    )
    expect(r.added).toBe(1)
    expect(r.updated).toBe(1)
    expect(r.skills.find((s) => s.id === 'id2')?.instructions).toBe('new')
    const ids = r.skills.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(r.skills).toHaveLength(3)
  })

  it('is a no-op when everything already exists', () => {
    const r = mergeSkills(
      [sk('1', 'A', 'z')],
      [{ name: 'a', instructions: 'z' }],
      () => 'n',
    )
    expect(r).toMatchObject({ added: 0, updated: 0 })
  })
})
