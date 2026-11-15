import type { Files } from './dev-workspace'

export interface Snapshot {
  id: number
  label: string
  at: number
  files: Files
}

export const MAX_SNAPSHOTS = 20

export function pushSnapshot(stack: Snapshot[], snap: Snapshot): Snapshot[] {
  return [...stack, snap].slice(-MAX_SNAPSHOTS)
}

export function popSnapshot(stack: Snapshot[]): {
  stack: Snapshot[]
  snapshot?: Snapshot
} {
  return { stack: stack.slice(0, -1), snapshot: stack[stack.length - 1] }
}

export function modifiedPaths(base: Files, current: Files): Set<string> {
  const out = new Set<string>()
  for (const [path, content] of Object.entries(current)) {
    if (base[path] !== content) out.add(path)
  }
  return out
}

export type SavedWorkspaces = Record<string, Files>
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

export const WORKSPACES_KEY = 'dev-workspaces'

function defaultStorage(): KeyValueStorage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage
}

export function loadWorkspaces(
  storage: KeyValueStorage | undefined = defaultStorage(),
): SavedWorkspaces {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(WORKSPACES_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    const out: SavedWorkspaces = {}
    for (const [name, files] of Object.entries(parsed)) {
      if (!files || typeof files !== 'object') continue
      const clean: Files = {}
      for (const [p, c] of Object.entries(files)) {
        if (typeof c === 'string') clean[p] = c
      }
      out[name] = clean
    }
    return out
  } catch {
    return {}
  }
}

function persist(
  all: SavedWorkspaces,
  storage: KeyValueStorage | undefined,
): SavedWorkspaces {
  storage?.setItem(WORKSPACES_KEY, JSON.stringify(all))
  return all
}

export function saveWorkspace(
  name: string,
  files: Files,
  storage: KeyValueStorage | undefined = defaultStorage(),
): SavedWorkspaces {
  return persist({ ...loadWorkspaces(storage), [name]: { ...files } }, storage)
}

export function deleteWorkspace(
  name: string,
  storage: KeyValueStorage | undefined = defaultStorage(),
): SavedWorkspaces {
  const { [name]: _removed, ...rest } = loadWorkspaces(storage)
  return persist(rest, storage)
}
