import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from 'solid-js'
import { stream, useChat } from '@tanstack/ai-solid'
import type { UIMessage } from '@tanstack/ai-solid'
import type { ContentPart, StreamChunk } from '@tanstack/ai'
import { useServerFn } from '@tanstack/solid-start'
import {
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  RotateCw,
  X,
} from 'lucide-solid'
import { useTheme } from '../../lib/theme-context'
import { streamOpenRouterChat } from '../../server/openrouter-fns'
import {
  modelSupportsDocumentInput,
  modelSupportsImageInput,
} from '../../lib/chat-models'
import {
  attachTokenUsageToLastAssistantMessage,
  chatActions,
} from '../../store/chat.store'
import type { ChatUIMessage, TokenUsageSnapshot } from '../../store/chat.store'
import { useChatStore } from '../../store/chat.hooks'
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

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif)$/i

function guessImageMimeFromFilename(name: string): string | null {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/)
  if (!m) return null
  const ext = m[1]
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    heic: 'image/heic',
    heif: 'image/heif',
  }
  return map[ext] ?? null
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT_RE.test(file.name)
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

/** Parts we can round-trip through sendMessage for resend. */
function userMessageToResendParts(message: UIMessage): ContentPart[] | null {
  if (message.role !== 'user') return null
  const out: ContentPart[] = []
  for (const p of message.parts) {
    if (p.type === 'text') {
      out.push({ type: 'text', content: p.content })
    } else if (p.type === 'image') {
      out.push({
        type: 'image',
        source: p.source,
        ...(p.metadata != null ? { metadata: p.metadata } : {}),
      })
    } else if (p.type === 'document') {
      out.push({
        type: 'document',
        source: p.source,
        ...(p.metadata != null ? { metadata: p.metadata } : {}),
      })
    }
  }
  return out.length > 0 ? out : null
}

function formatReplyTokenLine(usage: TokenUsageSnapshot): string {
  return `Reply: ${formatTokenCount(usage.promptTokens)} context · ${formatTokenCount(usage.completionTokens)} out`
}

export default function ChatThread(props: {
  conversationId: string
  initialMessages: ChatUIMessage[]
  inputModalities?: string[]
  /** Committed key from the client (after blur); optional server env only for local dev. */
  openRouterApiKey: string
}) {
  const [draft, setDraft] = createSignal('')
  const [pendingImages, setPendingImages] = createSignal<PendingImage[]>([])
  const [pendingFiles, setPendingFiles] = createSignal<PendingFile[]>([])
  const [attachError, setAttachError] = createSignal<string | null>(null)
  const [imageAttachNotice, setImageAttachNotice] = createSignal<string | null>(
    null,
  )
  const [imageButtonPulse, setImageButtonPulse] = createSignal(false)

  let imageAttachNoticeTimer: ReturnType<typeof setTimeout> | null = null
  let imageButtonPulseTimer: ReturnType<typeof setTimeout> | null = null

  function flashImageAttached(count: number) {
    if (imageAttachNoticeTimer != null) {
      clearTimeout(imageAttachNoticeTimer)
      imageAttachNoticeTimer = null
    }
    const msg =
      count === 1
        ? 'Image attached — it will send with your next message.'
        : `${count} images attached — they will send with your next message.`
    setImageAttachNotice(msg)
    imageAttachNoticeTimer = setTimeout(() => {
      setImageAttachNotice(null)
      imageAttachNoticeTimer = null
    }, 4200)

    if (imageButtonPulseTimer != null) {
      clearTimeout(imageButtonPulseTimer)
      imageButtonPulseTimer = null
    }
    setImageButtonPulse(true)
    imageButtonPulseTimer = setTimeout(() => {
      setImageButtonPulse(false)
      imageButtonPulseTimer = null
    }, 900)
  }

  const supportsImage = createMemo(() =>
    modelSupportsImageInput(props.inputModalities),
  )
  const supportsDocument = createMemo(() =>
    modelSupportsDocumentInput(props.inputModalities),
  )
  const attachmentSummary = createMemo(() => {
    const imageCount = pendingImages().length
    const fileCount = pendingFiles().length

    if (imageCount > 0 || fileCount > 0) {
      const parts: string[] = []
      if (imageCount > 0) {
        parts.push(imageCount === 1 ? '1 image ready' : `${imageCount} images ready`)
      }
      if (fileCount > 0) {
        parts.push(fileCount === 1 ? '1 PDF ready' : `${fileCount} PDFs ready`)
      }
      return `${parts.join(' · ')}. Press Send to include ${imageCount + fileCount === 1 ? 'it' : 'them'}.`
    }

    if (!supportsImage() && supportsDocument()) {
      return 'This model accepts PDFs, but not image uploads.'
    }
    if (!supportsImage() && !supportsDocument()) {
      return 'This model only accepts text. Switch models to attach images or PDFs.'
    }

    return null
  })

  const selectedModel = useChatStore((state) => state.selectedModel)
  const customSystemMessage = useChatStore(
    (state) =>
      state.conversationsById[props.conversationId]?.customSystemMessage ?? '',
  )
  const sessionTotalTokens = useChatStore(
    (state) => state.conversationsById[props.conversationId]?.sessionTotalTokens,
  )
  const sessionTotalSuffix = createMemo(() => {
    const session = sessionTotalTokens()
    if (typeof session !== 'number' || session <= 0) return ''
    return ` · This chat: ~${formatTokenCount(session)} tokens total`
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
      const recordedAt = Date.now()
      const snap: TokenUsageSnapshot = {
        promptTokens: u.promptTokens,
        completionTokens: u.completionTokens,
        totalTokens: u.totalTokens,
        recordedAt,
      }
      // Patch after the stream processor finishes this tick — avoids racing
      // `setMessages` against internal updates (which could clear or stale the list).
      queueMicrotask(() => {
        const msgs = chat.messages() as ChatUIMessage[]
        if (msgs.length === 0) return
        let foundAssistant = false
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant') {
            foundAssistant = true
            break
          }
        }
        if (!foundAssistant) return
        const next = attachTokenUsageToLastAssistantMessage(msgs, snap)
        chat.setMessages(next as UIMessage[])
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
            model: selectedModel(),
            customSystemMessage: customSystemMessage(),
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
      commitConversationMessages()
    },
  })

  function commitConversationMessages(messages = chat.messages() as ChatUIMessage[]) {
    chatActions.setConversationMessages(props.conversationId, messages)
  }

  function scheduleCommitCurrentMessages() {
    queueMicrotask(() => {
      commitConversationMessages()
    })
  }

  createEffect(() => {
    if (!chat.error()) return
    scheduleCommitCurrentMessages()
  })

  const lastAssistantMessageIndex = createMemo(() => {
    const msgs = chat.messages()
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') return i
    }
    return -1
  })

  async function resendUserMessage(message: UIMessage) {
    if (message.role !== 'user' || chat.isLoading()) return
    const parts = userMessageToResendParts(message)
    if (!parts) return
    const msgs = chat.messages()
    const idx = msgs.findIndex((m) => m.id === message.id)
    if (idx === -1) return
    const truncated = msgs.slice(0, idx)
    chat.setMessages(truncated)
    commitConversationMessages(truncated as ChatUIMessage[])
    const sendPromise = chat.sendMessage({
      content: parts,
    } as unknown as Parameters<typeof chat.sendMessage>[0])
    scheduleCommitCurrentMessages()
    await sendPromise
  }

  onCleanup(() => {
    if (imageAttachNoticeTimer != null) {
      clearTimeout(imageAttachNoticeTimer)
      imageAttachNoticeTimer = null
    }
    if (imageButtonPulseTimer != null) {
      clearTimeout(imageButtonPulseTimer)
      imageButtonPulseTimer = null
    }
    for (const p of pendingImages()) {
      URL.revokeObjectURL(p.previewUrl)
    }
    commitConversationMessages()
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
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (!files.length) return
    setAttachError(null)
    let sawUnsupportedFile = false
    const next: PendingImage[] = []
    try {
      for (const file of files) {
        if (!isImageFile(file)) {
          sawUnsupportedFile = true
          continue
        }
        if (file.size > MAX_IMAGE_BYTES) {
          setAttachError(
            `Image “${file.name}” is too large (max ${MAX_IMAGE_BYTES / 1024 / 1024}MB).`,
          )
          continue
        }
        const dataUrl = await readFileAsDataUrl(file)
        const { base64, mimeType: parsedMime } = parseDataUrl(dataUrl)
        let mimeType = parsedMime
        if (!mimeType.startsWith('image/')) {
          const guessed = guessImageMimeFromFilename(file.name)
          if (guessed) mimeType = guessed
        }
        if (!mimeType.startsWith('image/')) {
          setAttachError(
            `Could not detect image type for “${file.name}”. Try PNG or JPEG.`,
          )
          continue
        }
        const previewUrl = URL.createObjectURL(file)
        next.push({
          id: crypto.randomUUID(),
          mimeType,
          base64,
          previewUrl,
        })
      }
      if (next.length) {
        setPendingImages((p) => [...p, ...next])
        flashImageAttached(next.length)
      } else if (sawUnsupportedFile) {
        setAttachError(
          'No supported image files were attached. Try PNG, JPEG, WebP, GIF, BMP, SVG, HEIC, or HEIF.',
        )
      }
    } catch (err) {
      setAttachError(
        err instanceof Error ? err.message : 'Could not read image file.',
      )
    }
  }

  async function onFileInput(e: Event & { currentTarget: HTMLInputElement }) {
    const input = e.currentTarget
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (!files.length) return
    setAttachError(null)
    const next: PendingFile[] = []
    try {
      for (const file of files) {
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
    if (imageAttachNoticeTimer != null) {
      clearTimeout(imageAttachNoticeTimer)
      imageAttachNoticeTimer = null
    }
    setImageAttachNotice(null)

    const sendPromise = chat.sendMessage({
      content: parts,
    } as unknown as Parameters<typeof chat.sendMessage>[0])
    scheduleCommitCurrentMessages()
    await sendPromise
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-6">
        <For each={chat.messages()}>
          {(message, index) => (
            <article
              class="flex"
              classList={{
                'justify-end': message.role === 'user',
                'justify-start': message.role !== 'user',
              }}
            >
              <div
                class="flex max-w-[min(100%,42rem)] flex-col gap-1"
                classList={{
                  'items-end': message.role === 'user',
                  'items-start': message.role !== 'user',
                }}
              >
                <div
                  class="rounded-2xl px-4 py-3 text-sm shadow-sm"
                  classList={{
                    'bg-[var(--primary)] text-[var(--primary-foreground)]':
                      message.role === 'user',
                    'border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)]':
                      message.role === 'assistant',
                    'bg-[var(--muted)] text-[var(--muted-foreground)]':
                      message.role === 'system',
                  }}
                >
                  <MessageParts
                    message={message}
                    streaming={
                      message.role === 'assistant' &&
                      chat.isLoading() &&
                      index() === lastAssistantMessageIndex()
                    }
                  />
                </div>
                <Show
                  when={
                    message.role === 'assistant'
                      ? (message as ChatUIMessage).tokenUsage
                      : false
                  }
                  keyed
                >
                  {(usage) => (
                    <p
                      class="text-muted-foreground max-w-full px-0.5 text-xs tabular-nums"
                      title="Context = prompt tokens for this reply. Chat total sums each API-reported run in this conversation."
                    >
                      {formatReplyTokenLine(usage)}
                      {index() === lastAssistantMessageIndex()
                        ? sessionTotalSuffix()
                        : ''}
                    </p>
                  )}
                </Show>
                <Show
                  when={
                    message.role === 'user' &&
                    userMessageToResendParts(message) !== null
                  }
                >
                  <button
                    type="button"
                    class="text-primary-foreground/85 hover:text-primary-foreground inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-40"
                    disabled={chat.isLoading()}
                    aria-label="Resend this message"
                    onClick={() => void resendUserMessage(message)}
                  >
                    <RotateCw class="size-3 shrink-0" aria-hidden={true} />
                    Resend
                  </button>
                </Show>
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
                <div
                  class="border-border text-muted-foreground hover:bg-muted hover:text-foreground relative inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-[box-shadow,background-color,color] duration-300 disabled:opacity-50"
                  classList={{
                    'ring-primary/70 bg-primary/5 text-foreground ring-2':
                      imageButtonPulse(),
                    'pointer-events-none opacity-50': chat.isLoading(),
                  }}
                >
                  <ImageIcon class="size-3.5 shrink-0" aria-hidden={true} />
                  Image
                  <Show when={pendingImages().length > 0}>
                    <span class="bg-primary/15 text-primary rounded-full px-1.5 py-px text-[10px] font-semibold">
                      {pendingImages().length}
                    </span>
                  </Show>
                  <input
                    id="chat-image-input"
                    type="file"
                    accept="image/*"
                    multiple
                    class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label="Attach images"
                    onChange={onImageInput}
                  />
                </div>
              </Show>
              <Show when={supportsDocument()}>
                <div
                  class="border-border text-muted-foreground hover:bg-muted hover:text-foreground relative inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                  classList={{
                    'pointer-events-none opacity-50': chat.isLoading(),
                  }}
                >
                  <FileText class="size-3.5 shrink-0" aria-hidden={true} />
                  PDF
                  <input
                    id="chat-pdf-input"
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label="Attach PDF"
                    onChange={onFileInput}
                  />
                </div>
              </Show>
            </div>
          </Show>

          <Show when={attachmentSummary()} keyed>
            {(summary) => (
              <p class="text-muted-foreground text-xs" aria-live="polite">
                {summary}
              </p>
            )}
          </Show>

          <Show when={attachError()} keyed>
            {(msg) => (
              <p class="text-destructive text-xs" role="alert">
                {msg}
              </p>
            )}
          </Show>

          <Show when={imageAttachNotice()} keyed>
            {(msg) => (
              <div
                class="border-primary/25 bg-primary/8 text-foreground flex items-start gap-2 rounded-xl border px-3 py-2 text-xs shadow-sm"
                role="status"
                aria-live="polite"
              >
                <CheckCircle2
                  class="text-primary mt-0.5 size-3.5 shrink-0"
                  aria-hidden={true}
                />
                <span>{msg}</span>
              </div>
            )}
          </Show>


          <Show
            when={pendingImages().length > 0 || pendingFiles().length > 0}
          >
            <ul
              class="flex flex-wrap gap-2"
              aria-label="Attachments ready to send"
            >
              <For each={pendingImages()}>
                {(img) => (
                  <li class="relative inline-block">
                    <img
                      src={img.previewUrl}
                      alt=""
                      class="border-border h-16 w-16 rounded-lg border object-cover shadow-sm"
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
                  onClick={() => {
                    chat.stop()
                    scheduleCommitCurrentMessages()
                  }}
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

function MessageParts(props: { message: UIMessage; streaming: boolean }) {
  return (
    <For each={props.message.parts}>
      {(part) => (
        <PartBlock
          part={part}
          role={props.message.role}
          streaming={props.streaming}
        />
      )}
    </For>
  )
}

function PartBlock(props: {
  part: UIMessage['parts'][number]
  role: UIMessage['role']
  streaming: boolean
}) {
  const part = props.part
  if (part.type === 'text') {
    return (
      <TextPart
        role={props.role}
        content={part.content}
        streaming={props.streaming}
      />
    )
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

function TextPart(props: {
  role: UIMessage['role']
  content: string
  streaming: boolean
}) {
  const theme = useTheme()
  const [html, setHtml] = createSignal(
    props.role === 'assistant' && !props.streaming
      ? renderMarkdownToHtmlSync(props.content)
      : '',
  )

  createEffect(() => {
    if (props.role !== 'assistant') return
    if (props.streaming) return
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

  if (props.role === 'assistant' && props.streaming) {
    return <p class="whitespace-pre-wrap">{props.content}</p>
  }
  if (props.role === 'assistant') {
    return <div class="chat-md" innerHTML={html()}></div>
  }
  return <p class="whitespace-pre-wrap">{props.content}</p>
}
