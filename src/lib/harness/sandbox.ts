/**
 * Browser code sandbox for harness tools.
 *
 * Code runs in a Web Worker spawned inside a `sandbox="allow-scripts"` iframe
 * (opaque origin), so it cannot read the app's localStorage, cookies, API key,
 * or DOM. Each run gets a fresh worker and a hard timeout enforced by
 * terminating it.
 *
 * The iframe loads a real URL (see `routes/harness-sandbox.ts`) rather than
 * `srcdoc`: a `srcdoc` frame would inherit the app's Content-Security-Policy,
 * whose locked-down `connect-src` would stop sandboxed code from fetching.
 */
import { SANDBOX_DOCUMENT_PATH } from './sandbox-document'

export type SandboxResult = {
  ok: boolean
  /** Captured console lines. */
  output: string
  /** Stringified return value. */
  result?: string
  error?: string
  timedOut?: boolean
}

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
    el.src = SANDBOX_DOCUMENT_PATH

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
