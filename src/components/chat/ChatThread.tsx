import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { stream, useChat } from '@tanstack/ai-solid'
import type { UIMessage } from '@tanstack/ai-solid'
import { useServerFn } from '@tanstack/solid-start'
import { streamOpenRouterChat } from '../../server/openrouter-fns'
import { chatActions, chatStore } from '../../store/chat.store'
import { renderMarkdownToHtml } from '../../lib/markdown'

type StreamFactory = Parameters<typeof stream>[0]
type StreamChunk =
  Awaited<
    ReturnType<StreamFactory>[typeof Symbol.asyncIterator]
  > extends AsyncIterator<infer T>
    ? T
    : never

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  if (value == null || typeof value !== 'object') return false
  return (
    typeof (value as { [Symbol.asyncIterator]?: unknown })[
      Symbol.asyncIterator
    ] === 'function'
  )
}

export default function ChatThread(props: {
  conversationId: string
  initialMessages: UIMessage[]
}) {
  const [draft, setDraft] = createSignal('')
  const streamChat = useServerFn(streamOpenRouterChat)

  const chat = useChat({
    id: props.conversationId,
    initialMessages: props.initialMessages,
    connection: stream(async function* (messages, data) {
      const chunks = await streamChat({
        data: {
          messages,
          data: {
            ...data,
            model: chatStore.state.selectedModel,
          },
        },
      })
      if (!isAsyncIterable<StreamChunk>(chunks)) {
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
    chatActions.setConversationMessages(props.conversationId, chat.messages())
  })

  async function onSubmit(e: Event) {
    e.preventDefault()
    const text = draft().trim()
    if (!text || chat.isLoading()) return
    setDraft('')
    await chat.sendMessage(text)
  }

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
        <div class="mx-auto flex max-w-3xl gap-2">
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
              disabled={chat.isLoading() || !draft().trim()}
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

function TextPart(props: { role: UIMessage['role']; content: string }) {
  if (props.role === 'assistant') {
    return (
      <div
        class="chat-md"
        innerHTML={renderMarkdownToHtml(props.content)}
      ></div>
    )
  }
  return <p class="whitespace-pre-wrap">{props.content}</p>
}
