import { toolDefinition } from '@tanstack/ai'
import type { Tool } from '@tanstack/ai'
import type * as EsbuildApi from 'esbuild-wasm/esm/browser.js'

/**
 * In-memory front-end workspace: files live in a map, esbuild-wasm (MIT) bundles
 * them in the tab, and the result runs in a sandboxed iframe. Nothing leaves
 * the browser. Only local imports are supported (no npm / CDN).
 */

export type Files = Record<string, string>

export const STARTER_FILES: Files = {
  'index.html':
    '<!doctype html>\n<html>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="./main.js"></script>\n  </body>\n</html>\n',
  'main.js':
    "document.querySelector('#app').textContent = 'Hello from the workspace'\n",
}

const ENTRIES = ['main.tsx', 'main.ts', 'main.jsx', 'main.js']
const EXTENSIONS = ['', '.tsx', '.ts', '.jsx', '.js', '.css', '.json']
const LOADERS: Record<string, EsbuildApi.Loader> = {
  tsx: 'tsx',
  ts: 'ts',
  jsx: 'jsx',
  js: 'js',
  mjs: 'js',
  css: 'css',
  json: 'json',
}

// Held on globalThis: esbuild-wasm may only be initialized once per page, and
// a hot-reloaded copy of this module would otherwise try again.
const globalBundler = globalThis as {
  __esbuildBundler?: Promise<typeof EsbuildApi>
}

/** Loaded on demand (client only) so the ~14 MB wasm stays out of the server bundle. */
function loadBundler(): Promise<typeof EsbuildApi> {
  globalBundler.__esbuildBundler ??= (async () => {
    const [api, { default: wasmURL }] = await Promise.all([
      import('esbuild-wasm/esm/browser.js'),
      import('esbuild-wasm/esbuild.wasm?url'),
    ])
    await api.initialize({ wasmURL })
    return api
  })()
  return globalBundler.__esbuildBundler
}

/** Resolves a model-supplied path to a safe workspace-relative one. */
export function normalizePath(path: string, from = ''): string | undefined {
  const out: string[] = []
  for (const part of `${from}/${path}`.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (out.length === 0) return undefined
      out.pop()
    } else out.push(part)
  }
  return out.length > 0 ? out.join('/') : undefined
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

function escapeScript(code: string): string {
  return code.replace(/<\/(script)/gi, '<\\/$1')
}

/** Forwards runtime errors and console output to the parent page. */
const PREVIEW_BRIDGE = `
const send = (level, args) => parent.postMessage({ source: 'dev-preview', level, text: args.map(String).join(' ') }, '*')
for (const level of ['log', 'warn', 'error']) {
  const original = console[level]
  console[level] = (...args) => { send(level, args); original.apply(console, args) }
}
addEventListener('error', (e) => send('error', [e.message]))
addEventListener('unhandledrejection', (e) => send('error', [e.reason]))
`

export type BuildResult =
  | { ok: true; html: string; warnings: string[] }
  | { ok: false; errors: string[] }

/** Bundles the workspace and returns a self-contained HTML document. */
export async function buildWorkspace(files: Files): Promise<BuildResult> {
  const html = files['index.html'] as string | undefined
  if (html === undefined) return { ok: false, errors: ['Missing index.html.'] }
  const entry = ENTRIES.find((name) => name in files)
  if (!entry) {
    return {
      ok: false,
      errors: ['Missing entry file (main.js, main.ts, main.jsx or main.tsx).'],
    }
  }
  const esbuild = await loadBundler()

  const resolveFile = (path: string) =>
    EXTENSIONS.map((ext) => `${path}${ext}`).find((p) => p in files)

  try {
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      outdir: 'out',
      format: 'esm',
      logLevel: 'silent',
      plugins: [
        {
          name: 'workspace-files',
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
              if (args.kind === 'entry-point')
                return { path: args.path, namespace: 'ws' }
              if (!args.path.startsWith('.') && !args.path.startsWith('/')) {
                return {
                  errors: [
                    {
                      text: `Cannot import "${args.path}": only local files are supported (no npm or CDN packages).`,
                    },
                  ],
                }
              }
              const base = args.path.startsWith('/')
                ? ''
                : dirname(args.importer)
              const target = normalizePath(args.path, base)
              const found = target && resolveFile(target)
              if (!found) {
                return {
                  errors: [
                    {
                      text: `Cannot find "${args.path}" (from ${args.importer}).`,
                    },
                  ],
                }
              }
              return { path: found, namespace: 'ws' }
            })
            build.onLoad({ filter: /.*/, namespace: 'ws' }, (args) => ({
              contents: files[args.path],
              loader: LOADERS[args.path.split('.').pop() ?? ''] ?? 'text',
            }))
          },
        },
      ],
    })
    const js =
      result.outputFiles.find((f) => f.path.endsWith('.js'))?.text ?? ''
    const css =
      result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? ''
    const page = html
      .replace(/<script\b[^>]*\bsrc=["'][^"']*["'][^>]*>\s*<\/script>/gi, '')
      .replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, '')
    const head = `<style>${css}</style><script>${escapeScript(PREVIEW_BRIDGE)}</script>`
    const body = `<script type="module">${escapeScript(js)}</script>`
    const doc = /<\/head>/i.test(page)
      ? page.replace(/<\/head>/i, () => `${head}</head>`)
      : /<body\b/i.test(page)
        ? page.replace(/<body\b/i, () => `${head}<body`)
        : `${head}${page}`
    return {
      ok: true,
      html: /<\/body>/i.test(doc)
        ? doc.replace(/<\/body>/i, () => `${body}</body>`)
        : doc + body,
      warnings: result.warnings.map((w) => w.text),
    }
  } catch (e) {
    const errors = (e as Partial<EsbuildApi.BuildFailure>).errors?.map((err) =>
      err.location
        ? `${err.location.file}:${err.location.line}:${err.location.column}: ${err.text}`
        : err.text,
    )
    return {
      ok: false,
      errors: errors?.length
        ? errors
        : [e instanceof Error ? e.message : 'Build failed.'],
    }
  }
}

export interface WorkspaceStore {
  files: () => Files
  write: (path: string, content: string) => void
  remove: (path: string) => void
  /** Rebuild and refresh the preview; returns the build result. */
  build: () => Promise<BuildResult>
}

const writeFileTool = toolDefinition({
  name: 'write_file',
  description:
    'Create or overwrite a file in the workspace (a front-end project bundled in the browser). Use relative paths.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path, e.g. src/util.js.' },
      content: { type: 'string', description: 'Full file contents.' },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },
})

const readFileTool = toolDefinition({
  name: 'read_file',
  description:
    'Read a file from the workspace. Call with no path to list all files.',
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Relative path.' } },
    additionalProperties: false,
  },
})

const deleteFileTool = toolDefinition({
  name: 'delete_file',
  description: 'Delete a file from the workspace.',
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Relative path.' } },
    required: ['path'],
    additionalProperties: false,
  },
})

const buildTool = toolDefinition({
  name: 'build',
  description:
    'Bundle the workspace and refresh the preview. Returns build errors, if any. Call after writing files.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
})

export function createWorkspaceTools(store: WorkspaceStore): Tool[] {
  return [
    writeFileTool.server((input) => {
      const { path, content } = input as { path: string; content: string }
      const safe = normalizePath(path)
      if (!safe) return { ok: false, error: 'Invalid path.' }
      store.write(safe, content)
      return { ok: true, path: safe }
    }),
    readFileTool.server((input) => {
      const { path } = input as { path?: string }
      if (!path) return { ok: true, files: Object.keys(store.files()).sort() }
      const safe = normalizePath(path)
      const content = safe === undefined ? undefined : store.files()[safe]
      return content === undefined
        ? { ok: false, error: `No such file: ${path}` }
        : { ok: true, content }
    }),
    deleteFileTool.server((input) => {
      const safe = normalizePath((input as { path: string }).path)
      if (!safe || !(safe in store.files()))
        return { ok: false, error: 'No such file.' }
      store.remove(safe)
      return { ok: true }
    }),
    buildTool.server(async () => {
      const result = await store.build()
      return result.ok ? { ok: true, warnings: result.warnings } : result
    }),
  ]
}

export const DEV_SYSTEM_PROMPT = [
  'You are a coding agent building a small front-end project that is bundled in the browser with esbuild.',
  'Tools: write_file, read_file, delete_file, build. The workspace starts with index.html and main.js (the entry; main.ts/jsx/tsx also work).',
  'index.html is the page; its local <script src> tags are replaced by the bundle of the entry file, so do not rely on them. Import other files with relative paths; CSS imports work.',
  'There is no npm, CDN or network import: use plain DOM APIs and your own modules. Call build after writing files and fix any errors it reports.',
  'Keep replies short; the user watches the files and preview update.',
].join(' ')
