import { For, Show, onMount } from 'solid-js'
import type { UIMessage } from '@tanstack/ai-solid'
import { createVirtualizer } from '@tanstack/solid-virtual'
import type { VirtualItem, Virtualizer } from '@tanstack/solid-virtual'
import { RotateCw } from 'lucide-solid'
import type { ChatUIMessage } from '../../store/chat.store'
import { formatReplyTokenLine, userMessageToResendParts } from './chat-thread-utils'
import { MessageParts } from './ChatMessageParts'

const MESSAGE_GAP_PX = 16
const ESTIMATED_MESSAGE_HEIGHT_PX = 96
const SCROLL_END_THRESHOLD_PX = 96

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

  const virtualizer = createVirtualizer({
    get count() {
      return props.messages().length
    },
    getScrollElement: () => scrollContainerRef ?? null,
    estimateSize: () => ESTIMATED_MESSAGE_HEIGHT_PX,
    getItemKey: (index) => props.messages()[index]?.id ?? index,
    anchorTo: 'end',
    followOnAppend: true,
    scrollEndThreshold: SCROLL_END_THRESHOLD_PX,
    gap: MESSAGE_GAP_PX,
    overscan: 6,
  })

  onMount(() => {
    virtualizer.scrollToEnd()
  })

  return (
    <div
      ref={(el) => {
        scrollContainerRef = el
      }}
      class="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6"
    >
      <div
        class="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        <For each={virtualizer.getVirtualItems()}>
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
  virtualItem: VirtualItem
  virtualizer: Virtualizer<HTMLDivElement, Element>
  listProps: ChatThreadMessageListProps
}) {
  // Read from the live messages list so streaming updates stay reactive
  // even though virtual items themselves do not change identity.
  const message = () => props.listProps.messages()[props.virtualItem.index]

  return (
    <Show when={message()}>
      {(msg) => (
        <article
          data-index={props.virtualItem.index}
          data-message-id={msg().id}
          ref={(el) => {
            // Solid assigns refs before the node is connected; defer measurement.
            queueMicrotask(() => props.virtualizer.measureElement(el))
          }}
          class="absolute top-0 left-0 flex w-full"
          classList={{
            'justify-end': msg().role === 'user',
            'justify-start': msg().role !== 'user',
          }}
          style={{
            transform: `translateY(${props.virtualItem.start}px)`,
          }}
        >
          <div
            class="flex max-w-[min(100%,42rem)] flex-col gap-1"
            classList={{
              'items-end': msg().role === 'user',
              'items-start': msg().role !== 'user',
            }}
          >
            <MessageBubble message={msg()} />
            <AssistantUsageLine
              message={msg()}
              isLastAssistantMessage={
                props.virtualItem.index ===
                props.listProps.lastAssistantMessageIndex()
              }
              sessionTotalSuffix={props.listProps.sessionTotalSuffix}
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
        class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-40"
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
        <div class="bg-destructive/10 text-destructive mt-4 flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm">
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
