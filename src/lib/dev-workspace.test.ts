import { describe, expect, it } from 'vitest'
import { createWorkspaceTools, normalizePath } from './dev-workspace'
import type { Files, WorkspaceStore } from './dev-workspace'

describe('normalizePath', () => {
  it('normalizes relative paths', () => {
    expect(normalizePath('src//./a.js')).toBe('src/a.js')
    expect(normalizePath('/main.js')).toBe('main.js')
    expect(normalizePath('..\\a.js', 'src')).toBe('a.js')
  })

  it('rejects empty paths and escapes from the workspace root', () => {
    expect(normalizePath('')).toBeUndefined()
    expect(normalizePath('.')).toBeUndefined()
    expect(normalizePath('../secret')).toBeUndefined()
    expect(normalizePath('a/../../b')).toBeUndefined()
  })

  it('resolves against a base directory', () => {
    expect(normalizePath('./util.js', 'src/lib')).toBe('src/lib/util.js')
    expect(normalizePath('../util.js', 'src/lib')).toBe('src/util.js')
  })
})

function makeStore(initial: Files): WorkspaceStore & { files: () => Files } {
  let files = { ...initial }
  return {
    files: () => files,
    write: (path, content) => {
      files = { ...files, [path]: content }
    },
    remove: (path) => {
      const { [path]: _gone, ...rest } = files
      files = rest
    },
    build: () => Promise.resolve({ ok: true, html: '', warnings: [] }),
  }
}

type Runnable = {
  name: string
  execute: (input: unknown) => Promise<unknown> | unknown
}

function toolByName(tools: unknown[], name: string): Runnable {
  const tool = (tools as Runnable[]).find((t) => t.name === name)
  if (!tool) throw new Error(`no tool ${name}`)
  return tool
}

describe('workspace tools', () => {
  it('writes, reads, lists and deletes files', async () => {
    const store = makeStore({ 'main.js': 'a' })
    const tools = createWorkspaceTools(store)

    await toolByName(tools, 'write_file').execute({
      path: './src/x.js',
      content: 'b',
    })
    expect(store.files()['src/x.js']).toBe('b')

    expect(
      await toolByName(tools, 'read_file').execute({ path: 'src/x.js' }),
    ).toEqual({
      ok: true,
      content: 'b',
    })
    expect(await toolByName(tools, 'read_file').execute({})).toEqual({
      ok: true,
      files: ['main.js', 'src/x.js'],
    })

    await toolByName(tools, 'delete_file').execute({ path: 'src/x.js' })
    expect('src/x.js' in store.files()).toBe(false)
  })

  it('refuses paths outside the workspace', async () => {
    const store = makeStore({})
    const tools = createWorkspaceTools(store)
    expect(
      await toolByName(tools, 'write_file').execute({
        path: '../x',
        content: 'b',
      }),
    ).toEqual({ ok: false, error: 'Invalid path.' })
    expect(Object.keys(store.files())).toHaveLength(0)
  })
})
