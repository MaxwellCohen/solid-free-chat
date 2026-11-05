import { createFileRoute, Link, useNavigate } from '@tanstack/solid-router'
import { For, Show, createMemo, createSignal, onSettled } from 'solid-js'

import { MessageParts } from '../components/chat/ChatMessageParts'
import { Check, Copy, Star } from '../components/icons'
import { collectBookmarks } from '../lib/bookmarks'
import type { SavedMessage } from '../lib/bookmarks'
import {
  loadChatStateAsync,
  persistChatStateAsync,
  startChatPersistence,
} from '../lib/chat-persistence'
import { requestScrollToMessage } from '../lib/scroll-to-message'
import { chatActions } from '../store/chat.store'
import { useChatStore } from '../store/chat.hooks'

export const Route = createFileRoute('/saved')({
  component: SavedPage,
})

const BTN =
  'text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium underline-offset-2 hover:underline'

function SavedCard(props: { item: SavedMessage }) {
  const navigate = useNavigate()
  const [copied, setCopied] = createSignal(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(props.item.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  async function open() {
    chatActions.setCurrentConversationId(props.item.conversationId)
    // Flush so the chat page hydrates onto this conversation.
    await persistChatStateAsync()
    requestScrollToMessage(props.item.messageId)
    void navigate({ to: '/' })
  }

  return (
    <article
      class="border-border bg-card text-card-foreground rounded-xl border p-4"
      data-testid="saved-message"
    >
      <div class="text-muted-foreground mb-2 flex items-center justify-between gap-2 text-xs">
        <span class="truncate font-medium">{props.item.conversationTitle}</span>
        <span class="shrink-0 capitalize">{props.item.role}</span>
      </div>
      <div class="max-h-72 overflow-y-auto text-sm [overflow-wrap:anywhere]">
        <MessageParts message={props.item.message} />
      </div>
      <div class="mt-3 flex items-center gap-1">
        <button type="button" class={BTN} onClick={() => void copy()}>
          <Show
            when={copied()}
            fallback={<Copy class="size-3" aria-hidden="true" />}
          >
            <Check class="size-3" aria-hidden="true" />
          </Show>
          {copied() ? 'Copied' : 'Copy'}
        </button>
        <button type="button" class={BTN} onClick={() => void open()}>
          Open in chat
        </button>
        <button
          type="button"
          class={BTN}
          onClick={() =>
            chatActions.toggleMessageBookmark(
              props.item.conversationId,
              props.item.messageId,
            )
          }
        >
          <Star class="size-3 fill-current" aria-hidden="true" />
          Remove
        </button>
      </div>
    </article>
  )
}

function SavedPage() {
  const [loaded, setLoaded] = createSignal(false)
  const state = useChatStore()
  const items = createMemo(() => collectBookmarks(state()))

  onSettled(() => {
    let stop: (() => void) | undefined
    const life = { disposed: false }
    void (async () => {
      // Already hydrated when arriving from the chat page.
      if (chatActions.isEmpty()) {
        const saved = await loadChatStateAsync()
        if (saved) chatActions.hydrate(saved)
      }
      if (life.disposed) return
      stop = startChatPersistence()
      setLoaded(true)
    })()
    return () => {
      life.disposed = true
      stop?.()
    }
  })

  return (
    <main class="mx-auto max-w-3xl px-4 py-8">
      <h1 class="text-foreground mb-4 text-3xl font-bold tracking-tight">
        Saved messages
      </h1>
      <Show when={loaded()}>
        <Show
          when={items().length > 0}
          fallback={
            <p class="text-muted-foreground">
              Nothing saved yet. Use the Save button under a message in{' '}
              <Link
                to="/"
                class="text-primary underline underline-offset-4"
              >
                a chat
              </Link>
              .
            </p>
          }
        >
          <div class="space-y-3">
            <For each={items()} keyed={false}>
              {(item) => <SavedCard item={item()} />}
            </For>
          </div>
        </Show>
      </Show>
    </main>
  )
}
