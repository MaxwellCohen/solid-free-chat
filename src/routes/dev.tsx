import { createFileRoute } from '@tanstack/solid-router'
import { maybe } from '../lib/nullable'
import { Errored, For, Show, createSignal, onSettled } from 'solid-js'

import { ChatErrorFallback } from '../components/chat/ChatErrorFallback'
import { DevBottomPanel } from '../components/dev/DevBottomPanel'
import type { ConsoleEntry, PanelTab } from '../components/dev/DevBottomPanel'
import { DevFileTree } from '../components/dev/DevFileTree'
import { DevPreviewToolbar } from '../components/dev/DevPreviewToolbar'
import type { PreviewWidth } from '../components/dev/DevPreviewToolbar'
import { DevTabs } from '../components/dev/DevTabs'
import { DevTemplateMenu } from '../components/dev/DevTemplateMenu'
import { runAgent } from '../lib/harness/run-agent'
import { ModelSelect } from '../components/ModelSelect'
import { loadToolModelSelection } from '../lib/model-options'
import type { ModelSelection } from '../lib/model-options'
import {
  deleteWorkspace,
  loadWorkspaces,
  modifiedPaths,
  popSnapshot,
  pushSnapshot,
  saveWorkspace,
} from '../lib/dev-history'
import type { Snapshot } from '../lib/dev-history'
import { decodeWorkspace, encodeWorkspace } from '../lib/dev-share'
import { getTemplateFiles } from '../lib/dev-templates'
import { loadStoredApiKey } from '../lib/openrouter-key-storage'
import { getProvider } from '../lib/providers'
import {
  DEV_SYSTEM_PROMPT,
  STARTER_FILES,
  buildWorkspace,
  createWorkspaceTools,
  normalizePath,
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
  const [consoleEntries, setConsoleEntries] = createSignal<ConsoleEntry[]>([])
  const [panelTab, setPanelTab] = createSignal<PanelTab>('console')
  const [history, setHistory] = createSignal<Snapshot[]>([])
  const [activity, setActivity] = createSignal<string[]>([])
  const [openTabs, setOpenTabs] = createSignal<string[]>(['main.js'])
  const [baseline, setBaseline] = createSignal<Files>({ ...STARTER_FILES })
  const [previewWidth, setPreviewWidth] = createSignal<PreviewWidth>('full')
  const [saved, setSaved] = createSignal<string[]>([])
  const [prompt, setPrompt] = createSignal('')
  const [reply, setReply] = createSignal('')
  const [error, setError] = createSignal('')
  const [running, setRunning] = createSignal(false)
  const [shareNote, setShareNote] = createSignal('')
  const [fullscreen, setFullscreen] = createSignal(false)
  const [split, setSplit] = createSignal(50)
  let abort: AbortController | undefined
  let frame: HTMLIFrameElement | undefined
  let pane: HTMLDivElement | undefined
  let layout: HTMLElement | undefined
  let editTimer: ReturnType<typeof setTimeout> | undefined
  // Mirror of `files()` readable synchronously from tools mid-turn.
  let current: Files = { ...STARTER_FILES }
  let snapshotId = 0

  const commit = (next: Files) => {
    current = next
    setFiles(next)
  }

  const build = async () => {
    const result = await buildWorkspace(current)
    if (result.ok) {
      setBuildErrors([])
      setConsoleEntries([])
      setPreviewHtml(result.html)
      setBaseline({ ...current })
      if (panelTab() === 'errors') setPanelTab('console')
    } else {
      setBuildErrors(result.errors)
      setPanelTab('errors')
    }
    return result
  }

  const open = (path: string) => {
    setSelected(path)
    setOpenTabs((t) => (t.includes(path) ? t : [...t, path]))
  }

  const syncSelection = () => {
    const paths = Object.keys(current).sort()
    setOpenTabs((t) => t.filter((p) => p in current))
    if (!(selected() in current)) {
      const next = openTabs().at(0) ?? paths.at(0) ?? ''
      setSelected(next)
      if (next) open(next)
    }
  }

  const replaceFiles = (next: Files, label: string) => {
    setHistory((h) =>
      pushSnapshot(h, {
        id: ++snapshotId,
        label,
        at: Date.now(),
        files: { ...current },
      }),
    )
    commit(next)
    syncSelection()
    void build()
  }

  onSettled(() => {
    setMounted(true)
    void (async () => {
      const shared = await decodeWorkspace(location.hash)
      if (shared) {
        commit(shared)
        const first = Object.keys(shared).sort()[0] ?? ''
        setSelected(first)
        setOpenTabs(first ? [first] : [])
      }
      await build()
    })()
    setSaved(Object.keys(loadWorkspaces()).sort())
    const onMessage = (e: MessageEvent) => {
      const data = e.data as {
        source?: string
        level?: string
        text?: string
      } | null
      if (e.source !== frame?.contentWindow || data?.source !== 'dev-preview')
        return
      const entry = { level: data.level ?? 'log', text: data.text ?? '' }
      setConsoleEntries((c) => [...c, entry].slice(-200))
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    const onFsChange = () => {
      if (!document.fullscreenElement) setFullscreen(false)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    addEventListener('message', onMessage)
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('message', onMessage)
      removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFsChange)
      abort?.abort()
      clearTimeout(editTimer)
    }
  })

  const editFile = (content: string) => {
    commit({ ...current, [selected()]: content })
    clearTimeout(editTimer)
    editTimer = setTimeout(() => void build(), 500)
  }

  const addFile = () => {
    const name = window.prompt('New file name (e.g. src/util.js)')
    const safe = name ? normalizePath(name) : undefined
    if (!safe) return
    if (safe in current) return open(safe)
    commit({ ...current, [safe]: '' })
    open(safe)
  }

  const renameFile = (path: string) => {
    const name = window.prompt('Rename file', path)
    const safe = name ? normalizePath(name) : undefined
    if (!safe || safe === path) return
    if (safe in current) {
      window.alert(`${safe} already exists.`)
      return
    }
    const { [path]: content, ...rest } = current
    commit({ ...rest, [safe]: content })
    setOpenTabs((t) => t.map((p) => (p === path ? safe : p)))
    if (selected() === path) setSelected(safe)
    void build()
  }

  const deleteFile = (path: string) => {
    if (!window.confirm(`Delete ${path}?`)) return
    const { [path]: _removed, ...rest } = current
    commit(rest)
    syncSelection()
    void build()
  }

  const closeTab = (path: string) => {
    const tabs = openTabs()
    const next = tabs.filter((p) => p !== path)
    setOpenTabs(next)
    if (selected() === path) {
      const i = tabs.indexOf(path)
      setSelected(next[Math.min(i, next.length - 1)] ?? '')
    }
  }

  const loadTemplate = (id: string) => {
    const next = getTemplateFiles(id)
    if (next) replaceFiles(next, `Before template: ${id}`)
  }

  const saveCurrent = () => {
    const name = window.prompt('Save workspace as')?.trim()
    if (!name) return
    setSaved(Object.keys(saveWorkspace(name, current)).sort())
  }

  const loadSaved = (name: string) => {
    const all = loadWorkspaces()
    if (name in all) replaceFiles(all[name], `Before load: ${name}`)
  }

  const deleteSaved = (name: string) => {
    if (!window.confirm(`Delete saved workspace "${name}"?`)) return
    setSaved(Object.keys(deleteWorkspace(name)).sort())
  }

  const restoreSnapshot = (snap: Snapshot) =>
    replaceFiles({ ...snap.files }, `Before restore: ${snap.label}`)

  const undo = () => {
    const { stack, snapshot } = popSnapshot(history())
    if (!snapshot) return
    setHistory(stack)
    commit({ ...snapshot.files })
    syncSelection()
    void build()
  }

  const stop = () => abort?.abort()

  const reload = async () => {
    await build()
    if (frame) frame.srcdoc = previewHtml()
  }

  const openInNewTab = () => {
    const url = URL.createObjectURL(
      new Blob([previewHtml()], { type: 'text/html' }),
    )
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const clampSplit = (v: number) => Math.min(80, Math.max(20, v))

  const onDrag = (e: PointerEvent) => {
    if (
      !layout ||
      !(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)
    )
      return
    const rect = layout.getBoundingClientRect()
    setSplit(clampSplit(((e.clientX - rect.left) / rect.width) * 100))
  }

  const onDividerKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setSplit((v) => clampSplit(v - 2))
    else if (e.key === 'ArrowRight') setSplit((v) => clampSplit(v + 2))
  }

  const toggleFullscreen = () => {
    const next = !fullscreen()
    setFullscreen(next)
    if (next)
      void maybe(pane?.requestFullscreen)
        ?.call(pane)
        .catch(() => {})
    else if (document.fullscreenElement) void document.exitFullscreen()
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
    setHistory((h) =>
      pushSnapshot(h, {
        id: ++snapshotId,
        label: input.length > 60 ? `${input.slice(0, 60)}…` : input,
        at: Date.now(),
        files: { ...current },
      }),
    )
    setActivity([])
    setRunning(true)
    setError('')
    setReply('')
    try {
      const tools = createWorkspaceTools({
        files: () => current,
        write: (path, content) => {
          commit({ ...current, [path]: content })
          setActivity((a) => [...a, `wrote ${path}`])
        },
        remove: (path) => {
          const { [path]: _removed, ...rest } = current
          commit(rest)
          syncSelection()
          setActivity((a) => [...a, `deleted ${path}`])
        },
        build: async () => {
          setActivity((a) => [...a, 'built'])
          return build()
        },
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

  const modified = () => modifiedPaths(baseline(), files())

  return (
    <main
      ref={layout}
      class="mx-auto grid max-w-[120rem] gap-4 px-4 py-6 lg:grid-cols-[minmax(0,var(--split))_auto_minmax(0,var(--rest))] lg:gap-2"
      style={{ '--split': `${split()}fr`, '--rest': `${100 - split()}fr` }}
    >
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
            <Show when={mounted()}>
              <DevTemplateMenu
                saved={saved()}
                onTemplate={loadTemplate}
                onSave={saveCurrent}
                onLoad={loadSaved}
                onDeleteSaved={deleteSaved}
              />
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
          <div class="flex flex-col gap-1.5 self-start">
            <button
              type="button"
              class="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              disabled={running() || !prompt().trim()}
              onClick={send}
            >
              {running() ? 'Working…' : 'Send'}
            </button>
            <Show when={running()}>
              <button
                type="button"
                class="border-border text-foreground rounded-lg border px-3 py-1.5 text-sm font-medium"
                onClick={stop}
              >
                Stop
              </button>
            </Show>
            <button
              type="button"
              class="border-border text-foreground rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              disabled={running() || history().length === 0}
              onClick={undo}
            >
              Undo
            </button>
          </div>
        </div>
        <Show when={running() && activity().length > 0}>
          <ul class="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
            <For each={activity().slice(-6)}>{(a) => <li>{a}</li>}</For>
          </ul>
        </Show>
        <Show when={reply()}>
          <p class="text-foreground text-sm whitespace-pre-wrap">{reply()}</p>
        </Show>

        <div class="border-border grid min-h-64 grid-cols-[10rem_1fr] overflow-hidden rounded-xl border">
          <Show when={mounted()} fallback={<div />}>
            <DevFileTree
              paths={Object.keys(files()).sort()}
              selected={selected()}
              modified={modified()}
              onSelect={open}
              onAdd={addFile}
              onRename={renameFile}
              onDelete={deleteFile}
            />
          </Show>
          <div class="flex min-w-0 flex-col">
            <Show when={mounted()}>
              <DevTabs
                tabs={openTabs()}
                selected={selected()}
                modified={modified()}
                onSelect={setSelected}
                onClose={closeTab}
              />
            </Show>
            <textarea
              class="bg-card text-foreground min-h-64 w-full flex-1 resize-y p-3 font-mono text-xs"
              spellcheck={false}
              disabled={!(selected() in files())}
              value={files()[selected()] ?? ''}
              onInput={(e) => editFile(e.currentTarget.value)}
            />
          </div>
        </div>

        <DevBottomPanel
          tab={panelTab()}
          onTab={setPanelTab}
          consoleEntries={consoleEntries()}
          buildErrors={buildErrors()}
          history={history()}
          onRestore={restoreSnapshot}
        />
      </section>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        tabindex={0}
        class="bg-border hover:bg-primary focus-visible:bg-primary hidden w-1.5 cursor-col-resize touch-none self-stretch rounded-full lg:block"
        onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
        onPointerMove={onDrag}
        onKeyDown={onDividerKey}
      />

      <section class="min-w-0">
        <Errored
          fallback={(err, reset) => (
            <ChatErrorFallback
              error={err()}
              reset={reset}
              label="The preview crashed."
            />
          )}
        >
          <div
            ref={pane}
            class={[
              'border-border bg-card relative flex flex-col overflow-hidden border',
              fullscreen()
                ? 'fixed inset-0 z-[100] h-screen w-screen rounded-none'
                : 'h-[70vh] rounded-xl',
            ]}
          >
            <DevPreviewToolbar
              width={previewWidth()}
              fullscreen={fullscreen()}
              onReload={() => void reload()}
              onWidth={setPreviewWidth}
              onOpenTab={openInNewTab}
              onToggleFullscreen={toggleFullscreen}
            />
            <div class="flex min-h-0 flex-1 justify-center">
              <iframe
                ref={frame}
                title="Preview"
                sandbox="allow-scripts"
                srcdoc={previewHtml()}
                class="h-full bg-white"
                style={{
                  width:
                    previewWidth() === 'full' ? '100%' : `${previewWidth()}px`,
                  'max-width': '100%',
                }}
              />
            </div>
          </div>
        </Errored>
      </section>
    </main>
  )
}
