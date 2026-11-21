import { Link, createFileRoute } from '@tanstack/solid-router'
import { For, Show, createSignal, onCleanup, onSettled } from 'solid-js'

import type { ChatModelOption } from '../lib/chat-models'
import {
  loadSavedGallery,
  runGallery,
  saveGallery,
  svgDataUrl,
} from '../lib/gallery'
import type { GalleryItem, GalleryRunner } from '../lib/gallery'
import { runAgent } from '../lib/harness/run-agent-lazy'
import { loadAllModelOptions } from '../lib/model-options'
import { loadStoredApiKey } from '../lib/openrouter-key-storage'
import { getProvider } from '../lib/providers'

export const Route = createFileRoute('/gallery')({
  component: Gallery,
})

const encode = (providerId: string, modelId: string) =>
  `${providerId}\n${modelId}`

function makeRunner(providerId: string, modelId: string): GalleryRunner {
  return async function* (req, signal) {
    const apiKey = loadStoredApiKey(providerId).key.trim()
    for await (const chunk of runAgent({
      apiKey,
      providerId,
      model: modelId,
      systemPrompt: req.system,
      messages: [{ role: 'user', content: req.prompt }],
      abortSignal: signal,
    })) {
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') yield chunk.delta
      else if (chunk.type === 'RUN_ERROR') throw new Error(chunk.message)
    }
  }
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'picture'

function downloadSvg(item: GalleryItem) {
  const url = URL.createObjectURL(
    new Blob([item.svg], { type: 'image/svg+xml' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug(item.title)}.svg`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const smallBtn =
  'border-border text-foreground hover:bg-muted min-h-9 flex-1 rounded-md border px-2 text-xs'

const navBtn =
  'border-border text-foreground hover:bg-muted min-h-10 rounded-lg border px-4 text-sm font-medium aria-disabled:opacity-40'

function Gallery() {
  const [options, setOptions] = createSignal<ChatModelOption[]>([])
  const [model, setModel] = createSignal('')
  const [prompt, setPrompt] = createSignal('')
  const [items, setItems] = createSignal<GalleryItem[]>([])
  const [running, setRunning] = createSignal(false)
  const [status, setStatus] = createSignal('')
  const [error, setError] = createSignal('')
  const [hasKey, setHasKey] = createSignal(true)
  const [viewingId, setViewingId] = createSignal<string | null>(null)
  const [copied, setCopied] = createSignal('')
  const [ready, setReady] = createSignal(false)
  let abort: AbortController | undefined
  let dialog: HTMLDialogElement | undefined
  let savedKey = ''

  const update = (next: GalleryItem[]) => {
    setItems(next)
    const done = next.filter((i) => i.status === 'done')
    const key = `${done.length}:${done.at(-1)?.id ?? ''}`
    if (key === savedKey) return
    savedKey = key
    void saveGallery(done)
  }

  onSettled(() => {
    void loadSavedGallery().then((saved) => {
      savedKey = `${saved.length}:${saved.at(-1)?.id ?? ''}`
      setItems(saved)
      setPrompt((p) => p || (saved.at(-1)?.prompt ?? ''))
      setReady(true)
    })
    setHasKey(!!loadStoredApiKey('openrouter').key.trim())
    void loadAllModelOptions().then((r) => {
      setOptions(r.options)
      setHasKey(
        !!loadStoredApiKey('openrouter').key.trim() ||
          r.options.some(
            (o) => !!loadStoredApiKey(o.providerId ?? 'openrouter').key.trim(),
          ) ||
          r.options.length > 0,
      )
      setModel((m) =>
        m || !r.options[0]
          ? m
          : encode(r.options[0].providerId ?? 'openrouter', r.options[0].id),
      )
    })
  })
  onCleanup(() => abort?.abort())

  const decoded = () => {
    const raw = model()
    const i = raw.indexOf('\n')
    return i < 0
      ? null
      : { providerId: raw.slice(0, i), modelId: raw.slice(i + 1) }
  }
  const canStart = () =>
    ready() && !running() && !!prompt().trim() && !!decoded() && hasKey()
  const doneCount = () => items().filter((i) => i.status === 'done').length

  const start = async () => {
    const d = decoded()
    if (!canStart() || !d) return
    abort?.abort()
    const ac = new AbortController()
    abort = ac
    setRunning(true)
    setError('')
    setStatus('Starting…')
    try {
      const res = await runGallery({
        prompt: prompt().trim(),
        items: items(),
        runner: makeRunner(d.providerId, d.modelId),
        signal: ac.signal,
        onUpdate: update,
        onStatus: setStatus,
      })
      if (res.error) setError(res.error)
    } finally {
      setRunning(false)
      setStatus('')
    }
  }

  const copy = async (item: GalleryItem) => {
    try {
      await navigator.clipboard.writeText(item.svg)
      setCopied(item.id)
      setTimeout(() => setCopied((c) => (c === item.id ? '' : c)), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const pictures = () => items().filter((i) => i.status === 'done')
  const viewIndex = () => pictures().findIndex((i) => i.id === viewingId())
  const viewing = () => pictures().find((i) => i.id === viewingId())
  const open = (item: GalleryItem) => {
    setViewingId(item.id)
    dialog?.showModal()
  }
  const step = (delta: number) => {
    const i = viewIndex()
    const next = i < 0 ? undefined : pictures().at(Math.max(0, i + delta))
    if (next) setViewingId(next.id)
  }
  let touchX = 0
  let touchY = 0

  return (
    <main class="mx-auto max-w-5xl px-4 py-8">
      <h1 class="text-foreground mb-1 text-3xl font-bold tracking-tight">
        Endless gallery
      </h1>
      <p class="text-muted-foreground mb-4 text-sm">
        Give it a theme and it keeps drawing SVG pictures until you stop it.
        Pictures are saved on this device.
      </p>

      <Show when={!hasKey()}>
        <p
          class="border-border bg-card mb-4 rounded-xl border p-4 text-sm"
          role="status"
        >
          Add an API key to start the gallery.{' '}
          <Link to="/" class="text-primary underline-offset-4 hover:underline">
            Connect OpenRouter in chat
          </Link>
        </p>
      </Show>

      <section class="mb-6 space-y-3" aria-label="Gallery setup">
        <textarea
          aria-label="Gallery prompt"
          class="border-border bg-card text-foreground min-h-20 w-full rounded-xl border p-3 text-sm"
          placeholder="A theme, e.g. lighthouses in a storm…"
          value={prompt()}
          disabled={running()}
          onInput={(e) => setPrompt(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              void start()
            }
          }}
        />
        <div class="flex flex-wrap items-center gap-2">
          <select
            aria-label="Gallery model"
            class="border-input bg-background w-full min-w-0 rounded-lg border px-2 py-2 text-sm sm:w-auto sm:max-w-full"
            value={model()}
            disabled={running()}
            onChange={(e) => setModel(e.currentTarget.value)}
          >
            <option value="">Choose model…</option>
            <For each={options()}>
              {(m) => (
                <option value={encode(m.providerId ?? 'openrouter', m.id)}>
                  {getProvider(m.providerId).name}: {m.name}
                </option>
              )}
            </For>
          </select>
          <button
            type="button"
            class="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={!canStart()}
            onClick={() => void start()}
          >
            {items().length === 0 ? 'Start' : 'Continue'}
          </button>
          <button
            type="button"
            class="border-border text-foreground rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={!running()}
            onClick={() => abort?.abort()}
          >
            Stop
          </button>
          <button
            type="button"
            class="border-border text-foreground rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={running() || items().length === 0}
            onClick={() => {
              if (!window.confirm('Delete all saved pictures?')) return
              update([])
              setError('')
            }}
          >
            Clear
          </button>
        </div>
      </section>

      <p class="text-muted-foreground mb-3 text-sm" role="status">
        <Show when={running() && status()}>{status()} · </Show>
        {doneCount()} {doneCount() === 1 ? 'picture' : 'pictures'}
      </p>
      <Show when={error()}>
        <p class="text-destructive mb-3 text-sm" role="alert">
          {error()}
        </p>
      </Show>

      <ul
        class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        aria-label="Gallery"
      >
        <For each={items()} keyed={false}>
          {(item) => (
            <li
              class="border-border bg-card overflow-hidden rounded-xl border"
              data-testid="gallery-item"
              data-status={item().status}
            >
              <Show
                when={item().status === 'done'}
                fallback={
                  <div class="bg-muted text-muted-foreground flex aspect-square animate-pulse items-center justify-center text-sm">
                    Drawing…
                  </div>
                }
              >
                <button
                  type="button"
                  class="block w-full"
                  aria-label={`View ${item().title} full size`}
                  onClick={() => open(item())}
                >
                  <img
                    class="aspect-square w-full object-contain"
                    loading="lazy"
                    alt={item().title}
                    src={svgDataUrl(item().svg)}
                  />
                </button>
                <p class="text-foreground m-0 truncate px-2 pt-2 text-xs">
                  {item().title}
                </p>
                <div class="flex gap-2 p-2">
                  <button
                    type="button"
                    class={smallBtn}
                    aria-label={`Download ${item().title}`}
                    onClick={() => downloadSvg(item())}
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    class={smallBtn}
                    aria-label={`Copy SVG of ${item().title}`}
                    onClick={() => void copy(item())}
                  >
                    {copied() === item().id ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </Show>
            </li>
          )}
        </For>
      </ul>

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- backdrop click, arrow keys and swipe; Escape closes natively */}
      <dialog
        ref={(el) => (dialog = el)}
        aria-label="Picture preview"
        class="border-border bg-card text-foreground m-auto max-w-[90vw] rounded-xl border p-4 backdrop:bg-black/60"
        onClose={() => setViewingId(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog?.close()
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') step(-1)
          else if (e.key === 'ArrowRight') step(1)
        }}
        onTouchStart={(e) => {
          touchX = e.changedTouches[0].clientX
          touchY = e.changedTouches[0].clientY
        }}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - touchX
          const dy = e.changedTouches[0].clientY - touchY
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5)
            step(dx < 0 ? 1 : -1)
        }}
      >
        <Show when={viewing()}>
          {(v) => (
            <div class="flex flex-col items-center gap-3">
              <img
                class="aspect-square w-[min(84vw,70vh)] max-w-full object-contain"
                alt={v().title}
                src={svgDataUrl(v().svg)}
              />
              <p class="m-0 max-w-full truncate text-sm font-medium">
                {v().title}
              </p>
              <div class="flex w-full items-center justify-between gap-2">
                <button
                  type="button"
                  class={navBtn}
                  aria-label="Previous picture"
                  aria-disabled={viewIndex() <= 0 ? 'true' : 'false'}
                  onClick={() => step(-1)}
                >
                  ‹ Previous
                </button>
                <span
                  class="text-muted-foreground text-xs"
                  data-testid="gallery-position"
                >
                  {viewIndex() + 1} / {pictures().length}
                </span>
                <button
                  type="button"
                  class={navBtn}
                  aria-label="Next picture"
                  aria-disabled={
                    viewIndex() >= pictures().length - 1 ? 'true' : 'false'
                  }
                  onClick={() => step(1)}
                >
                  Next ›
                </button>
              </div>
              <button
                type="button"
                class={navBtn}
                onClick={() => dialog?.close()}
              >
                Close
              </button>
            </div>
          )}
        </Show>
      </dialog>
    </main>
  )
}
