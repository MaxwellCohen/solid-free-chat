import {
  createEffect,
  createMemo,
  createSignal,
  onSettled,
  Show,
  untrack,
} from 'solid-js'
import { stream } from '@tanstack/ai-client'
import type { UIMessage } from '@tanstack/ai-client'
import { useChat } from '../../lib/use-chat'
import type { ContentPart, StreamChunk } from '@tanstack/ai'
import { runAgent } from '../../lib/harness/run-agent'
import { createEnabledTools } from '../../lib/harness/tools'
import {
  modelSupportsDocumentInput,
  modelSupportsImageInput,
} from '../../lib/chat-models'
import {
  computeUsageCost,
  formatCost,
  isOverThreshold,
  loadCostThreshold,
  parseCostThreshold,
  saveCostThreshold,
} from '../../lib/usage-cost'
import type { ModelPricing } from '../../lib/usage-cost'
import { composeSystemPrompt } from '../../lib/compose-system-prompt'
import {
  attachTokenUsageToLastAssistantMessage,
  chatActions,
  createChatHistoryApi,
  createConversationSkillsApi,
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
  isImageFile,
  isPdfFile,
  parseDataUrl,
  readFileAsDataUrl,
  guessImageMimeFromFilename,
  messagesBefore,
  userMessageToResendParts,
} from './chat-thread-utils'

export default function ChatThread(props: {
  conversationId: string
  initialMessages: ChatUIMessage[]
  inputModalities?: string[]
  /** Whether the selected model accepts tool definitions. */
  supportsTools: boolean
  /** Selected model pricing, for estimating cost when the API reports none. */
  modelPricing?: ModelPricing
  /** Committed key from the client (after blur); optional proxy env only for local dev. */
  openRouterApiKey: string
  providerId: string
  onLoadingChange: (isLoading: boolean) => void
  onRegisterStop?: (stop: (() => void) | null) => void
  onReconnectOpenRouter?: () => void
}) {
  return (
    <Show when={props.conversationId} keyed>
      {(conversationId) => (
        <ChatThreadSession
          conversationId={conversationId}
          initialMessages={props.initialMessages}
          inputModalities={props.inputModalities}
          supportsTools={props.supportsTools}
          modelPricing={props.modelPricing}
          openRouterApiKey={props.openRouterApiKey}
          providerId={props.providerId}
          onLoadingChange={props.onLoadingChange}
          onRegisterStop={props.onRegisterStop}
          onReconnectOpenRouter={props.onReconnectOpenRouter}
        />
      )}
    </Show>
  )
}

function ChatThreadSession(props: {
  conversationId: string
  initialMessages: ChatUIMessage[]
  inputModalities?: string[]
  supportsTools: boolean
  modelPricing?: ModelPricing
  /** Committed key from the client (after blur); optional proxy env only for local dev. */
  openRouterApiKey: string
  providerId: string
  onLoadingChange: (isLoading: boolean) => void
  onRegisterStop?: (stop: (() => void) | null) => void
  onReconnectOpenRouter?: () => void
}) {
  // The parent remounts this session per conversation, so these are snapshots.
  const conversationId = untrack(() => props.conversationId)
  const initialMessages = untrack(() => props.initialMessages)
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
  const skillIds = useChatStore(
    (state) => state.conversationsById[conversationId]?.skillIds ?? [],
  )
  const skills = useChatStore((state) => state.skills)
  const enabledToolIds = useChatStore((state) => state.enabledToolIds)
  const sessionTotalTokens = useChatStore(
    (state) => state.conversationsById[conversationId]?.sessionTotalTokens,
  )
  const sessionTotalCost = useChatStore(
    (state) => state.conversationsById[conversationId]?.sessionTotalCost,
  )
  const sessionTotalSuffix = createMemo(() => {
    const session = sessionTotalTokens()
    if (typeof session !== 'number' || session <= 0) return ''
    const cost = sessionTotalCost()
    return ` · This chat: ~${formatTokenCount(session)} tokens${cost === undefined ? '' : `, ${formatCost(cost)}`} total`
  })
  const [costThreshold, setCostThreshold] = createSignal(loadCostThreshold())
  const overThreshold = createMemo(() =>
    isOverThreshold(sessionTotalCost() ?? 0, costThreshold()),
  )

  const chat = useChat({
    id: conversationId,
    initialMessages,
    onChunk: (chunk: StreamChunk) => {
      if (chunk.type !== 'RUN_FINISHED') return
      const u = chunk.usage
      if (!u) return
      const cost = computeUsageCost(u, props.modelPricing)
      chatActions.recordConversationTokenUsage(conversationId, {
        promptTokens: u.promptTokens,
        completionTokens: u.completionTokens,
        totalTokens: u.totalTokens,
        ...(cost !== undefined ? { cost } : {}),
      })
      const recordedAt = Date.now()
      const snap: TokenUsageSnapshot = {
        promptTokens: u.promptTokens,
        completionTokens: u.completionTokens,
        totalTokens: u.totalTokens,
        ...(cost !== undefined ? { cost } : {}),
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
    connection: stream((messages, _data, abortSignal) =>
      runAgent({
        apiKey: props.openRouterApiKey.trim(),
        providerId: props.providerId,
        model: selectedModel(),
        messages,
        systemPrompt: composeSystemPrompt(skillIds(), skills()),
        tools: props.supportsTools
          ? createEnabledTools(enabledToolIds(), {
              skills: createConversationSkillsApi(conversationId),
              history: createChatHistoryApi(conversationId),
            })
          : [],
        abortSignal,
      }),
    ),
    onFinish: () => {
      commitConversationMessages()
    },
  })

  function commitConversationMessages(messages = chat.messages() as ChatUIMessage[]) {
    chatActions.setConversationMessages(conversationId, messages)
  }

  function scheduleCommitCurrentMessages() {
    queueMicrotask(() => {
      commitConversationMessages()
    })
  }

  createEffect(
    () => ({ loading: chat.isLoading(), notify: props.onLoadingChange }),
    ({ loading, notify }) => {
      notify(loading)
    },
  )

  createEffect(
    () => chat.error(),
    (error) => {
      if (error) scheduleCommitCurrentMessages()
    },
  )

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

  async function resendUserMessage(message: UIMessage, editedParts?: ContentPart[]) {
    if (message.role !== 'user' || chat.isLoading()) return
    const parts = editedParts ?? userMessageToResendParts(message)
    if (!parts || parts.length === 0) return
    const truncated = messagesBefore(chat.messages(), message.id)
    if (!truncated) return
    chat.setMessages(truncated)
    commitConversationMessages(truncated as ChatUIMessage[])
    const sendPromise = chat.sendMessage({
      content: parts,
    } as unknown as Parameters<typeof chat.sendMessage>[0])
    scheduleCommitCurrentMessages()
    await sendPromise
  }

  async function regenerateAssistantMessage(message: UIMessage) {
    if (message.role !== 'assistant' || chat.isLoading()) return
    const before = messagesBefore(chat.messages(), message.id)
    const user = before?.filter((m) => m.role === 'user').pop()
    if (user) await resendUserMessage(user)
  }

  function branchFromMessage(message: UIMessage) {
    const upTo = messagesBefore(chat.messages() as ChatUIMessage[], message.id, true)
    if (!upTo) return
    chatActions.setConversationMessages(conversationId, chat.messages() as ChatUIMessage[])
    chatActions.branchConversation(conversationId, upTo)
  }

  onSettled(() => {
    const stop = () => {
      chat.stop()
      scheduleCommitCurrentMessages()
    }
    props.onRegisterStop?.(stop)
    return () => {
      props.onRegisterStop?.(null)
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
    }
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
      <Show when={overThreshold()}>
        <p
          class="border-border bg-muted text-foreground border-b px-3 py-1.5 text-xs"
          role="alert"
        >
          Spending warning: this chat has cost {formatCost(sessionTotalCost() ?? 0)}, over your{' '}
          {formatCost(costThreshold() ?? 0)} limit.
        </p>
      </Show>
      <ChatThreadMessageList
        messages={() => chat.messages() as ChatUIMessage[]}
        isLoading={() => chat.isLoading()}
        lastAssistantMessageIndex={lastAssistantMessageIndex}
        sessionTotalSuffix={sessionTotalSuffix}
        onResendUserMessage={resendUserMessage}
        onRegenerateMessage={regenerateAssistantMessage}
        onBranchMessage={branchFromMessage}
        failedUserMessage={failedUserMessage}
        error={() => chat.error()}
        onReconnectOpenRouter={props.onReconnectOpenRouter}
      />
      <label class="text-muted-foreground flex items-center justify-end gap-1.5 px-3 pt-1 text-xs">
        Warn above $
        <input
          type="text"
          inputmode="decimal"
          class="border-border bg-background w-16 rounded border px-1 py-0.5 tabular-nums"
          placeholder="off"
          value={costThreshold() ?? ''}
          onChange={(e) => {
            const next = parseCostThreshold(e.currentTarget.value)
            saveCostThreshold(next)
            setCostThreshold(next)
          }}
        />
      </label>
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
