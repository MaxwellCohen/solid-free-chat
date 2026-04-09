import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from 'solid-js'
import { useStore } from '@tanstack/solid-store'
import { stream, useChat } from '@tanstack/ai-solid'
import type { UIMessage } from '@tanstack/ai-solid'
import type { ContentPart, StreamChunk } from '@tanstack/ai'
import { useServerFn } from '@tanstack/solid-start'
import { FileText, Image as ImageIcon, X } from 'lucide-solid'
import { useTheme } from '../../lib/theme-context'
import { streamOpenRouterChat } from '../../server/openrouter-fns'
import {
  modelSupportsDocumentInput,
  modelSupportsImageInput,
} from '../../lib/chat-models'
import { chatActions, chatStore } from '../../store/chat.store'
import { renderMarkdownToHtmlSync } from '../../lib/markdown-sync'

function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
}

type StreamFactory = Parameters<typeof stream>[0]
type ServerStreamChunk =
  Awaited<
    ReturnType<StreamFactory>[typeof Symbol.asyncIterator]
  > extends AsyncIterator<infer T>
    ? T
    : never

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_PDF_BYTES = 12 * 1024 * 1024

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const m = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl.replace(/\s/g, ''))
  if (!m) throw new Error('Invalid data URL')
  return { mimeType: m[1], base64: m[2] }
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      if (typeof r.result === 'string') resolve(r.result)
      else reject(new Error('read failed'))
    }
    r.onerror = () => reject(r.error ?? new Error('read failed'))
    r.readAsDataURL(file)
  })
}

function isPdfFile(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  )
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  if (value == null || typeof value !== 'object') return false
  return (
    typeof (value as { [Symbol.asyncIterator]?: unknown })[
      Symbol.asyncIterator
    ] === 'function'
  )
}

type PendingImage = {
  id: string
  mimeType: string
  base64: string
  previewUrl: string
}

type PendingFile = {
  id: string
  name: string
  mimeType: string
  base64: string
}

export default function ChatThread(props: {
  conversationId: string
  initialMessages: UIMessage[]
  inputModalities?: string[]
  /** Committed key from the client (after blur); optional server env only for local dev. */
  openRouterApiKey: string
}) {
  const [draft, setDraft] = createSignal('')
  const [pendingImages, setPendingImages] = createSignal<PendingImage[]>([])
  const [pendingFiles, setPendingFiles] = createSignal<PendingFile[]>([])
  const [attachError, setAttachError] = createSignal<string | null>(null)

  const supportsImage = createMemo(() =>
    modelSupportsImageInput(props.inputModalities),
  )
  const supportsDocument = createMemo(() =>
    modelSupportsDocumentInput(props.inputModalities),
  )

  const appState = useStore(chatStore)
  const tokenUsageLine = createMemo(() => {
    const c = appState().conversations.find((x) => x.id === props.conversationId)
    const last = c?.lastUsage
    const session = c?.sessionTotalTokens
    if (!last && (session == null || session === 0)) return null
    const parts: string[] = []
    if (last) {
      parts.push(
        `Last reply: ${formatTokenCount(last.promptTokens)} context · ${formatTokenCount(last.completionTokens)} out`,
      )
    }
    if (session != null && session > 0) {
      parts.push(`This chat: ~${formatTokenCount(session)} tokens total`)
    }
    return parts.join(' · ')
  })

  const streamChat = useServerFn(streamOpenRouterChat)

  const chat = useChat({
    id: props.conversationId,
    initialMessages: props.initialMessages,
    /** Merged into each stream request; keeps apiKey in sync when ChatClient is memoized by id. */
    body: {
      apiKey: props.openRouterApiKey.trim() || undefined,
    },
    onChunk: (chunk: StreamChunk) => {
      if (chunk.type !== 'RUN_FINISHED') return
      const u = chunk.usage
      if (!u) return
      chatActions.recordConversationTokenUsage(props.conversationId, {
        promptTokens: u.promptTokens,
        completionTokens: u.completionTokens,
        totalTokens: u.totalTokens,
      })
    },
    connection: stream(async function* (messages, data) {
      const fromBody =
        data &&
        typeof data === 'object' &&
        'apiKey' in data &&
        typeof (data as { apiKey?: unknown }).apiKey === 'string'
          ? (data as { apiKey: string }).apiKey.trim()
          : ''
      const trimmedKey =
        fromBody || props.openRouterApiKey.trim() || undefined
      const chunks = await streamChat({
        data: {
          messages,
          ...(trimmedKey ? { apiKey: trimmedKey } : {}),
          data: {
            ...data,
            model: chatStore.state.selectedModel,
            customSystemMessage:
              chatStore.state.conversations.find(
                (c) => c.id === props.conversationId,
              )?.customSystemMessage ?? '',
            ...(trimmedKey ? { apiKey: trimmedKey } : {}),
          },
        },
        ...(trimmedKey
          ? {
              headers: {
                Authorization: `Bearer ${trimmedKey}`,
              },
            }
          : {}),
      })
      if (!isAsyncIterable<ServerStreamChunk>(chunks)) {
        throw new Error(
          'streamOpenRouterChat did not return an iterable stream. Check the server function and API key.',
        )
      }
      yield* chunks
    }),
    onFinish: () => {
      chatActions.setConversationMessages(props.conversationId, chat.messages())
    },
  })

  let syncTimer: ReturnType<typeof setTimeout> | null = null
  createEffect(() => {
    const msgs = chat.messages()
    const id = props.conversationId
    if (syncTimer !== null) clearTimeout(syncTimer)
    syncTimer = setTimeout(() => {
      chatActions.setConversationMessages(id, msgs)
      syncTimer = null
    }, 100)
  })

  onCleanup(() => {
    if (syncTimer !== null) clearTimeout(syncTimer)
    for (const p of pendingImages()) {
      URL.revokeObjectURL(p.previewUrl)
    }
    chatActions.setConversationMessages(props.conversationId, chat.messages())
  })

  function removePendingImage(id: string) {
    setPendingImages((list) => {
      const found = list.find((p) => p.id === id)
      if (found) URL.revokeObjectURL(found.previewUrl)
      return list.filter((p) => p.id !== id)
    })
  }

  function removePendingFile(id: string) {
    setPendingFiles((list) => list.filter((p) => p.id !== id))
  }

  async function onImageInput(e: Event & { currentTarget: HTMLInputElement }) {
    const input = e.currentTarget
    const files = input.files
    input.value = ''
    if (!files?.length) return
    setAttachError(null)
    const next: PendingImage[] = []
    try {
      for (const file of Array.from(files)) {
        if (!isImageFile(file)) continue
        if (file.size > MAX_IMAGE_BYTES) {
          setAttachError(
            `Image “${file.name}” is too large (max ${MAX_IMAGE_BYTES / 1024 / 1024}MB).`,
          )
          continue
        }
        const dataUrl = await readFileAsDataUrl(file)
        const { mimeType, base64 } = parseDataUrl(dataUrl)
        const previewUrl = URL.createObjectURL(file)
        next.push({
          id: crypto.randomUUID(),
          mimeType,
          base64,
          previewUrl,
        })
      }
      if (next.length) setPendingImages((p) => [...p, ...next])
    } catch (err) {
      setAttachError(
        err instanceof Error ? err.message : 'Could not read image file.',
      )
    }
  }

  async function onFileInput(e: Event & { currentTarget: HTMLInputElement }) {
    const input = e.currentTarget
    const files = input.files
    input.value = ''
    if (!files?.length) return
    setAttachError(null)
    const next: PendingFile[] = []
    try {
      for (const file of Array.from(files)) {
        if (!isPdfFile(file)) {
          setAttachError('Only PDF files are supported for document upload.')
          continue
        }
        if (file.size > MAX_PDF_BYTES) {
          setAttachError(
            `PDF “${file.name}” is too large (max ${MAX_PDF_BYTES / 1024 / 1024}MB).`,
          )
          continue
        }
        const dataUrl = await readFileAsDataUrl(file)
        const { mimeType, base64 } = parseDataUrl(dataUrl)
        next.push({
          id: crypto.randomUUID(),
          name: file.name || 'document.pdf',
          mimeType,
          base64,
        })
      }
      if (next.length) setPendingFiles((p) => [...p, ...next])
    } catch (err) {
      setAttachError(
        err instanceof Error ? err.message : 'Could not read document.',
      )
    }
  }

  function canSend() {
    if (chat.isLoading()) return false
    const t = draft().trim()
    if (t) return true
    if (pendingImages().length > 0) return true
    if (pendingFiles().length > 0) return true
    return false
  }

  async function onSubmit(e: Event) {
    e.preventDefault()
    if (!canSend()) return

    const text = draft().trim()
    const imgs = pendingImages()
    const docs = pendingFiles()
    const parts: ContentPart[] = []

    if (text) parts.push({ type: 'text', content: text })
    for (const img of imgs) {
      parts.push({
        type: 'image',
        source: {
          type: 'data',
          value: img.base64,
          mimeType: img.mimeType,
        },
      })
    }
    for (const doc of docs) {
      parts.push({
        type: 'document',
        source: {
          type: 'data',
          value: doc.base64,
          mimeType: doc.mimeType,
        },
        metadata: { filename: doc.name },
      })
    }

    if (parts.length === 0) return

    setDraft('')
    for (const p of imgs) URL.revokeObjectURL(p.previewUrl)
    setPendingImages([])
    setPendingFiles([])

    await chat.sendMessage({ content: parts })
  }

  let imageInputEl: HTMLInputElement | undefined
  let fileInputEl: HTMLInputElement | undefined

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-6">
        <For each={chat.messages()}>
          {(message) => (
            <article
              class="flex"
              classList={{
                'justify-end': message.role === 'user',
                'justify-start': message.role !== 'user',
              }}
            >
              <div
                class="max-w-[min(100%,42rem)] rounded-2xl px-4 py-3 text-sm shadow-sm"
                classList={{
                  'bg-[var(--primary)] text-[var(--primary-foreground)]':
                    message.role === 'user',
                  'border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)]':
                    message.role === 'assistant',
                  'bg-[var(--muted)] text-[var(--muted-foreground)]':
                    message.role === 'system',
                }}
              >
                <MessageParts message={message} />
              </div>
            </article>
          )}
        </For>
        <Show when={chat.error()} keyed>
          {(err) => (
            <div class="bg-destructive/10 text-destructive rounded-xl px-3 py-2 text-sm">
              {err.message}
            </div>
          )}
        </Show>
      </div>

      <form
        class="border-t border-border bg-card shrink-0 p-3 sm:p-4"
        onSubmit={onSubmit}
      >
        <div class="mx-auto flex max-w-3xl flex-col gap-2">
          <Show when={supportsImage() || supportsDocument()}>
            <div class="flex flex-wrap items-center gap-2">
              <Show when={supportsImage()}>
                <button
                  type="button"
                  class="border-border text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                  disabled={chat.isLoading()}
                  onClick={() => imageInputEl?.click()}
                >
                  <ImageIcon class="size-3.5 shrink-0" aria-hidden={true} />
                  Image
                </button>
                <input
                  ref={imageInputEl}
                  type="file"
                  accept="image/*"
                  multiple
                  class="sr-only"
                  aria-label="Attach images"
                  onChange={onImageInput}
                />
              </Show>
              <Show when={supportsDocument()}>
                <button
                  type="button"
                  class="border-border text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                  disabled={chat.isLoading()}
                  onClick={() => fileInputEl?.click()}
                >
                  <FileText class="size-3.5 shrink-0" aria-hidden={true} />
                  PDF
                </button>
                <input
                  ref={fileInputEl}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  class="sr-only"
                  aria-label="Attach PDF"
                  onChange={onFileInput}
                />
              </Show>
            </div>
          </Show>

          <Show when={attachError()} keyed>
            {(msg) => (
              <p class="text-destructive text-xs" role="alert">
                {msg}
              </p>
            )}
          </Show>

          <Show when={tokenUsageLine()} keyed>
            {(line) => (
              <p
                class="text-muted-foreground text-xs tabular-nums"
                title="Context = prompt tokens sent to the model on the last completed reply. Totals sum each API-reported run in this chat."
              >
                {line}
              </p>
            )}
          </Show>

          <Show
            when={pendingImages().length > 0 || pendingFiles().length > 0}
          >
            <ul class="flex flex-wrap gap-2">
              <For each={pendingImages()}>
                {(img) => (
                  <li class="relative inline-block">
                    <img
                      src={img.previewUrl}
                      alt=""
                      class="border-border h-16 w-16 rounded-lg border object-cover"
                    />
                    <button
                      type="button"
                      class="bg-background/90 ring-border absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full shadow ring-1"
                      aria-label="Remove image"
                      onClick={() => removePendingImage(img.id)}
                    >
                      <X class="size-3" aria-hidden={true} />
                    </button>
                  </li>
                )}
              </For>
              <For each={pendingFiles()}>
                {(f) => (
                  <li class="border-border bg-muted/50 text-muted-foreground relative inline-flex max-w-48 items-center gap-1 rounded-lg border px-2 py-1 text-xs">
                    <FileText class="size-3.5 shrink-0" aria-hidden={true} />
                    <span class="min-w-0 truncate">{f.name}</span>
                    <button
                      type="button"
                      class="hover:text-foreground ml-1 shrink-0 rounded p-0.5"
                      aria-label="Remove file"
                      onClick={() => removePendingFile(f.id)}
                    >
                      <X class="size-3.5" aria-hidden={true} />
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>

          <div class="flex gap-2">
            <textarea
              class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring max-h-40 min-h-11 flex-1 resize-y rounded-xl border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
              placeholder="Message…"
              rows={2}
              value={draft()}
              onInput={(e) => setDraft(e.currentTarget.value)}
              disabled={chat.isLoading()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                  e.preventDefault()
                  void onSubmit(e)
                }
              }}
            />
            <div class="flex flex-col gap-2">
              <button
                type="submit"
                class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
                disabled={!canSend()}
              >
                Send
              </button>
              <Show when={chat.isLoading()}>
                <button
                  type="button"
                  class="border-border hover:bg-muted rounded-xl border px-3 py-1 text-xs"
                  onClick={() => chat.stop()}
                >
                  Stop
                </button>
              </Show>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

function MessageParts(props: { message: UIMessage }) {
  return (
    <For each={props.message.parts}>
      {(part) => <PartBlock part={part} role={props.message.role} />}
    </For>
  )
}

function PartBlock(props: {
  part: UIMessage['parts'][number]
  role: UIMessage['role']
}) {
  const part = props.part
  if (part.type === 'text') {
    return <TextPart role={props.role} content={part.content} />
  }
  if (part.type === 'image') {
    return <ImagePart part={part} />
  }
  if (part.type === 'document') {
    return <DocumentPart part={part} />
  }
  if (part.type === 'thinking') {
    return (
      <details class="group mt-2 overflow-hidden rounded-lg border border-border first:mt-0">
        <summary class="text-muted-foreground hover:bg-muted/40 cursor-pointer list-none px-3 py-2 text-xs font-medium select-none [&::-webkit-details-marker]:hidden">
          <span class="mr-1.5 inline-block transition-transform duration-150 group-open:rotate-90">
            ▸
          </span>
          Reasoning
        </summary>
        <div class="text-muted-foreground border-t border-border px-3 py-2 text-xs italic whitespace-pre-wrap">
          {part.content}
        </div>
      </details>
    )
  }
  if (part.type === 'tool-call') {
    return (
      <pre class="bg-muted mt-2 max-h-48 overflow-auto rounded-lg p-2 text-xs first:mt-0">
        <span class="font-semibold">{part.name}</span>
        {'\n'}
        {part.arguments}
      </pre>
    )
  }
  if (part.type === 'tool-result') {
    return (
      <pre class="bg-muted mt-2 max-h-48 overflow-auto rounded-lg p-2 text-xs first:mt-0">
        {part.content}
      </pre>
    )
  }
  return (
    <p class="text-muted-foreground text-xs">
      Unsupported part: {(part as { type: string }).type}
    </p>
  )
}

function ImagePart(props: {
  part: Extract<UIMessage['parts'][number], { type: 'image' }>
}) {
  const p = props.part
  const src = () => {
    if (p.source.type === 'data') {
      const v = p.source.value
      if (v.startsWith('data:')) return v
      return `data:${p.source.mimeType};base64,${v}`
    }
    return p.source.value
  }
  return (
    <img
      src={src()}
      alt=""
      class="mt-2 max-h-56 max-w-full rounded-lg border border-white/20 object-contain first:mt-0"
    />
  )
}

function DocumentPart(props: {
  part: Extract<UIMessage['parts'][number], { type: 'document' }>
}) {
  const meta = props.part.metadata as { filename?: string } | undefined
  const name = meta?.filename ?? 'Attached file'
  return (
    <p class="mt-2 flex items-center gap-1.5 text-xs opacity-90 first:mt-0">
      <FileText class="size-3.5 shrink-0" aria-hidden={true} />
      <span class="truncate">{name}</span>
    </p>
  )
}

function TextPart(props: { role: UIMessage['role']; content: string }) {
  const theme = useTheme()
  const [html, setHtml] = createSignal(
    props.role === 'assistant'
      ? renderMarkdownToHtmlSync(props.content)
      : '',
  )

  createEffect(() => {
    if (props.role !== 'assistant') return
    const raw = props.content
    const dark = theme.effective() === 'dark'
    setHtml(renderMarkdownToHtmlSync(raw))
    const run = { cancelled: false }
    void (async () => {
      const { renderMarkdownToHtml } = await import('../../lib/markdown')
      const rendered = await renderMarkdownToHtml(raw, { dark })
      if (!run.cancelled) setHtml(rendered)
    })()
    onCleanup(() => {
      run.cancelled = true
    })
  })

  if (props.role === 'assistant') {
    return <div class="chat-md" innerHTML={html()}></div>
  }
  return <p class="whitespace-pre-wrap">{props.content}</p>
}
