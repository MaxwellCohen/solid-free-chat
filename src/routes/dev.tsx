import { createFileRoute } from '@tanstack/solid-router'
import { For, Show, createSignal, onSettled } from 'solid-js'

import { runAgent } from '../lib/harness/run-agent'
import { ModelSelect } from '../components/ModelSelect'
import { loadToolModelSelection } from '../lib/model-options'
import type { ModelSelection } from '../lib/model-options'
import { decodeWorkspace, encodeWorkspace } from '../lib/dev-share'
import { loadStoredApiKey } from '../lib/openrouter-key-storage'
import { getProvider } from '../lib/providers'
import {
  DEV_SYSTEM_PROMPT,
  STARTER_FILES,
  buildWorkspace,
  createWorkspaceTools,
} from '../lib/dev-workspace'
import type { Files } from '../lib/dev-workspace'

export const Route = createFileRoute('/dev')({
  component: Dev,
})

function Dev() {
  // The file list is client-only state; rendering it during SSR mismatches hydration.
  const [modelSel, setModelSel] = createSignal<ModelSelection>({
    providerId: 'openrouter',
    modelId: 'openrouter/free',
  })
  onSettled(() => {
    setModelSel(loadToolModelSelection())
  })
  const [mounted, setMounted] = createSignal(false)
  const [files, setFiles] = createSignal<Files>({ ...STARTER_FILES })
  const [selected, setSelected] = createSignal('main.js')
  const [buildErrors, setBuildErrors] = createSignal<string[]>([])
  const [previewHtml, setPreviewHtml] = createSignal('')
  const [console_, setConsole] = createSignal('')
  const [prompt, setPrompt] = createSignal('')
  const [reply, setReply] = createSignal('')
  const [error, setError] = createSignal('')
  const [running, setRunning] = createSignal(false)
  const [shareNote, setShareNote] = createSignal('')
  const [fullscreen, setFullscreen] = createSignal(false)
  let abort: AbortController | undefined
  let frame: HTMLIFrameElement | undefined
  let editTimer: ReturnType<typeof setTimeout> | undefined
  // Mirror of `files()` readable synchronously from tools mid-turn.
  let current: Files = { ...STARTER_FILES }

  const commit = (next: Files) => {
    current = next
    setFiles(next)
  }

  const build = async () => {
    const result = await buildWorkspace(current)
    if (result.ok) {
      setBuildErrors([])
      setConsole('')
      setPreviewHtml(result.html)
    } else setBuildErrors(result.errors)
    return result
  }

  onSettled(() => {
    setMounted(true)
    void (async () => {
      const shared = await decodeWorkspace(location.hash)
      if (shared) {
        commit(shared)
        setSelected(Object.keys(shared).sort()[0] ?? '')
      }
      await build()
    })()
    const onMessage = (e: MessageEvent) => {
      const data = e.data as {
        source?: string
        level?: string
        text?: string
      } | null
      if (e.source !== frame?.contentWindow || data?.source !== 'dev-preview')
        return
      setConsole((c) => `${c}[${data.level}] ${data.text}\n`.slice(-10_000))
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    addEventListener('message', onMessage)
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('message', onMessage)
      removeEventListener('keydown', onKey)
      abort?.abort()
      clearTimeout(editTimer)
    }
  })

  const editFile = (content: string) => {
    commit({ ...current, [selected()]: content })
    clearTimeout(editTimer)
    editTimer = setTimeout(() => void build(), 500)
  }

  const share = async () => {
    try {
      const hash = await encodeWorkspace(current)
      await navigator.clipboard.writeText(
        `${location.origin}${location.pathname}${hash}`,
      )
      setShareNote('Link copied to clipboard.')
    } catch {
      setShareNote('Could not copy share link.')
    }
  }

  const send = async () => {
    const sel = modelSel()
    const apiKey = loadStoredApiKey(sel.providerId).key.trim()
    if (!apiKey) {
      setError(
        `Add your ${getProvider(sel.providerId).name} API key on the Chat page first.`,
      )
      return
    }
    const input = prompt().trim()
    if (!input) return
    abort?.abort()
    abort = new AbortController()
    setRunning(true)
    setError('')
    setReply('')
    try {
      const tools = createWorkspaceTools({
        files: () => current,
        write: (path, content) => commit({ ...current, [path]: content }),
        remove: (path) => {
          const { [path]: _removed, ...rest } = current
          commit(rest)
          if (selected() === path) setSelected(Object.keys(rest)[0] ?? '')
        },
        build,
      })
      for await (const chunk of runAgent({
        apiKey,
        providerId: sel.providerId,
        model: sel.modelId,
        messages: [{ role: 'user', content: input }],
        systemPrompt: DEV_SYSTEM_PROMPT,
        tools,
        abortSignal: abort.signal,
      })) {
        if (chunk.type === 'TEXT_MESSAGE_CONTENT')
          setReply((r) => r + chunk.delta)
        else if (chunk.type === 'RUN_ERROR') throw new Error(chunk.message)
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Agent failed.')
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <main class="mx-auto grid max-w-7xl gap-4 px-4 py-6 lg:grid-cols-2">
      <section class="min-w-0 space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h1 class="text-foreground text-2xl font-bold tracking-tight">
            Dev workspace
          </h1>
          <div class="flex items-center gap-2">
            <ModelSelect value={modelSel} onChange={setModelSel} />
            <Show when={shareNote()}>
              <span class="text-muted-foreground text-xs">{shareNote()}</span>
            </Show>
            <button
              type="button"
              class="border-border text-foreground rounded-lg border px-3 py-1.5 text-sm font-medium"
              onClick={share}
            >
              Share
            </button>
          </div>
        </div>

        <Show when={error()}>
          <p class="text-destructive text-sm" role="alert">
            {error()}
          </p>
        </Show>

        <div class="flex gap-2">
          <textarea
            class="border-border bg-card text-foreground min-h-20 flex-1 rounded-xl border p-3 text-sm"
            placeholder="Describe what to build…"
            value={prompt()}
            onInput={(e) => setPrompt(e.currentTarget.value)}
          />
          <button
            type="button"
            class="bg-primary text-primary-foreground self-start rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            disabled={running() || !prompt().trim()}
            onClick={send}
          >
            {running() ? 'Working…' : 'Send'}
          </button>
        </div>
        <Show when={reply()}>
          <p class="text-foreground text-sm whitespace-pre-wrap">{reply()}</p>
        </Show>

        <div class="border-border grid min-h-64 grid-cols-[10rem_1fr] overflow-hidden rounded-xl border">
          <ul class="border-border bg-muted/40 overflow-auto border-r p-1 text-xs">
            <Show when={mounted()}>
              <For each={Object.keys(files()).sort()}>
                {(path) => (
                  <li>
                    <button
                      type="button"
                      class={[
                        'w-full truncate rounded px-2 py-1 text-left',
                        selected() === path
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground',
                      ]}
                      onClick={() => setSelected(path)}
                    >
                      {path}
                    </button>
                  </li>
                )}
              </For>
            </Show>
          </ul>
          <textarea
            class="bg-card text-foreground min-h-64 w-full resize-y p-3 font-mono text-xs"
            spellcheck={false}
            disabled={!(selected() in files())}
            value={files()[selected()] ?? ''}
            onInput={(e) => editFile(e.currentTarget.value)}
          />
        </div>

        <Show when={buildErrors().length > 0}>
          <pre class="border-destructive text-destructive overflow-auto rounded-xl border p-3 font-mono text-xs whitespace-pre-wrap">
            {buildErrors().join('\n')}
          </pre>
        </Show>
        <pre class="border-border bg-card text-foreground h-32 overflow-auto rounded-xl border p-3 font-mono text-xs whitespace-pre-wrap">
          {console_() || 'Preview console output appears here.'}
        </pre>
      </section>

      <section class="min-w-0">
        <div
          class={[
            'border-border bg-card relative overflow-hidden border',
            fullscreen()
              ? 'fixed inset-0 z-50 h-screen rounded-none'
              : 'h-[70vh] rounded-xl',
          ]}
        >
          <button
            type="button"
            class="border-border bg-background/90 text-foreground absolute top-2 right-2 z-10 rounded-lg border px-3 py-1.5 text-sm font-medium"
            onClick={() => setFullscreen((f) => !f)}
          >
            {fullscreen() ? 'Exit full screen' : 'Full screen'}
          </button>
          <iframe
            ref={frame}
            title="Preview"
            sandbox="allow-scripts"
            srcdoc={previewHtml()}
            class="h-full w-full bg-white"
          />
        </div>
      </section>
    </main>
  )
}
