import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from 'solid-js'
import { stream, useChat } from '@tanstack/ai-solid'
import type { UIMessage } from '@tanstack/ai-solid'
import type { ContentPart, StreamChunk } from '@tanstack/ai'
import { useServerFn } from '@tanstack/solid-start'
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
import { ChatThreadComposer } from './ChatThreadComposer'
import { ChatThreadMessageList } from './ChatThreadMessageList'
import type { PendingFile, PendingImage } from './chat-thread-utils'
import {
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  formatTokenCount,
  isAsyncIterable,
  isImageFile,
  isPdfFile,
  parseDataUrl,
  readFileAsDataUrl,
  guessImageMimeFromFilename,
  userMessageToResendParts,
} from './chat-thread-utils'

type StreamFactory = Parameters<typeof stream>[0]
type ServerStreamChunk =
  Awaited<
    ReturnType<StreamFactory>[typeof Symbol.asyncIterator]
  > extends AsyncIterator<infer T>
    ? T
    : never

export default function ChatThread(props: {
  conversationId: string
  initialMessages: ChatUIMessage[]
  inputModalities?: string[]
  /** Committed key from the client (after blur); optional server env only for local dev. */
  openRouterApiKey: string
  onLoadingChange: (isLoading: boolean) => void
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
    (state) => state.conversationsById[props.conversationId].customSystemMessage,
  )
  const sessionTotalTokens = useChatStore(
    (state) => state.conversationsById[props.conversationId].sessionTotalTokens,
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
    props.onLoadingChange(chat.isLoading())
  })

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

  const failedUserMessage = createMemo(() => {
    if (!chat.error()) return null
    const msgs = chat.messages() as ChatUIMessage[]
    for (let i = msgs.length - 1; i >= 0; i--) {
      const message = msgs[i]
      if (message.role !== 'user') continue
      if (userMessageToResendParts(message) !== null) return message
    }
    return null
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
    props.onLoadingChange(false)
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
      <ChatThreadMessageList
        messages={() => chat.messages() as ChatUIMessage[]}
        isLoading={() => chat.isLoading()}
        lastAssistantMessageIndex={lastAssistantMessageIndex}
        sessionTotalSuffix={sessionTotalSuffix}
        onResendUserMessage={resendUserMessage}
        failedUserMessage={failedUserMessage}
        error={() => chat.error()}
      />
      <ChatThreadComposer
        supportsImage={supportsImage}
        supportsDocument={supportsDocument}
        pendingImages={pendingImages}
        pendingFiles={pendingFiles}
        imageButtonPulse={imageButtonPulse}
        isLoading={() => chat.isLoading()}
        onImageInput={onImageInput}
        onFileInput={onFileInput}
        attachmentSummary={attachmentSummary}
        attachError={attachError}
        imageAttachNotice={imageAttachNotice}
        onRemovePendingImage={removePendingImage}
        onRemovePendingFile={removePendingFile}
        draft={draft}
        onDraftInput={setDraft}
        onSubmit={onSubmit}
        canSend={canSend}
        onStop={() => {
          chat.stop()
          scheduleCommitCurrentMessages()
        }}
      />
    </div>
  )
}
