import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  onCleanup,
  onMount,
} from 'solid-js'
import { loadChatState, startChatPersistence } from '../../lib/chat-persistence'
import { DEFAULT_CHAT_MODEL } from '../../lib/chat-models'
import { getFreeChatModels } from '../../server/openrouter-fns'
import { useChatActions, useChatStore } from '../../store/chat.hooks'
import { NEW_CHAT_TITLE } from '../../store/chat.store'
import ChatThread from './ChatThread'

export default function ChatApp() {
  const state = useChatStore()
  const actions = useChatActions()
  const [modelList] = createResource(() => getFreeChatModels())

  createEffect(() => {
    const list = modelList()
    if (!list?.length) return
    const ids = new Set(list.map((m) => m.id))
    if (!ids.has(state().selectedModel)) {
      actions.setSelectedModel(list[0].id)
    }
  })

  onMount(() => {
    const saved = loadChatState()
    if (saved) {
      actions.hydrate(saved)
    }
    actions.ensureDefaultConversation()
    const stopPersist = startChatPersistence()
    onCleanup(stopPersist)
  })

  /** Options from API, plus the current selection if missing (so `<select>` always has a matching `<option>`). */
  const selectOptions = createMemo(() => {
    if (modelList.loading || modelList.error) return []
    const fromApi = modelList() ?? []
    const id = state().selectedModel
    if (!id) return fromApi
    if (fromApi.some((o) => o.id === id)) return fromApi
    return [
      ...fromApi,
      {
        id,
        name:
          id === DEFAULT_CHAT_MODEL
            ? `${id} (fallback)`
            : `${id} (saved; not in free list)`,
      },
    ]
  })

  const selectDisabled = () => {
    if (modelList.loading || modelList.error) return true
    return selectOptions().length === 0
  }

  return (
    <div class="flex h-[calc(100dvh-3.75rem)] min-h-[calc(100dvh-3.75rem)] w-full max-w-[100vw] flex-col sm:flex-row">
      <aside class="border-border flex w-full shrink-0 flex-col border-b sm:w-64 sm:border-r sm:border-b-0 md:w-72">
        <div class="flex items-center justify-between gap-2 p-3">
          <h2 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Chats
          </h2>
          <button
            type="button"
            class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-2.5 py-1.5 text-xs font-medium"
            onClick={() => actions.createConversation()}
          >
            New
          </button>
        </div>
        <nav class="max-h-40 overflow-y-auto sm:max-h-none sm:flex-1">
          <ul class="space-y-0.5 px-2 pb-3">
            <For each={state().conversations}>
              {(c) => (
                <li class="flex items-stretch gap-0.5">
                  <button
                    type="button"
                    class="hover:bg-muted min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-sm"
                    classList={{
                      'bg-muted font-medium':
                        state().currentConversationId === c.id,
                    }}
                    onClick={() => actions.setCurrentConversationId(c.id)}
                  >
                    <span class="truncate">{c.title || NEW_CHAT_TITLE}</span>
                  </button>
                  <button
                    type="button"
                    title="Delete chat"
                    class="text-muted-foreground hover:text-destructive hover:bg-muted shrink-0 rounded-lg px-2 text-sm"
                    onClick={() => actions.deleteConversation(c.id)}
                  >
                    ×
                  </button>
                </li>
              )}
            </For>
          </ul>
        </nav>
      </aside>

      <section class="flex min-h-0 min-w-0 flex-1 flex-col">
        <header class="border-border flex shrink-0 flex-wrap items-center gap-3 border-b px-3 py-3 sm:px-6">
          <label class="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <span class="whitespace-nowrap">Model</span>
            <select
              class="border-input bg-background min-w-48 max-w-[min(100%,24rem)] rounded-lg border px-2 py-1.5 text-sm"
              value={state().selectedModel}
              disabled={selectDisabled()}
              onChange={(e) => actions.setSelectedModel(e.currentTarget.value)}
            >
              <Show when={modelList.loading}>
                <option value={state().selectedModel}>Loading models…</option>
              </Show>
              <Show when={modelList.error}>
                <option value={state().selectedModel}>
                  Could not load models
                </option>
              </Show>
              <Show when={!modelList.loading && !modelList.error}>
                <For each={selectOptions()}>
                  {(m) => (
                    <option value={m.id}>
                      {m.name} ({m.id})
                    </option>
                  )}
                </For>
              </Show>
            </select>
            <Show when={modelList.error}>
              <span class="text-destructive max-w-xs text-xs">
                {modelList.error.message}
              </span>
            </Show>
            <Show
              when={
                !modelList.loading &&
                !modelList.error &&
                modelList() !== undefined &&
                modelList()!.length === 0
              }
            >
              <span class="text-muted-foreground text-xs">
                No free text models returned for your API key.
              </span>
            </Show>
          </label>
          <p class="text-muted-foreground text-xs sm:ml-auto">
            Stored locally in this browser · API key on server
          </p>
        </header>

        <Show when={state().currentConversationId} keyed>
          {(id) => {
            const conv = state().conversations.find((c) => c.id === id)
            const initial = conv?.messages ?? []
            return <ChatThread conversationId={id} initialMessages={initial} />
          }}
        </Show>
      </section>
    </div>
  )
}
