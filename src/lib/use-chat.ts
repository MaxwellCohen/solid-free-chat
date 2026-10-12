import { ChatClient } from '@tanstack/ai-client'
import type {
  ChatClientOptions,
  ChatClientState,
  ConnectionStatus,
  DistributedOmit,
  MultimodalContent,
  QueuedMessage,
  SendMessageOptions,
  UIMessage,
} from '@tanstack/ai-client'
import type { ModelMessage } from '@tanstack/ai'
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onSettled,
  untrack,
} from 'solid-js'

type ManagedCallbacks =
  | 'onMessagesChange'
  | 'onLoadingChange'
  | 'onErrorChange'
  | 'onStatusChange'
  | 'onSubscriptionChange'
  | 'onConnectionStatusChange'
  | 'onSessionGeneratingChange'
  | 'onQueueChange'

export type UseChatOptions = DistributedOmit<ChatClientOptions, ManagedCallbacks> & {
  live?: boolean
}

let chatHookSeq = 0

function nextChatHookId() {
  chatHookSeq += 1
  return `chat-${chatHookSeq.toString(36)}`
}

/**
 * Solid 2 port of `@tanstack/ai-solid`'s `useChat`.
 * The published package still calls Solid 1 `onMount` and single-argument `createEffect`.
 */
export function useChat(options: UseChatOptions) {
  const clientId = options.id || nextChatHookId()
  const [messages, setMessages] = createSignal<UIMessage[]>(
    options.initialMessages ?? [],
  )
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<Error | undefined>(undefined)
  const [status, setStatus] = createSignal<ChatClientState>('ready')
  const [isSubscribed, setIsSubscribed] = createSignal(false)
  const [connectionStatus, setConnectionStatus] =
    createSignal<ConnectionStatus>('disconnected')
  const [sessionGenerating, setSessionGenerating] = createSignal(false)
  const [queue, setQueue] = createSignal<QueuedMessage[]>([])

  const client = createMemo(() => {
    const { live: _live, connection, fetcher: _fetcher, devtools, ...rest } = options
    void _live
    void _fetcher
    const shared = {
      ...rest,
      id: clientId,
      devtools: {
        ...devtools,
        framework: 'solid' as const,
        hookName: 'useChat',
        outputKind: 'chat' as const,
      },
      onMessagesChange: (next: UIMessage[]) => {
        setMessages(next)
      },
      onLoadingChange: (next: boolean) => {
        setIsLoading(next)
      },
      onStatusChange: (next: ChatClientState) => {
        setStatus(next)
      },
      onErrorChange: (next: Error | undefined) => {
        setError(next)
      },
      onSubscriptionChange: (next: boolean) => {
        setIsSubscribed(next)
      },
      onConnectionStatusChange: (next: ConnectionStatus) => {
        setConnectionStatus(next)
      },
      onSessionGeneratingChange: (next: boolean) => {
        setSessionGenerating(next)
      },
      onQueueChange: (next: QueuedMessage[]) => {
        setQueue(next)
      },
    }
    if (!connection) {
      throw new Error('useChat requires a connection')
    }
    return new ChatClient({ ...shared, connection })
  })

  createEffect(
    () => ({
      current: client(),
      body: options.body,
      forwardedProps: options.forwardedProps,
      context: options.context,
      queue: options.queue,
    }),
    (next) => {
      next.current.updateOptions({
        ...(next.body !== undefined ? { body: next.body } : {}),
        ...(next.forwardedProps !== undefined
          ? { forwardedProps: next.forwardedProps }
          : {}),
        context: next.context,
        ...(next.queue !== undefined ? { queue: next.queue } : {}),
      })
    },
  )

  createEffect(
    () => ({ live: Boolean(options.live), current: client() }),
    ({ live, current }) => {
      if (live) current.subscribe()
      else current.unsubscribe()
    },
  )

  onSettled(() => {
    client().mountDevtools()
  })

  onCleanup(() => {
    const current = untrack(client)
    if (options.live) current.unsubscribe()
    else current.stop()
    current.dispose()
  })

  const activeStructuredPart = createMemo(() => {
    const list = messages()
    let lastUserIndex = -1
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]?.role === 'user') {
        lastUserIndex = i
        break
      }
    }
    if (lastUserIndex === -1) return null
    for (let i = list.length - 1; i > lastUserIndex; i--) {
      const message = list[i]
      if (message?.role !== 'assistant') continue
      const part = message.parts.find((entry) => entry.type === 'structured-output')
      if (part) return part
    }
    return null
  })

  return {
    messages,
    queue,
    sendMessage: async (
      content: string | MultimodalContent,
      sendOptions?: SendMessageOptions,
    ) => {
      await client().sendMessage(content, undefined, sendOptions)
    },
    append: async (message: ModelMessage | UIMessage) => {
      await client().append(message)
    },
    reload: async () => {
      await client().reload()
    },
    stop: () => {
      client().stop()
    },
    isLoading,
    error,
    status,
    isSubscribed,
    connectionStatus,
    sessionGenerating,
    setMessages: (next: UIMessage[]) => {
      client().setMessagesManually(next)
    },
    clear: () => {
      client().clear()
    },
    addToolResult: async (result: {
      toolCallId: string
      tool: string
      output: unknown
      state?: 'output-available' | 'output-error'
      errorText?: string
    }) => {
      await client().addToolResult(result)
    },
    addToolApprovalResponse: async (response: {
      id: string
      approved: boolean
    }) => {
      await client().addToolApprovalResponse(response)
    },
    cancelQueued: (id: string) => client().cancelQueued(id),
    partial: createMemo((): Record<string, unknown> => {
      const part = activeStructuredPart()
      if (!part || part.type !== 'structured-output') return {}
      const value = part.partial ?? part.data ?? {}
      if (value && typeof value === 'object') return value as Record<string, unknown>
      return {}
    }),
    final: createMemo(() => {
      const part = activeStructuredPart()
      if (!part || part.type !== 'structured-output' || part.status !== 'complete') {
        return null
      }
      return part.data
    }),
  }
}
