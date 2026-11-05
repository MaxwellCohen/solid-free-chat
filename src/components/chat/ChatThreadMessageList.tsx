import { For, Show, createEffect, createSignal, onSettled } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { UIMessage } from '@tanstack/ai-client'
import type { ContentPart } from '@tanstack/ai'
import {
  onScrollToMessage,
  peekPendingScroll,
} from '../../lib/scroll-to-message'
import { createVirtualizer } from '../../lib/create-virtualizer'
import type { VirtualItem, Virtualizer } from '../../lib/create-virtualizer'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitBranch,
  Pencil,
  RotateCw,
  Square,
  Star,
  Volume2,
} from '../icons'
import {
  isSpeechSynthesisSupported,
  speak,
  speakingId,
  stopSpeaking,
} from '../../lib/speech'
import type { ChatUIMessage } from '../../store/chat.store'
import {
  formatReplyTokenLine,
  messageToPlainText,
  userMessageToResendParts,
  withEditedText,
} from './chat-thread-utils'
import { MessageParts } from './ChatMessageParts'
import { STARTER_PROMPTS } from '../../lib/starter-prompts'
import { classifyChatError } from '../../lib/chat-error'

const MESSAGE_GAP_PX = 16
const ESTIMATED_MESSAGE_HEIGHT_PX = 96
const SCROLL_END_THRESHOLD_PX = 96

type ChatThreadMessageListProps = {
  messages: () => ChatUIMessage[]
  isLoading: () => boolean
  lastAssistantMessageIndex: () => number
  sessionTotalSuffix: () => string
  onResendUserMessage: (message: UIMessage, editedParts?: ContentPart[]) => void
  onRegenerateMessage: (message: UIMessage) => void
  onBranchMessage: (message: UIMessage) => void
  onToggleBookmark: (message: UIMessage) => void
  onSwitchVariant: (message: UIMessage, index: number) => void
  failedUserMessage: () => UIMessage | null
  error: () => Error | undefined
  onReconnectOpenRouter?: () => void
  providerName: string
  onPickStarter: (prompt: string) => void
}

export function ChatThreadMessageList(props: ChatThreadMessageListProps) {
  let scrollContainerRef: HTMLDivElement | undefined

  const hasPendingScroll = peekPendingScroll()
  const virtualizer = createVirtualizer({
    get count() {
      return props.messages().length
    },
    getScrollElement: () => scrollContainerRef ?? null,
    estimateSize: () => ESTIMATED_MESSAGE_HEIGHT_PX,
    getItemKey: (index) => props.messages()[index]?.id ?? index,
    anchorTo: 'end',
    followOnAppend: false,
    scrollEndThreshold: SCROLL_END_THRESHOLD_PX,
    gap: MESSAGE_GAP_PX,
    overscan: 6,
  })

  onSettled(() => {
    const stop = onScrollToMessage((id) => {
      const index = props.messages().findIndex((m) => m.id === id)
      if (index === -1) return
      requestAnimationFrame(() =>
        virtualizer.scrollToIndex(index, { align: 'center' }),
      )
    })
    // A pending search jump replaces the default scroll-to-bottom.
    if (!hasPendingScroll) virtualizer.scrollToEnd()
    return stop
  })

  // When the user sends a message, pin it to the top so the reply fills the view.
  let prevCount = props.messages().length
  createEffect(
    () => props.messages().length,
    (count) => {
      const last = props.messages().at(count - 1)
      if (count > prevCount && last?.role === 'user') {
        requestAnimationFrame(() =>
          virtualizer.scrollToIndex(count - 1, { align: 'start' }),
        )
      }
      prevCount = count
    },
  )

  // Trailing space so the last user message can scroll to the top before the reply grows.
  const trailingSpace = () => {
    const total = virtualizer.getTotalSize()
    const count = props.messages().length
    let i = count - 1
    while (i >= 0 && props.messages()[i]?.role !== 'user') i--
    const start =
      i >= 0 ? virtualizer.measurementsCache.at(i)?.start : undefined
    if (start === undefined || !scrollContainerRef) return 0
    return Math.max(0, scrollContainerRef.clientHeight - 32 - (total - start))
  }

  return (
    <div
      ref={(el) => {
        scrollContainerRef = el
      }}
      role="log"
      aria-label="Conversation"
      aria-live="polite"
      class="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6"
    >
      <Show when={props.messages().length === 0 && !props.isLoading()}>
        <div class="mx-auto flex max-w-2xl flex-col items-center gap-4 py-8 text-center">
          <h2 class="text-foreground text-lg font-semibold tracking-tight">
            How can I help today?
          </h2>
          <div class="grid w-full gap-2 sm:grid-cols-2">
            <For each={STARTER_PROMPTS}>
              {(starter) => (
                <button
                  type="button"
                  class="border-border hover:bg-muted rounded-xl border p-3 text-left"
                  onClick={() => props.onPickStarter(starter.prompt)}
                >
                  <span class="text-foreground block text-sm font-medium">
                    {starter.title}
                  </span>
                  <span class="text-muted-foreground block text-xs">
                    {starter.description}
                  </span>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
      <div
        class="relative w-full"
        style={{ height: `${virtualizer.getTotalSize() + trailingSpace()}px` }}
      >
        {/* Key by item key: the virtualizer re-creates item objects on every measure,
            and remounting would reset open <details> (e.g. Reasoning). */}
        <For each={virtualizer.getVirtualItems()} keyed={(item) => item.key}>
          {(virtualItem) => (
            <VirtualChatMessage
              virtualItem={virtualItem}
              virtualizer={virtualizer}
              listProps={props}
            />
          )}
        </For>
      </div>
      <ErrorBanner props={props} />
    </div>
  )
}

function VirtualChatMessage(props: {
  virtualItem: Accessor<VirtualItem>
  virtualizer: Virtualizer<HTMLDivElement, Element>
  listProps: ChatThreadMessageListProps
}) {
  // Read from the live messages list so streaming updates stay reactive
  // even though virtual items themselves do not change identity.
  const message = () => props.listProps.messages()[props.virtualItem().index]
  const [editing, setEditing] = createSignal(false)

  return (
    <Show when={message()}>
      {(msg) => (
        <article
          data-index={props.virtualItem().index}
          data-message-id={msg().id}
          ref={(el) => {
            // Solid assigns refs before the node is connected; defer measurement.
            queueMicrotask(() => props.virtualizer.measureElement(el))
          }}
          class={[
            'absolute top-0 left-0 flex w-full',
            {
              'justify-end': msg().role === 'user',
              'justify-start': msg().role !== 'user',
            },
          ]}
          style={{
            transform: `translateY(${props.virtualItem().start}px)`,
          }}
        >
          <div
            class={[
              'flex min-w-0 max-w-[min(100%,var(--chat-message-width,42rem))] flex-col gap-1',
              {
                'items-end': msg().role === 'user',
                'items-start': msg().role !== 'user',
              },
            ]}
          >
            <Show when={editing()} fallback={<MessageBubble message={msg()} />}>
              <EditMessageForm
                message={msg()}
                onCancel={() => setEditing(false)}
                onSave={(text) => {
                  setEditing(false)
                  const parts = userMessageToResendParts(msg())
                  if (parts) {
                    void props.listProps.onResendUserMessage(
                      msg(),
                      withEditedText(parts, text),
                    )
                  }
                }}
              />
            </Show>
            <AssistantUsageLine
              message={msg()}
              isLastAssistantMessage={
                props.virtualItem().index ===
                props.listProps.lastAssistantMessageIndex()
              }
              sessionTotalSuffix={props.listProps.sessionTotalSuffix}
            />
            <MessageActions
              message={msg()}
              isLoading={props.listProps.isLoading}
              onEdit={() => setEditing(true)}
              onRegenerate={props.listProps.onRegenerateMessage}
              onBranch={props.listProps.onBranchMessage}
              onToggleBookmark={props.listProps.onToggleBookmark}
              onSwitchVariant={props.listProps.onSwitchVariant}
            />
            <UserResendButton
              message={msg()}
              isLoading={props.listProps.isLoading}
              failedUserMessage={props.listProps.failedUserMessage}
              onResendUserMessage={props.listProps.onResendUserMessage}
            />
          </div>
        </article>
      )}
    </Show>
  )
}

function MessageBubble(props: { message: ChatUIMessage }) {
  return (
    <div
      class={[
        'chat-bubble max-w-full min-w-0 rounded-2xl px-3 py-2.5 text-sm [overflow-wrap:anywhere] shadow-sm sm:px-4 sm:py-3',
        {
          'bg-[var(--primary)] text-[var(--primary-foreground)]':
            props.message.role === 'user',
          'border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)]':
            props.message.role === 'assistant',
          'bg-[var(--muted)] text-[var(--muted-foreground)]':
            props.message.role === 'system',
        },
      ]}
    >
      <MessageParts message={props.message} />
    </div>
  )
}

function AssistantUsageLine(props: {
  message: ChatUIMessage
  isLastAssistantMessage: boolean
  sessionTotalSuffix: () => string
}) {
  return (
    <Show
      when={
        props.message.role === 'assistant' ? props.message.tokenUsage : false
      }
      keyed
    >
      {(usage) => (
        <p
          data-usage-line
          class="text-muted-foreground max-w-full px-0.5 text-xs tabular-nums"
          title="Context = prompt tokens for this reply. Chat total sums each API-reported run in this conversation."
        >
          {formatReplyTokenLine(usage)}
          {props.isLastAssistantMessage ? props.sessionTotalSuffix() : ''}
        </p>
      )}
    </Show>
  )
}

function UserResendButton(props: {
  message: ChatUIMessage
  isLoading: () => boolean
  failedUserMessage: () => UIMessage | null
  onResendUserMessage: (message: UIMessage, editedParts?: ContentPart[]) => void
}) {
  return (
    <Show
      when={
        props.message.role === 'user' &&
        userMessageToResendParts(props.message) !== null
      }
    >
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-40"
        disabled={props.isLoading()}
        aria-label={
          props.failedUserMessage()?.id === props.message.id
            ? 'Retry this failed message'
            : 'Resend this message'
        }
        onClick={() => void props.onResendUserMessage(props.message)}
      >
        <RotateCw class="size-3 shrink-0" aria-hidden="true" />
        {props.failedUserMessage()?.id === props.message.id
          ? 'Retry'
          : 'Resend'}
      </button>
    </Show>
  )
}

const ACTION_BUTTON_CLASS =
  'text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-40'

function MessageActions(props: {
  message: ChatUIMessage
  isLoading: () => boolean
  onEdit: () => void
  onRegenerate: (message: UIMessage) => void
  onBranch: (message: UIMessage) => void
  onToggleBookmark: (message: UIMessage) => void
  onSwitchVariant: (message: UIMessage, index: number) => void
}) {
  const [copied, setCopied] = createSignal(false)
  const text = () => messageToPlainText(props.message)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable (e.g. insecure context); ignore.
    }
  }

  return (
    <Show when={props.message.role !== 'system'}>
      <div class="flex items-center gap-1">
        <Show when={text()}>
          <button
            type="button"
            class={ACTION_BUTTON_CLASS}
            aria-label="Copy message"
            onClick={() => void copy()}
          >
            <Show
              when={copied()}
              fallback={<Copy class="size-3 shrink-0" aria-hidden="true" />}
            >
              <Check class="size-3 shrink-0" aria-hidden="true" />
            </Show>
            {copied() ? 'Copied' : 'Copy'}
          </button>
        </Show>
        <Show
          when={
            props.message.role === 'user' &&
            userMessageToResendParts(props.message) !== null
          }
        >
          <button
            type="button"
            class={ACTION_BUTTON_CLASS}
            disabled={props.isLoading()}
            aria-label="Edit and resend this message"
            onClick={props.onEdit}
          >
            <Pencil class="size-3 shrink-0" aria-hidden="true" />
            Edit
          </button>
        </Show>
        <Show
          when={
            props.message.role === 'assistant' &&
            text() &&
            isSpeechSynthesisSupported()
          }
        >
          <button
            type="button"
            class={ACTION_BUTTON_CLASS}
            aria-label={
              speakingId() === props.message.id
                ? 'Stop reading aloud'
                : 'Read message aloud'
            }
            title={
              speakingId() === props.message.id
                ? 'Stop reading aloud'
                : 'Read aloud'
            }
            aria-pressed={speakingId() === props.message.id ? 'true' : 'false'}
            onClick={() =>
              speakingId() === props.message.id
                ? stopSpeaking()
                : speak(props.message.id, text())
            }
          >
            <Show
              when={speakingId() === props.message.id}
              fallback={<Volume2 class="size-3 shrink-0" aria-hidden="true" />}
            >
              <Square class="size-3 shrink-0" aria-hidden="true" />
            </Show>
            {speakingId() === props.message.id ? 'Stop' : 'Listen'}
          </button>
        </Show>
        <Show when={(props.message.variants?.length ?? 0) > 1}>
          <span
            class="text-muted-foreground inline-flex items-center text-[11px] tabular-nums"
            role="group"
            aria-label="Reply versions"
          >
            <button
              type="button"
              class={ACTION_BUTTON_CLASS}
              disabled={
                props.isLoading() || (props.message.variantIndex ?? 0) <= 0
              }
              aria-label="Previous version"
              onClick={() =>
                props.onSwitchVariant(
                  props.message,
                  (props.message.variantIndex ?? 0) - 1,
                )
              }
            >
              <ChevronLeft class="size-3" aria-hidden="true" />
            </button>
            <span data-testid="variant-position">
              {(props.message.variantIndex ?? 0) + 1}/
              {props.message.variants?.length ?? 0}
            </span>
            <button
              type="button"
              class={ACTION_BUTTON_CLASS}
              disabled={
                props.isLoading() ||
                (props.message.variantIndex ?? 0) >=
                  (props.message.variants?.length ?? 0) - 1
              }
              aria-label="Next version"
              onClick={() =>
                props.onSwitchVariant(
                  props.message,
                  (props.message.variantIndex ?? 0) + 1,
                )
              }
            >
              <ChevronRight class="size-3" aria-hidden="true" />
            </button>
          </span>
        </Show>
        <Show when={props.message.role === 'assistant'}>
          <button
            type="button"
            class={ACTION_BUTTON_CLASS}
            disabled={props.isLoading()}
            aria-label="Regenerate this response"
            onClick={() => void props.onRegenerate(props.message)}
          >
            <RotateCw class="size-3 shrink-0" aria-hidden="true" />
            Regenerate
          </button>
        </Show>
        <button
          type="button"
          class={ACTION_BUTTON_CLASS}
          aria-label={
            props.message.bookmarked ? 'Remove bookmark' : 'Bookmark message'
          }
          aria-pressed={props.message.bookmarked ? 'true' : 'false'}
          onClick={() => props.onToggleBookmark(props.message)}
        >
          <Star
            class={[
              'size-3 shrink-0',
              { 'fill-current': props.message.bookmarked === true },
            ]}
            aria-hidden="true"
          />
          {props.message.bookmarked ? 'Saved' : 'Save'}
        </button>
        <button
          type="button"
          class={ACTION_BUTTON_CLASS}
          disabled={props.isLoading()}
          aria-label="Branch into a new chat from this message"
          onClick={() => props.onBranch(props.message)}
        >
          <GitBranch class="size-3 shrink-0" aria-hidden="true" />
          Branch
        </button>
      </div>
    </Show>
  )
}

function EditMessageForm(props: {
  message: ChatUIMessage
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = createSignal(messageToPlainText(props.message))
  const canSave = () =>
    value().trim() !== '' ||
    (userMessageToResendParts(props.message)?.some((p) => p.type !== 'text') ??
      false)

  return (
    <form
      class="flex w-full min-w-0 flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave()) props.onSave(value().trim())
      }}
    >
      <textarea
        class="border-border bg-background text-foreground min-h-20 w-full rounded-xl border px-3 py-2 text-sm"
        value={value()}
        onInput={(e) => setValue(e.currentTarget.value)}
        ref={(el) => queueMicrotask(() => el.focus())}
      />
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class={ACTION_BUTTON_CLASS}
          onClick={props.onCancel}
        >
          Cancel
        </button>
        <button type="submit" class={ACTION_BUTTON_CLASS} disabled={!canSave()}>
          Save and resend
        </button>
      </div>
    </form>
  )
}

function ErrorBanner(props: { props: ChatThreadMessageListProps }) {
  const btn =
    'border-destructive/30 hover:bg-destructive/10 rounded-lg border px-2.5 py-1 text-xs font-medium text-current disabled:pointer-events-none disabled:opacity-50'
  return (
    <Show when={props.props.error()} keyed>
      {(err) => {
        const info = () =>
          classifyChatError(err, {
            hasPartialResponse:
              props.props.messages().at(-1)?.role === 'assistant',
            providerName: props.props.providerName,
          })
        return (
          <div
            class="bg-destructive/10 text-destructive mt-4 flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm"
            role="alert"
          >
            <span>
              <span class="font-medium">{info().title}.</span> {info().detail}
            </span>
            <span class="flex shrink-0 gap-2">
              <Show
                when={
                  info().needsReconnect && props.props.onReconnectOpenRouter
                }
              >
                <button
                  type="button"
                  class={btn}
                  onClick={() => props.props.onReconnectOpenRouter?.()}
                >
                  Reconnect {props.props.providerName}
                </button>
              </Show>
              <Show when={props.props.failedUserMessage()} keyed>
                {(message) => (
                  <button
                    type="button"
                    class={btn}
                    disabled={props.props.isLoading()}
                    onClick={() =>
                      void props.props.onResendUserMessage(message)
                    }
                  >
                    Retry
                  </button>
                )}
              </Show>
            </span>
          </div>
        )
      }}
    </Show>
  )
}
