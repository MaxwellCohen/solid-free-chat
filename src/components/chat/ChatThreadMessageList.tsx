import { For, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import type { UIMessage } from '@tanstack/ai-solid'
import { RotateCw } from 'lucide-solid'
import type { ChatUIMessage } from '../../store/chat.store'
import { formatReplyTokenLine, userMessageToResendParts } from './chat-thread-utils'
import { MessageParts } from './ChatMessageParts'

type ChatThreadMessageListProps = {
  messages: () => ChatUIMessage[]
  isLoading: () => boolean
  lastAssistantMessageIndex: () => number
  sessionTotalSuffix: () => string
  onResendUserMessage: (message: UIMessage) => void
  failedUserMessage: () => UIMessage | null
  error: () => Error | undefined
}

export function ChatThreadMessageList(props: ChatThreadMessageListProps) {
  let scrollContainerRef: HTMLDivElement | undefined
  let scrollFrame: number | null = null
  const [shouldAutoScroll, setShouldAutoScroll] = createSignal(true)

  function latestUserMessageId() {
    const messages = props.messages()
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].id
    }
    return messages[messages.length - 1]?.id
  }

  function getScrollTargetTop() {
    const container = scrollContainerRef
    const targetId = latestUserMessageId()
    if (!container || !targetId) return 0
    const target = container.querySelector<HTMLElement>(
      `[data-message-id="${targetId}"]`,
    )
    if (!target) return container.scrollHeight
    return Math.max(target.offsetTop - 16, 0)
  }

  function syncAutoScrollState() {
    const container = scrollContainerRef
    if (!container) return
    setShouldAutoScroll(Math.abs(container.scrollTop - getScrollTargetTop()) <= 96)
  }

  function scheduleScrollToLatestUser() {
    if (scrollFrame != null) cancelAnimationFrame(scrollFrame)
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null
      scrollContainerRef?.scrollTo({ top: getScrollTargetTop() })
      syncAutoScrollState()
    })
  }

  function getLastMessageScrollKey(message: ChatUIMessage | undefined) {
    if (!message) return 'empty'
    const partKey = message.parts
      .map((part) => {
        switch (part.type) {
          case 'text':
          case 'thinking':
          case 'tool-result':
            return `${part.type}:${part.content.length}:${part.content.slice(-32)}`
          case 'tool-call':
            return `${part.type}:${part.name}:${part.arguments.length}`
          case 'image':
            return `${part.type}`
          case 'document': {
            const filename = (part.metadata as { filename?: string } | undefined)?.filename
            return `${part.type}:${filename ?? ''}`
          }
          default:
            return part.type
        }
      })
      .join('|')
    return `${message.id}:${message.role}:${partKey}`
  }

  onMount(() => {
    syncAutoScrollState()
    scheduleScrollToLatestUser()
  })

  onCleanup(() => {
    if (scrollFrame != null) cancelAnimationFrame(scrollFrame)
  })

  createEffect(() => {
    const messages = props.messages()
    const lastMessage = messages[messages.length - 1]
    getLastMessageScrollKey(lastMessage)
    props.isLoading()
    props.error()?.message
    if (!shouldAutoScroll()) return
    scheduleScrollToLatestUser()
  })

  return (
    <div
      ref={scrollContainerRef}
      class="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-6"
      onScroll={syncAutoScrollState}
    >
      <MessageFeed props={props} />
      <ErrorBanner props={props} />
    </div>
  )
}

function MessageFeed(props: { props: ChatThreadMessageListProps }) {
  return (
    <For each={props.props.messages()}>
      {(message, index) => (
        <ChatMessageCard
          message={message}
          index={index}
          props={props.props}
        />
      )}
    </For>
  )
}

function ChatMessageCard(props: {
  message: ChatUIMessage
  index: () => number
  props: ChatThreadMessageListProps
}) {
  return (
    <article
      data-message-id={props.message.id}
      class="flex"
      classList={{
        'justify-end': props.message.role === 'user',
        'justify-start': props.message.role !== 'user',
      }}
    >
      <div
        class="flex max-w-[min(100%,42rem)] flex-col gap-1"
        classList={{
          'items-end': props.message.role === 'user',
          'items-start': props.message.role !== 'user',
        }}
      >
        <MessageBubble
          message={props.message}
          streaming={
            props.message.role === 'assistant' &&
            props.props.isLoading() &&
            props.index() === props.props.lastAssistantMessageIndex()
          }
        />
        <AssistantUsageLine
          message={props.message}
          isLastAssistantMessage={
            props.index() === props.props.lastAssistantMessageIndex()
          }
          sessionTotalSuffix={props.props.sessionTotalSuffix}
        />
        <UserResendButton
          message={props.message}
          isLoading={props.props.isLoading}
          failedUserMessage={props.props.failedUserMessage}
          onResendUserMessage={props.props.onResendUserMessage}
        />
      </div>
    </article>
  )
}

function MessageBubble(props: {
  message: ChatUIMessage
  streaming: boolean
}) {
  return (
    <div
      class="rounded-2xl px-4 py-3 text-sm shadow-sm"
      classList={{
        'bg-[var(--primary)] text-[var(--primary-foreground)]':
          props.message.role === 'user',
        'border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)]':
          props.message.role === 'assistant',
        'bg-[var(--muted)] text-[var(--muted-foreground)]':
          props.message.role === 'system',
      }}
    >
      <MessageParts message={props.message} streaming={props.streaming} />
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
      when={props.message.role === 'assistant' ? props.message.tokenUsage : false}
      keyed
    >
      {(usage) => (
        <p
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
  onResendUserMessage: (message: UIMessage) => void
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
        class="text-primary-foreground/85 hover:text-primary-foreground inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-40"
        disabled={props.isLoading()}
        aria-label={
          props.failedUserMessage()?.id === props.message.id
            ? 'Retry this failed message'
            : 'Resend this message'
        }
        onClick={() => void props.onResendUserMessage(props.message)}
      >
        <RotateCw class="size-3 shrink-0" aria-hidden={true} />
        {props.failedUserMessage()?.id === props.message.id ? 'Retry' : 'Resend'}
      </button>
    </Show>
  )
}

function ErrorBanner(props: { props: ChatThreadMessageListProps }) {
  return (
    <Show when={props.props.error()} keyed>
      {(err) => (
        <div class="bg-destructive/10 text-destructive flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm">
          <span>{err.message}</span>
          <Show when={props.props.failedUserMessage()} keyed>
            {(message) => (
              <button
                type="button"
                class="border-destructive/30 hover:bg-destructive/10 rounded-lg border px-2.5 py-1 text-xs font-medium text-current disabled:pointer-events-none disabled:opacity-50"
                disabled={props.props.isLoading()}
                onClick={() => void props.props.onResendUserMessage(message)}
              >
                Retry
              </button>
            )}
          </Show>
        </div>
      )}
    </Show>
  )
}
