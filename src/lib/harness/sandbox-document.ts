/** Served by `routes/harness-sandbox.ts`; loaded by `sandbox.ts` in an opaque-origin iframe. */
export const SANDBOX_DOCUMENT_PATH = '/harness-sandbox'

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

/** Runs inside the sandboxed iframe; brokers runs between the app and workers. */
const SANDBOX_HOST_SOURCE = String.raw`
const workerUrl = URL.createObjectURL(new Blob([${JSON.stringify(JS_WORKER_SOURCE)}], { type: 'text/javascript' }))

function run({ id, code, timeoutMs }) {
  return new Promise((resolve) => {
    let worker
    try {
      worker = new Worker(workerUrl)
    } catch (err) {
      resolve({ id, ok: false, output: '', error: 'Could not start sandbox worker: ' + String(err) })
      return
    }
    const timer = setTimeout(() => {
      worker.terminate()
      resolve({ id, ok: false, output: '', timedOut: true, error: 'Timed out after ' + timeoutMs + 'ms' })
    }, timeoutMs)
    worker.onmessage = (event) => {
      clearTimeout(timer)
      worker.terminate()
      resolve({ id, ...event.data })
    }
    worker.onerror = (event) => {
      clearTimeout(timer)
      worker.terminate()
      resolve({ id, ok: false, output: '', error: event.message || 'Worker error' })
    }
    worker.postMessage({ code })
  })
}

window.addEventListener('message', async (event) => {
  if (event.source !== parent || !event.data || event.data.type !== 'run') return
  parent.postMessage({ type: 'result', ...(await run(event.data)) }, '*')
})
parent.postMessage({ type: 'ready' }, '*')
`

export const SANDBOX_DOCUMENT_HTML = `<!doctype html><meta charset="utf-8"><script>${SANDBOX_HOST_SOURCE.replace(/<\/script/gi, '<\\/script')}</script>`
