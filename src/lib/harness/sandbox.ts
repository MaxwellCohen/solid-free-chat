/**
 * Browser code sandbox for harness tools.
 *
 * Code runs in a Web Worker spawned inside a `sandbox="allow-scripts"` iframe
 * (opaque origin), so it cannot read the app's localStorage, cookies, API key,
 * or DOM. Each run has a hard timeout enforced by terminating the worker.
 *
 * - `javascript`: fresh worker per run.
 * - `python`: one long-lived Pyodide worker so variables/imports persist across
 *   calls; it is recreated after a timeout.
 */

export type SandboxLanguage = 'javascript' | 'python'

export type SandboxResult = {
  ok: boolean
  /** Captured console / stdout / stderr lines. */
  output: string
  /** Stringified return value (JS) or last expression (Python). */
  result?: string
  error?: string
  timedOut?: boolean
}

export const PYODIDE_VERSION = '0.29.5'
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

const JS_WORKER_SOURCE = String.raw`
const lines = []
const fmt = (v) => {
  if (typeof v === 'string') return v
  if (v instanceof Error) return v.stack || String(v)
  try { return JSON.stringify(v, null, 2) ?? String(v) } catch { return String(v) }
}
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => {
    const prefix = level === 'log' || level === 'info' ? '' : '[' + level + '] '
    lines.push(prefix + args.map(fmt).join(' '))
  }
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
// Models often send a bare expression ("2 ** 10"); evaluate those directly,
// otherwise treat the code as an async function body.
function compile(code) {
  const expression = code.trim().replace(/;+$/, '')
  try {
    return new AsyncFunction('return (' + expression + '\n)')
  } catch {
    return new AsyncFunction(code)
  }
}
self.onmessage = async (event) => {
  try {
    const value = await compile(event.data.code)()
    self.postMessage({ ok: true, output: lines.join('\n'), result: value === undefined ? undefined : fmt(value) })
  } catch (err) {
    self.postMessage({ ok: false, output: lines.join('\n'), error: fmt(err) })
  }
}
`

const PYTHON_WORKER_SOURCE = String.raw`
importScripts(${JSON.stringify(`${PYODIDE_INDEX_URL}pyodide.js`)})
const ready = loadPyodide({ indexURL: ${JSON.stringify(PYODIDE_INDEX_URL)} })
self.onmessage = async (event) => {
  const lines = []
  let pyodide
  try {
    pyodide = await ready
  } catch (err) {
    self.postMessage({ ok: false, output: '', error: 'Failed to load Pyodide: ' + String(err) })
    return
  }
  pyodide.setStdout({ batched: (s) => lines.push(s) })
  pyodide.setStderr({ batched: (s) => lines.push('[stderr] ' + s) })
  try {
    await pyodide.loadPackagesFromImports(event.data.code, { messageCallback: () => {} })
    let value = await pyodide.runPythonAsync(event.data.code)
    let result
    if (value !== undefined && value !== null) {
      result = String(value)
      if (typeof value.destroy === 'function') value.destroy()
    }
    self.postMessage({ ok: true, output: lines.join('\n'), result })
  } catch (err) {
    self.postMessage({ ok: false, output: lines.join('\n'), error: String(err && err.message || err) })
  }
}
`

/** Runs inside the sandboxed iframe; brokers runs between the app and workers. */
const SANDBOX_HOST_SOURCE = String.raw`
const sources = { javascript: ${JSON.stringify(JS_WORKER_SOURCE)}, python: ${JSON.stringify(PYTHON_WORKER_SOURCE)} }
const urls = {}
let pythonWorker = null

function workerUrl(language) {
  urls[language] ??= URL.createObjectURL(new Blob([sources[language]], { type: 'text/javascript' }))
  return urls[language]
}

function acquire(language) {
  if (language === 'python') {
    pythonWorker ??= new Worker(workerUrl('python'))
    return pythonWorker
  }
  return new Worker(workerUrl('javascript'))
}

function release(language, worker, kill) {
  if (language === 'python' && !kill) return
  worker.terminate()
  if (language === 'python') pythonWorker = null
}

// Python runs are serialized so concurrent calls never share stdout capture.
let pythonQueue = Promise.resolve()

function run({ id, language, code, timeoutMs }) {
  const exec = () => new Promise((resolve) => {
    let worker
    try {
      worker = acquire(language)
    } catch (err) {
      resolve({ id, ok: false, output: '', error: 'Could not start sandbox worker: ' + String(err) })
      return
    }
    const timer = setTimeout(() => {
      worker.onmessage = null
      release(language, worker, true)
      resolve({ id, ok: false, output: '', timedOut: true, error: 'Timed out after ' + timeoutMs + 'ms' + (language === 'python' ? ' (Python state was reset)' : '') })
    }, timeoutMs)
    worker.onmessage = (event) => {
      clearTimeout(timer)
      worker.onmessage = null
      release(language, worker, false)
      resolve({ id, ...event.data })
    }
    worker.onerror = (event) => {
      clearTimeout(timer)
      release(language, worker, true)
      resolve({ id, ok: false, output: '', error: event.message || 'Worker error' })
    }
    worker.postMessage({ code })
  })
  if (language !== 'python') return exec()
  const next = pythonQueue.then(exec)
  pythonQueue = next.catch(() => {})
  return next
}

window.addEventListener('message', async (event) => {
  if (event.source !== parent || !event.data || event.data.type !== 'run') return
  parent.postMessage({ type: 'result', ...(await run(event.data)) }, '*')
})
parent.postMessage({ type: 'ready' }, '*')
`

type PendingRun = (result: SandboxResult) => void

let frame: HTMLIFrameElement | null = null
let frameReady: Promise<HTMLIFrameElement> | null = null
const pending = new Map<string, PendingRun>()

function ensureFrame(): Promise<HTMLIFrameElement> {
  if (frameReady) return frameReady
  frameReady = new Promise((resolve) => {
    const el = document.createElement('iframe')
    el.setAttribute('sandbox', 'allow-scripts')
    el.setAttribute('aria-hidden', 'true')
    el.tabIndex = -1
    el.style.display = 'none'
    el.srcdoc = `<!doctype html><meta charset="utf-8"><script>${SANDBOX_HOST_SOURCE.replace(/<\/script/gi, '<\\/script')}</script>`

    const onMessage = (event: MessageEvent) => {
      if (event.source !== el.contentWindow) return
      const data = event.data as { type?: string; id?: string } & SandboxResult
      if (data.type === 'ready') {
        resolve(el)
        return
      }
      if (data.type === 'result' && data.id) {
        const done = pending.get(data.id)
        pending.delete(data.id)
        done?.({
          ok: data.ok,
          output: data.output ?? '',
          result: data.result,
          error: data.error,
          timedOut: data.timedOut,
        })
      }
    }
    window.addEventListener('message', onMessage)
    document.body.appendChild(el)
    frame = el
  })
  return frameReady
}

export async function runInSandbox(
  language: SandboxLanguage,
  code: string,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<SandboxResult> {
  if (typeof document === 'undefined') {
    return { ok: false, output: '', error: 'Sandbox is only available in the browser.' }
  }
  const el = await ensureFrame()
  const id = crypto.randomUUID()
  return new Promise<SandboxResult>((resolve) => {
    // Backstop in case the iframe itself is wedged (e.g. worker creation blocked).
    const backstop = setTimeout(
      () => {
        pending.delete(id)
        resolve({ ok: false, output: '', timedOut: true, error: 'Sandbox did not respond.' })
      },
      options.timeoutMs + 5_000,
    )
    const onAbort = () => {
      clearTimeout(backstop)
      pending.delete(id)
      resolve({ ok: false, output: '', error: 'Aborted.' })
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })
    pending.set(id, (result) => {
      clearTimeout(backstop)
      options.signal?.removeEventListener('abort', onAbort)
      resolve(result)
    })
    el.contentWindow?.postMessage(
      { type: 'run', id, language, code, timeoutMs: options.timeoutMs },
      '*',
    )
  })
}

/** Tear down the sandbox (drops Python state). */
export function resetSandbox() {
  for (const done of pending.values()) {
    done({ ok: false, output: '', error: 'Sandbox was reset.' })
  }
  pending.clear()
  frame?.remove()
  frame = null
  frameReady = null
}
