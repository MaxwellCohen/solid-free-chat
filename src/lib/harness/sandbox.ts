/**
 * Browser code sandbox for harness tools.
 *
 * Code runs in a Web Worker spawned inside a `sandbox="allow-scripts"` iframe
 * (opaque origin), so it cannot read the app's localStorage, cookies, API key,
 * or DOM. Each run gets a fresh worker and a hard timeout enforced by
 * terminating it.
 */

export type SandboxResult = {
  ok: boolean
  /** Captured console lines. */
  output: string
  /** Stringified return value. */
  result?: string
  error?: string
  timedOut?: boolean
}

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
      { type: 'run', id, code, timeoutMs: options.timeoutMs },
      '*',
    )
  })
}

/** Tear down the sandbox iframe. */
export function resetSandbox() {
  for (const done of pending.values()) {
    done({ ok: false, output: '', error: 'Sandbox was reset.' })
  }
  pending.clear()
  frame?.remove()
  frame = null
  frameReady = null
}
