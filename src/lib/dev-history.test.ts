import { describe, expect, it } from 'vitest'
import {
  MAX_SNAPSHOTS,
  deleteWorkspace,
  loadWorkspaces,
  modifiedPaths,
  popSnapshot,
  pushSnapshot,
  saveWorkspace,
} from './dev-history'
import type { KeyValueStorage, Snapshot } from './dev-history'

const snap = (id: number): Snapshot => ({
  id,
  label: `s${id}`,
  at: id,
  files: { 'a.js': String(id) },
})

const memory = (): KeyValueStorage => {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  }
}

describe('snapshot stack', () => {
  it('pushes, pops and caps', () => {
    let s: Snapshot[] = []
    for (let i = 0; i < MAX_SNAPSHOTS + 5; i++) s = pushSnapshot(s, snap(i))
    expect(s).toHaveLength(MAX_SNAPSHOTS)
    const r = popSnapshot(s)
    expect(r.snapshot?.id).toBe(MAX_SNAPSHOTS + 4)
    expect(r.stack).toHaveLength(MAX_SNAPSHOTS - 1)
    expect(popSnapshot([]).snapshot).toBeUndefined()
  })
})

describe('modifiedPaths', () => {
  it('flags changed and new files', () => {
    const m = modifiedPaths({ a: '1', b: '2' }, { a: '1', b: '3', c: '' })
    expect([...m].sort()).toEqual(['b', 'c'])
  })
})

describe('saved workspaces', () => {
  it('saves, loads and deletes', () => {
    const st = memory()
    saveWorkspace('one', { 'a.js': 'x' }, st)
    saveWorkspace('two', { 'b.js': 'y' }, st)
    expect(Object.keys(loadWorkspaces(st)).sort()).toEqual(['one', 'two'])
    expect(deleteWorkspace('one', st)).toEqual({ two: { 'b.js': 'y' } })
    expect(loadWorkspaces(st)).toEqual({ two: { 'b.js': 'y' } })
  })
  it('tolerates junk', () => {
    const st = memory()
    st.setItem('dev-workspaces', '[1')
    expect(loadWorkspaces(st)).toEqual({})
  })
})
