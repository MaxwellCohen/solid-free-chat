/** Served by `routes/harness-sandbox.ts`; loaded by `sandbox.ts` in an opaque-origin iframe. */
export const SANDBOX_DOCUMENT_PATH = '/harness-sandbox'

const JS_WORKER_SOURCE = String.raw`
const MAX_OUTPUT = 100000
const lines = []
let size = 0
let full = false
let lastPost = 0
const fmt = (v) => {
  if (typeof v === 'string') return v
  if (v instanceof Error) return v.stack || String(v)
  try { return JSON.stringify(v, null, 2) ?? String(v) } catch { return String(v) }
}
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => {
    const prefix = level === 'log' || level === 'info' ? '' : '[' + level + '] '
    if (full) return
    let line = prefix + args.map(fmt).join(' ')
    if (size + line.length + 1 > MAX_OUTPUT) {
      line = line.slice(0, Math.max(0, MAX_OUTPUT - size - 1)) + '\n[output truncated]'
      full = true
    }
    size += line.length + 1
    lines.push(line)
    // Snapshot for the host so a timeout still reports what was printed.
    const now = Date.now()
    if (full || now - lastPost > 100) {
      lastPost = now
      self.postMessage({ type: 'output', output: lines.join('\n') })
    }
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

/** Runs inside the sandboxed iframe; brokers runs between the app and workers. */
const SANDBOX_HOST_SOURCE = String.raw`
const workerUrl = URL.createObjectURL(new Blob([${JSON.stringify(JS_WORKER_SOURCE)}], { type: 'text/javascript' }))

const active = new Map()
const opaque = window.origin === 'null'

function run({ id, code, timeoutMs }) {
  return new Promise((resolve) => {
    if (!opaque) {
      resolve({ id, ok: false, output: '', error: 'Sandbox refused to run: page is not in an opaque origin.' })
      return
    }
    let worker
    try {
      worker = new Worker(workerUrl)
    } catch (err) {
      resolve({ id, ok: false, output: '', error: 'Could not start sandbox worker: ' + String(err) })
      return
    }
    let output = ''
    const finish = (result) => {
      clearTimeout(timer)
      worker.terminate()
      active.delete(id)
      resolve({ id, ...result })
    }
    const timer = setTimeout(() => {
      finish({ ok: false, output, timedOut: true, error: 'Timed out after ' + timeoutMs + 'ms' })
    }, timeoutMs)
    active.set(id, () => {
      clearTimeout(timer)
      worker.terminate()
      active.delete(id)
    })
    worker.onmessage = (event) => {
      if (event.data && event.data.type === 'output') {
        output = event.data.output
        return
      }
      finish(event.data)
    }
    worker.onerror = (event) => {
      finish({ ok: false, output, error: event.message || 'Worker error' })
    }
    worker.postMessage({ code })
  })
}

window.addEventListener('message', async (event) => {
  if (event.source !== parent || !event.data) return
  if (event.data.type === 'cancel') {
    active.get(event.data.id)?.()
    return
  }
  if (event.data.type !== 'run') return
  parent.postMessage({ type: 'result', ...(await run(event.data)) }, '*')
})
parent.postMessage({ type: 'ready' }, '*')
`

export const SANDBOX_DOCUMENT_HTML = `<!doctype html><meta charset="utf-8"><script>${SANDBOX_HOST_SOURCE.replace(/<\/script/gi, '<\\/script')}</script>`
