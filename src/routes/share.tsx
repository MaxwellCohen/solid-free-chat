import { For, Match, Show, Switch, createSignal, onCleanup, onMount } from 'solid-js'
import { Link, createFileRoute } from '@tanstack/solid-router'
import type { ChatUIMessage } from '../store/chat.store'
import {
  decodeSharedChat,
  sharedChatToUIMessages,
  type SharedChatV1,
} from '../lib/chat-share'
import { MessageParts } from '../components/chat/ChatMessageParts'

export const Route = createFileRoute('/share')({
  component: SharePage,
  head: () => ({
    meta: [{ title: 'Shared chat · Solid Free Chat' }],
  }),
})

type ShareViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; chat: SharedChatV1; messages: ChatUIMessage[] }

function SharePage() {
  const [view, setView] = createSignal<ShareViewState>({ status: 'loading' })

  onMount(() => {
    void loadFromHash()
    const onHashChange = () => {
      void loadFromHash()
    }
    window.addEventListener('hashchange', onHashChange)
    onCleanup(() => window.removeEventListener('hashchange', onHashChange))
  })

  async function loadFromHash() {
    const hash = window.location.hash
    if (!hash || hash === '#' || hash === '#v1.') {
      setView({
        status: 'error',
        message: 'This share link is invalid or incomplete.',
      })
      return
    }
    const chat = await decodeSharedChat(hash)
    if (!chat) {
      setView({
        status: 'error',
        message: 'This share link is invalid or incomplete.',
      })
      return
    }
    setView({
      status: 'ready',
      chat,
      messages: sharedChatToUIMessages(chat),
    })
  }

  return (
    <main class="mx-auto flex w-full max-w-3xl flex-col px-3 py-6 sm:px-6 sm:py-10">
      <Switch>
        <Match when={view().status === 'loading'}>
          <p class="text-muted-foreground text-sm">Loading shared chat…</p>
        </Match>
        <Match when={view().status === 'error' ? view() : null} keyed>
          {(state) =>
            state.status === 'error' ? (
              <section class="border-border bg-card text-card-foreground rounded-2xl border p-6 shadow-sm">
                <h1 class="text-foreground mb-2 text-xl font-semibold tracking-tight">
                  Shared chat
                </h1>
                <p class="text-muted-foreground mb-4 text-sm">{state.message}</p>
                <Link
                  to="/"
                  class="text-primary text-sm font-medium underline-offset-4 hover:underline"
                >
                  Back to chat
                </Link>
              </section>
            ) : null
          }
        </Match>
        <Match when={view().status === 'ready' ? view() : null} keyed>
          {(state) =>
            state.status === 'ready' ? (
              <SharedChatView chat={state.chat} messages={state.messages} />
            ) : null
          }
        </Match>
      </Switch>
    </main>
  )
}

function SharedChatView(props: {
  chat: SharedChatV1
  messages: ChatUIMessage[]
}) {
  return (
    <section class="flex min-h-0 flex-col gap-4">
      <div class="border-border bg-muted/40 rounded-xl border px-4 py-3">
        <p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Read-only shared chat
        </p>
        <h1 class="text-foreground mt-1 text-xl font-semibold tracking-tight">
          {props.chat.title}
        </h1>
        <p class="text-muted-foreground mt-1 truncate text-sm">
          Model: {props.chat.model}
        </p>
        <Link
          to="/"
          class="text-primary mt-3 inline-block text-sm font-medium underline-offset-4 hover:underline"
        >
          Open Solid Free Chat
        </Link>
      </div>

      <div class="flex flex-col gap-4 pb-8">
        <Show
          when={props.messages.length > 0}
          fallback={
            <p class="text-muted-foreground text-sm">No messages in this share.</p>
          }
        >
          <For each={props.messages}>
            {(message) => <SharedMessageBubble message={message} />}
          </For>
        </Show>
      </div>
    </section>
  )
}

function SharedMessageBubble(props: { message: ChatUIMessage }) {
  return (
    <article
      class="flex w-full"
      classList={{
        'justify-end': props.message.role === 'user',
        'justify-start': props.message.role !== 'user',
      }}
    >
      <div
        class="max-w-[min(100%,42rem)] rounded-2xl px-4 py-3 text-sm shadow-sm"
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
    </article>
  )
}
